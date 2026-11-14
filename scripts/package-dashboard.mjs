import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const dashboardPath = 'provisioning/dashboards/platform-observability.json';
const manifest = JSON.parse(readFileSync('dist/plugin.json', 'utf8'));
const dashboard = JSON.parse(readFileSync(dashboardPath, 'utf8'));
assert(manifest.includes.some((entry) => entry.type === 'dashboard' && entry.path === dashboardPath));
assert.equal(dashboard.templating.list[0].query, manifest.id);

for (const file of [dashboardPath, 'docs/platform-observability-dashboard.md']) {
  const destination = `dist/${file}`;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(file, destination);
}
