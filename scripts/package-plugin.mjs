import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, utimes, chmod, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePlugin } from './validate-plugin.mjs';

export async function packagePlugin(dist, output, version) {
  assert(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version), 'invalid release version');
  const files = await validatePlugin(dist, version);
  const root = await mkdtemp(join(tmpdir(), 'langfuse-archive-'));
  const id = 'lihorhub-langfuse-datasource';
  const archive = resolve(output, `${id}-${version}.zip`);
  try {
    for (const file of files) {
      const destination = join(root, id, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(dist, file), destination);
      await chmod(destination, 0o644);
      // ZIP timestamps and permissions must not depend on checkout time or umask.
      await utimes(destination, new Date('1980-01-01T00:00:00Z'), new Date('1980-01-01T00:00:00Z'));
    }
    await mkdir(output, { recursive: true });
    await rm(archive, { force: true });
    execFileSync('zip', ['-X', '-q', archive, '-@'], {
      cwd: root,
      env: { ...process.env, TZ: 'UTC' },
      input: files.map((file) => `${id}/${file}`).join('\n') + '\n',
    });
    const bytes = await readFile(archive);
    for (const algorithm of ['sha1', 'sha256']) {
      await writeFile(
        `${archive}.${algorithm}`,
        `${createHash(algorithm).update(bytes).digest('hex')}  ${id}-${version}.zip\n`
      );
    }
    return archive;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(await packagePlugin('dist', 'artifacts', version));
}
