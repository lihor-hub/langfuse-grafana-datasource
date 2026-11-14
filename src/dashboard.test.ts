import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { dateTime, type TimeRange } from '@grafana/data';
import { parse } from 'yaml';

import { buildMetricsQuery, metricsToFrames } from './metrics';
import type { LangfuseQuery } from './types';

const text = readFileSync(resolve('provisioning/dashboards/platform-observability.json'), 'utf8');
const dashboard = JSON.parse(text) as {
  uid: string;
  templating: { list: Array<{ name: string; query: string }> };
  panels: Array<{
    id: number;
    type: string;
    title: string;
    datasource?: { type: string; uid: string };
    targets?: LangfuseQuery[];
  }>;
};
const range: TimeRange = {
  from: dateTime('2026-11-01T00:00:00Z'),
  to: dateTime('2026-11-08T00:00:00Z'),
  raw: { from: 'now-7d', to: 'now' },
};

it('uses the standalone plugin and a datasource selector, without credentials or captured payloads', () => {
  expect(dashboard.templating.list).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'langfuse', query: 'lihorhub-langfuse-datasource' })])
  );
  expect(new Set(dashboard.panels.map((panel) => panel.id)).size).toBe(dashboard.panels.length);
  expect(text).not.toMatch(/(?:pk-|sk-)[a-zA-Z0-9]+|basicAuthPassword|Authorization|https?:\/\//);
  expect(text).toContain('Observations are spans/events/generations, not user requests');
  expect(text).toContain('No data is not zero');
});

it.each(dashboard.panels.filter((panel) => panel.targets))('compiles the $title panel to typed frames', (panel) => {
  expect(panel.datasource).toEqual({ type: 'lihorhub-langfuse-datasource', uid: '${langfuse}' });
  for (const target of panel.targets!) {
    const query = buildMetricsQuery(target, range, 3_600_000);
    expect(query.fromTimestamp).toBe(range.from.toISOString());
    expect(query.toTimestamp).toBe(range.to.toISOString());
    expect(query.config.row_limit).toBeLessThanOrEqual(1000);
    expect(metricsToFrames([], query, target.refId)[0].length).toBe(0);
    const row = Object.fromEntries([
      ...query.dimensions.map(({ field }) => [field, 'demo']),
      ...query.metrics.map(({ measure, aggregation }) => [`${aggregation}_${measure}`, 1]),
      ...(query.timeDimension ? [['time_dimension', range.from.toISOString()]] : []),
    ]);
    expect(metricsToFrames([row], query, target.refId)[0].length).toBe(1);
  }
});

it('provisions the same dashboard folder mounted by the development Compose stack', () => {
  const provisioning = parse(readFileSync(resolve('provisioning/dashboards/dashboards.yml'), 'utf8'));
  const compose = parse(readFileSync(resolve('.config/docker-compose-base.yaml'), 'utf8'));
  expect(provisioning.providers[0].options.path).toBe('/etc/grafana/provisioning/dashboards');
  expect(compose.services.grafana.volumes).toContain('../provisioning:/etc/grafana/provisioning');
});
