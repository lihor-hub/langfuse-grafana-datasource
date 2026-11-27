import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isAbsolute } from 'node:path';
import { githubCli, githubEnvironment } from './upstream-gh.mjs';
import {
  contractSnapshot,
  fingerprint,
  plan,
  scan,
  selectReleases,
  validateSnapshot,
} from './upstream-compatibility.mjs';

const config = JSON.parse(await readFile(new URL('../.github/upstream-compatibility.json', import.meta.url)));
const release = (tag, options = {}) => ({
  id: tag,
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: '2026-11-27T00:00:00Z',
  html_url: 'https://github.com/example/example/releases/tag/' + encodeURIComponent(tag),
  body: 'Release notes',
  ...options,
});
const snapshot = () => ({
  schemaVersion: 1,
  sources: Object.fromEntries(
    [...config.sources, config.contracts].map((s) => [s.id, { track: s.track, fingerprint: fingerprint(s.id) }])
  ),
});

test('release selection ignores drafts, prereleases and unrelated package channels', () => {
  const source = config.sources.find((s) => s.id === 'create-plugin');
  const result = selectReleases(
    [
      release('@grafana/create-plugin@10.0.0'),
      release('@grafana/create-plugin@11.0.0', { draft: true }),
      release('@grafana/create-plugin@12.0.0-rc.1'),
      release('@grafana/create-plugin@13.0.0', { prerelease: true }),
      release('@grafana/plugin-e2e@99.0.0'),
      release('@grafana/create-plugin@9.9.9'),
    ],
    source
  );
  assert.equal(result.latest.tag_name, '@grafana/create-plugin@10.0.0');
  assert.equal(result.recent.length, 2);
});

test('host latest uses semantic versions, while retaining backport releases', () => {
  const result = selectReleases([release('v12.3.12'), release('v13.3.2'), release('v13.2.10')], config.sources[0]);
  assert.equal(result.latest.tag_name, 'v13.3.2');
  assert.equal(result.recent.length, 3);
  assert.throws(() => selectReleases([], config.sources[0]), /stable release/);
});

test('mixed tooling release feeds watch independent action/package names', () => {
  const source = config.sources.find((s) => s.id === 'plugin-actions');
  const result = selectReleases(
    [
      release('is-compatible/v1.1.1', { published_at: '2026-11-28T00:00:00Z' }),
      release('e2e-version/v4.0.1'),
      release('build-plugin/v2.0.3-rc.1'),
    ],
    source
  );
  assert.equal(result.latest.tag_name, 'is-compatible/v1.1.1');
  assert.equal(result.recent.length, 2);
});

test('release note edits change fingerprints; volatile scan timestamps do not enter planning', () => {
  assert.notEqual(fingerprint(release('v1.0.0')), fingerprint(release('v1.0.0', { body: 'Deprecation' })));
  const previous = snapshot();
  assert.equal(plan({ ...previous, scannedAt: 'now' }, previous, [], config).target, null);
});

test('contracts require server definitions, shared types and a complete immutable tree', () => {
  const tree = {
    truncated: false,
    tree: config.contracts.required.map((path, i) => ({
      path: config.contracts.prefix + path,
      type: 'blob',
      sha: String(i).padStart(40, 'a'),
    })),
  };
  const source = { repository: 'langfuse/langfuse', commit: 'a'.repeat(40) };
  const original = contractSnapshot(tree, source, config.contracts);
  assert.equal(Object.keys(original.files).length, 7);
  assert.equal(
    original.fingerprint,
    contractSnapshot({ ...tree, tree: [...tree.tree].reverse() }, source, config.contracts).fingerprint
  );
  assert.throws(() => contractSnapshot({ ...tree, truncated: true }, source, config.contracts), /truncated/);
  assert.throws(() => contractSnapshot({ ...tree, tree: tree.tree.slice(1) }, source, config.contracts), /Missing/);
  assert.throws(() => contractSnapshot(tree, { ...source, commit: 'main' }, config.contracts), /commit/);
});

test('changed Langfuse contracts take priority and unrelated open Grafana PR does not block them', () => {
  const previous = snapshot();
  const current = snapshot();
  current.sources['langfuse-contracts'].fingerprint = fingerprint('changed');
  current.sources.grafana.fingerprint = fingerprint('also changed');
  const prs = [{ body: '<!-- upstream-compatibility:grafana -->' }];
  const result = plan(current, previous, prs, config);
  assert.equal(result.target.track, 'langfuse');
  assert.deepEqual(result.blockedTracks, ['grafana']);
});

test('one open PR per track, including manual initial audits', () => {
  const previous = snapshot();
  const prs = ['grafana', 'langfuse'].map((track) => ({ body: `<!-- upstream-compatibility:${track} -->` }));
  assert.equal(plan(previous, previous, prs, config, true).target, null);
  assert.equal(plan(previous, previous, [], config, true).target.track, 'langfuse');
});

test('plans fail closed for missing sources, invalid hashes, wrong tracks and malformed PR data', () => {
  const previous = snapshot();
  const current = snapshot();
  delete current.sources.grafana;
  assert.throws(() => validateSnapshot(current, config), /sources/);
  current.sources.grafana = { track: 'grafana', fingerprint: 'bad' };
  assert.throws(() => validateSnapshot(current, config), /fingerprint/);
  current.sources.grafana = { track: 'langfuse', fingerprint: fingerprint('good') };
  assert.throws(() => validateSnapshot(current, config), /track/);
  assert.throws(() => plan(previous, previous, null, config), /PR/);
  assert.throws(() => plan(previous, previous, [{}], config), /PR/);
});

test('scan resolves stable tags to exact commits and fails on any upstream error', async () => {
  const tiny = { ...config, sources: [config.sources.find((s) => s.id === 'langfuse')] };
  const calls = [];
  const api = async (endpoint) => {
    calls.push(endpoint);
    if (endpoint.includes('/releases?')) {
      return [release('v4.88.0')];
    }
    if (endpoint.includes('/commits/')) {
      return { sha: 'b'.repeat(40) };
    }
    return {
      truncated: false,
      tree: config.contracts.required.map((path) => ({
        path: config.contracts.prefix + path,
        type: 'blob',
        sha: 'c'.repeat(40),
      })),
    };
  };
  const result = await scan(tiny, { dependencies: { '@langfuse/core': '5.10.0' } }, api);
  assert.equal(result.sources.langfuse.commit, 'b'.repeat(40));
  assert.ok(calls.some((s) => s.includes('/git/trees/' + 'b'.repeat(40))));
  assert.deepEqual(result.installed, { '@langfuse/core': '5.10.0' });
  await assert.rejects(
    scan(tiny, {}, async () => {
      throw new Error('rate limited');
    }),
    /rate limited/
  );
  await assert.rejects(
    scan(tiny, {}, async () => ({})),
    /release/
  );
});

test('scan paginates sparse monorepo channels and fails visibly after its bounded history', async () => {
  const tiny = { ...config, sources: [config.sources.find((s) => s.id === 'langfuse')] };
  const unrelated = Array.from({ length: 100 }, (_, i) => release('other/' + i));
  let pages = 0;
  const api = async (endpoint) => {
    if (endpoint.includes('/releases?')) {
      pages++;
      return pages === 1 ? unrelated : [release('v4.88.0')];
    }
    if (endpoint.includes('/commits/')) {
      return { sha: 'b'.repeat(40) };
    }
    return {
      truncated: false,
      tree: config.contracts.required.map((path) => ({
        path: config.contracts.prefix + path,
        type: 'blob',
        sha: 'c'.repeat(40),
      })),
    };
  };
  await scan(tiny, {}, api);
  assert.equal(pages, 2);
  await assert.rejects(
    scan(tiny, {}, async () => unrelated),
    /bounded release feed/
  );
});

test('GitHub CLI state goes to absolute thread storage without moving authentication or invoking a shell', async () => {
  const env = {
    BB_THREAD_STORAGE: '/tmp/test-upstream-storage',
    XDG_STATE_HOME: '.local/state',
    XDG_CONFIG_HOME: '/tmp/existing-config',
  };
  const safe = githubEnvironment(env);
  assert.equal(safe.XDG_STATE_HOME, '/tmp/test-upstream-storage/github-state');
  assert.equal(safe.XDG_CONFIG_HOME, env.XDG_CONFIG_HOME);
  assert.equal(env.XDG_STATE_HOME, '.local/state');
  assert.ok(isAbsolute(githubEnvironment({}).XDG_STATE_HOME));
  assert.ok(isAbsolute(githubEnvironment({ BB_THREAD_STORAGE: 'relative' }).XDG_STATE_HOME));
  let invoked;
  const args = ['api', 'repos/example/repo', '--jq', '.name'];
  const stdout = await githubCli(
    args,
    async (command, actualArgs, options) => {
      invoked = { command, actualArgs, options };
      return { stdout: 'repo' };
    },
    env
  );
  assert.equal(stdout, 'repo');
  assert.equal(invoked.command, 'gh');
  assert.deepEqual(invoked.actualArgs, args);
  assert.equal(invoked.options.env.XDG_STATE_HOME, safe.XDG_STATE_HOME);
  assert.equal(invoked.options.shell, undefined);
  await assert.rejects(
    githubCli(
      args,
      async () => {
        throw new Error('authentication unavailable');
      },
      env
    ),
    /authentication unavailable/
  );
});

test('new or removed sources require explicit baseline review rather than silent omission', () => {
  const previous = snapshot();
  previous.sources.unknown = { track: 'grafana', fingerprint: fingerprint('extra') };
  assert.throws(() => validateSnapshot(previous, config), /sources/);
});
