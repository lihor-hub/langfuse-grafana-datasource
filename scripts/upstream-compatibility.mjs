import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { githubCli } from './upstream-gh.mjs';
const root = new URL('../', import.meta.url);
const sha = /^[a-f\d]{40}$/;
const tracks = ['langfuse', 'grafana'];

export function fingerprint(value) {
  const canonical = (item) => {
    if (Array.isArray(item)) {
      return item.map(canonical);
    }
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, canonical(item[key])])
      );
    }
    return item;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function selectReleases(releases, source) {
  if (!Array.isArray(releases)) {
    throw new Error(`Invalid release response for ${source.id}`);
  }
  const versionOf = (tag) =>
    source.tagPrefix === null
      ? tag.match(/(?:^|[/@])v?(\d+\.\d+\.\d+)$/)?.[1]
      : tag.startsWith(source.tagPrefix)
        ? tag.slice(source.tagPrefix.length)
        : null;
  const stable = releases.filter((release) => {
    if (release.draft || release.prerelease || typeof release.tag_name !== 'string') {
      return false;
    }
    const version = versionOf(release.tag_name);
    return version && semver.valid(version) && !semver.prerelease(version);
  });
  if (!stable.length) {
    throw new Error(`No stable release found for ${source.id}`);
  }
  const recent = [...stable]
    .sort(
      (a, b) => String(b.published_at).localeCompare(String(a.published_at)) || a.tag_name.localeCompare(b.tag_name)
    )
    .slice(0, 10);
  stable.sort((a, b) => semver.rcompare(versionOf(a.tag_name), versionOf(b.tag_name)));
  const latest = source.tagPrefix === null ? recent[0] : stable[0];
  if (!recent.includes(latest)) {
    recent.push(latest);
  }
  return { latest, recent };
}

export function contractSnapshot(tree, source, contract) {
  if (!sha.test(source.commit)) {
    throw new Error('Contract source requires an immutable commit');
  }
  if (tree.truncated !== false || !Array.isArray(tree.tree)) {
    throw new Error('Missing or truncated upstream contract tree');
  }
  const entries = tree.tree.filter(
    (entry) => entry.type === 'blob' && entry.path.startsWith(contract.prefix) && /\.ya?ml$/.test(entry.path)
  );
  const files = Object.fromEntries(
    entries
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((entry) => {
        if (!sha.test(entry.sha)) {
          throw new Error(`Invalid contract blob: ${entry.path}`);
        }
        return [entry.path, entry.sha];
      })
  );
  for (const path of contract.required) {
    if (!files[contract.prefix + path]) {
      throw new Error(`Missing required contract: ${path}`);
    }
  }
  return {
    track: contract.track,
    repository: source.repository,
    commit: source.commit,
    url: `https://github.com/${source.repository}/tree/${source.commit}/${contract.prefix}`,
    files,
    fingerprint: fingerprint(files),
  };
}

async function github(endpoint) {
  return JSON.parse(await githubCli(['api', '--method', 'GET', endpoint]));
}

export async function scan(config, pkg, api = github) {
  const cache = new Map();
  const request = (endpoint) => {
    if (!cache.has(endpoint)) {
      cache.set(
        endpoint,
        Promise.resolve().then(() => api(endpoint))
      );
    }
    return cache.get(endpoint);
  };
  const sources = {};
  for (const source of config.sources) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(source.repository)) {
      throw new Error('Invalid upstream repository');
    }
    const releases = [];
    let selection;
    for (let page = 1; page <= 5; page++) {
      const batch = await request(`repos/${source.repository}/releases?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) {
        throw new Error(`Invalid release response for ${source.id}`);
      }
      releases.push(...batch);
      try {
        selection = selectReleases(releases, source);
      } catch {
        if (batch.length < 100 || page === 5) {
          throw new Error(`No stable release for ${source.id} within the bounded release feed`);
        }
        continue;
      }
      break;
    }
    const { latest, recent } = selection;
    const resolved = await request(`repos/${source.repository}/commits/${encodeURIComponent(latest.tag_name)}`);
    if (!sha.test(resolved.sha)) {
      throw new Error(`Cannot resolve stable release commit for ${source.id}`);
    }
    const evidence = recent.map((release) => ({
      id: release.id,
      tag: release.tag_name,
      publishedAt: release.published_at,
      url: release.html_url,
      notesHash: fingerprint(release.body ?? ''),
    }));
    sources[source.id] = {
      track: source.track,
      repository: source.repository,
      tag: latest.tag_name,
      commit: resolved.sha,
      url: latest.html_url,
      recentReleases: evidence,
      fingerprint: fingerprint({ commit: resolved.sha, releases: evidence }),
    };
  }
  const source = sources[config.contracts.releaseSource];
  if (!source) {
    throw new Error('Missing Langfuse stable source');
  }
  const tree = await request(`repos/${source.repository}/git/trees/${source.commit}?recursive=1`);
  sources[config.contracts.id] = contractSnapshot(tree, source, config.contracts);
  const installed = Object.fromEntries(
    Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) =>
      /^@(grafana|langfuse)\//.test(name)
    )
  );
  return { schemaVersion: 1, scannedAt: new Date().toISOString(), installed, sources };
}

export function validateSnapshot(snapshot, config) {
  const expected = [...config.sources, config.contracts];
  const keys = expected.map((source) => source.id).sort();
  if (
    snapshot?.schemaVersion !== 1 ||
    !snapshot.sources ||
    JSON.stringify(Object.keys(snapshot.sources).sort()) !== JSON.stringify(keys)
  ) {
    throw new Error('Snapshot sources do not match configuration; explicit baseline review required');
  }
  for (const source of expected) {
    const entry = snapshot.sources[source.id];
    if (entry.track !== source.track) {
      throw new Error(`Invalid track for ${source.id}`);
    }
    if (!/^[a-f\d]{64}$/.test(entry.fingerprint)) {
      throw new Error(`Invalid fingerprint for ${source.id}`);
    }
  }
}

export function plan(current, baseline, openPrs, config, audit = false) {
  validateSnapshot(current, config);
  validateSnapshot(baseline, config);
  if (!Array.isArray(openPrs) || openPrs.some((pr) => typeof pr.body !== 'string')) {
    throw new Error('Invalid open PR response');
  }
  const blockedTracks = tracks.filter((track) =>
    openPrs.some((pr) => pr.body.includes(`<!-- upstream-compatibility:${track} -->`))
  );
  const changed = Object.keys(current.sources).filter(
    (id) => audit || current.sources[id].fingerprint !== baseline.sources[id].fingerprint
  );
  const candidates = tracks
    .map((track) => ({ track, sources: changed.filter((id) => current.sources[id].track === track) }))
    .filter((candidate) => candidate.sources.length && !blockedTracks.includes(candidate.track));
  if (!changed.includes(config.contracts.id)) {
    candidates.sort((a, b) => b.sources.length - a.sources.length);
  }
  return {
    schemaVersion: 1,
    audit,
    changedSources: changed,
    blockedTracks,
    target: candidates[0] ?? null,
    deferred: candidates.slice(1),
    evidence: current,
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { output: { type: 'string' }, input: { type: 'string' }, all: { type: 'boolean', default: false } },
  });
  const config = JSON.parse(await readFile(new URL('.github/upstream-compatibility.json', root)));
  let result;
  if (positionals.length === 1 && positionals[0] === 'scan' && !values.input && !values.all) {
    result = await scan(config, JSON.parse(await readFile(new URL('package.json', root))));
  } else if (positionals.length === 1 && positionals[0] === 'plan' && values.input) {
    const pages = JSON.parse(
      await githubCli([
        'api',
        '--method',
        'GET',
        '--paginate',
        '--slurp',
        `repos/${config.repository}/pulls?state=open&per_page=100`,
      ])
    );
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
      throw new Error('Invalid PR pagination');
    }
    result = plan(
      JSON.parse(await readFile(values.input)),
      JSON.parse(await readFile(new URL('.github/upstream-compatibility-baseline.json', root))),
      pages.flat(),
      config,
      values.all
    );
  } else {
    throw new Error(
      'Usage: upstream-compatibility.mjs scan [--output FILE] | plan --input FILE [--all] [--output FILE]'
    );
  }
  const json = JSON.stringify(result, null, 2) + '\n';
  if (values.output) {
    await writeFile(values.output, json);
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Upstream check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
