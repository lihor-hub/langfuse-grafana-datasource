import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
// Keep argument forwarding explicit: this repo disables npm lifecycle hooks.
execFileSync(
  process.execPath,
  [
    require.resolve('webpack-cli/bin/cli.js'),
    '-c',
    './.config/webpack/webpack.config.ts',
    '--env',
    'production',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' }
);

const dashboardPath = 'provisioning/dashboards/platform-observability.json';
const manifest = JSON.parse(readFileSync('dist/plugin.json', 'utf8'));
const dashboard = JSON.parse(readFileSync(dashboardPath, 'utf8'));
assert(manifest.includes.some((entry) => entry.type === 'dashboard' && entry.path === dashboardPath));
assert.equal(dashboard.templating.list[0].query, manifest.id);

const userGuides = readdirSync('docs')
  .filter((file) => file.endsWith('.md'))
  .map((file) => `docs/${file}`);
for (const file of [dashboardPath, 'NOTICE', ...userGuides]) {
  const destination = `dist/${file}`;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(file, destination);
}
