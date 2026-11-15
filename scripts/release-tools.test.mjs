import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { packagePlugin } from './package-plugin.mjs';
import { assertSecretSafe } from './secret-scan.mjs';

test('secret scanning rejects credentials but accepts environment provisioning', () => {
  assert.doesNotThrow(() => assertSecretSafe('const settings = { basicAuthPassword: props.secret };', 'module.js'));
  assert.doesNotThrow(() => assertSecretSafe('const settings = { basicAuthPassword: "" };', 'module.js'));
  assert.throws(() => assertSecretSafe('sk-' + 'lf-' + 'a'.repeat(20), 'fixture'));
  assert.throws(() => assertSecretSafe('secureJsonData:\n  basicAuthPassword: unsafe-value', 'fixture'));
  assert.throws(() => assertSecretSafe('"secureJsonData":{"basicAuthPassword":"unsafe"}', 'fixture'));
  assert.doesNotThrow(() =>
    assertSecretSafe('secureJsonData:\n  basicAuthPassword: ${LANGFUSE_SECRET_KEY}', 'fixture')
  );
});

test('unsigned archives are reproducible and reject uncompiled or credential-bearing files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'langfuse-package-'));
  try {
    const dist = join(root, 'dist');
    await mkdir(dist);
    await writeFile(
      join(dist, 'plugin.json'),
      JSON.stringify({
        id: 'lihorhub-langfuse-datasource',
        type: 'datasource',
        metrics: true,
        logs: true,
        info: { version: '0.1.1', logos: {}, screenshots: [] },
        dependencies: { grafanaDependency: '>=12.3.0' },
      })
    );
    for (const file of ['module.js', 'README.md', 'CHANGELOG.md', 'LICENSE']) {
      await writeFile(join(dist, file), 'synthetic');
    }
    const first = await packagePlugin(dist, join(root, 'first'), '0.1.1');
    const second = await packagePlugin(dist, join(root, 'second'), '0.1.1');
    assert.deepEqual(await readFile(first), await readFile(second));
    assert.match(await readFile(first + '.sha256', 'utf8'), /^[a-f0-9]{64}  lihorhub-langfuse-datasource-0.1.1.zip\n$/);
    await writeFile(join(dist, 'secret.ts'), 'uncompiled');
    await assert.rejects(packagePlugin(dist, join(root, 'third'), '0.1.1'), /unapproved/);
    await rm(join(dist, 'secret.ts'));
    await writeFile(join(dist, 'fixture.json'), '"basicAuthPassword":"unsafe"');
    await assert.rejects(packagePlugin(dist, join(root, 'fourth'), '0.1.1'), /credential/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ordinary CI and unsigned release automation never receive signing credentials', async () => {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  assert(!/GRAFANA_ACCESS_POLICY_TOKEN|npm run sign/.test(ci));
  const release = await readFile('.github/workflows/release.yml', 'utf8');
  assert.match(release, /npm run package/);
  assert.match(release, /artifacts/);
  assert(!/secrets\.|policy_token|npm run sign/.test(release));
});
