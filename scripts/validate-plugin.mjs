import assert from 'node:assert/strict';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSecretSafe } from './secret-scan.mjs';

export async function validatePlugin(dist, version) {
  const manifest = JSON.parse(await readFile(join(dist, 'plugin.json'), 'utf8'));
  assert.equal(manifest.id, 'lihorhub-langfuse-datasource');
  assert.equal(manifest.type, 'datasource');
  assert.equal(manifest.info.version, version);
  assert.equal(manifest.dependencies.grafanaDependency, '>=12.3.0');
  for (const capability of ['backend', 'alerting', 'annotations', 'streaming']) {
    assert(!manifest[capability], `unsupported ${capability}`);
  }
  assert(manifest.metrics && manifest.logs);
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      assert(!(await lstat(file)).isSymbolicLink(), `symlink not allowed: ${file}`);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      const name = relative(dist, file).split('\\').join('/');
      assert(
        /\.(?:js|map|json|md|txt|svg|png|jpe?g|woff2?|ttf|css)$/.test(name) || /^(?:LICENSE|NOTICE)$/.test(name),
        `unapproved archive file: ${name}`
      );
      assert(!/(?:^|\/)(?:tests?|node_modules|\.env)(?:\/|\.|$)/.test(name), `development file in archive: ${name}`);
      if (!/\.(?:png|jpe?g|woff2?|ttf)$/.test(name)) {
        assertSecretSafe(await readFile(file, 'utf8'), name);
      }
      files.push(name);
    }
  }
  await walk(dist);
  for (const file of [
    'module.js',
    'plugin.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    ...Object.values(manifest.info.logos ?? {}),
    ...(manifest.info.screenshots ?? []).map((s) => s.path),
    ...(manifest.includes ?? []).map((entry) => entry.path).filter(Boolean),
  ]) {
    assert(files.includes(file), `missing archive asset: ${file}`);
  }
  return files.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(
    `Validated ${(await validatePlugin('dist', version)).length} packaged files (local checks; run upstream Grafana validator separately)`
  );
}
