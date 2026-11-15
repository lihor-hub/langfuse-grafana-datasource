import { expect, test } from '@grafana/plugin-e2e';

// Run after parent DataSource/module registration, against the real Grafana proxy.
test('a discovered multi-value variable filters a dashboard metric', async ({
  page,
  readProvisionedDataSource,
  gotoDashboardPage,
}, testInfo) => {
  const datasource = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  const uid = `variables-${testInfo.workerIndex}-${Date.now()}`;
  const requests: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/api/public/v2/metrics') && url.searchParams.has('query')) {
      requests.push(JSON.parse(url.searchParams.get('query')!));
    }
  });
  const saved = await page.request.post('/api/dashboards/db', {
    data: {
      dashboard: {
        uid,
        title: `Variables ${uid}`,
        schemaVersion: 39,
        time: { from: 'now-1h', to: 'now' },
        templating: {
          list: [
            {
              name: 'environment',
              type: 'query',
              label: 'Environment',
              datasource: { type: 'lihorhub-langfuse-datasource', uid: datasource.uid },
              query: { view: 'observations', dimension: 'environment', lookback: '24h' },
              definition: 'observations.environment (24h)',
              refresh: 1,
              multi: true,
              includeAll: false,
              options: [],
              current: { text: [], value: [] },
            },
          ],
        },
        panels: [
          {
            id: 1,
            title: 'Variable-filtered count',
            type: 'stat',
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            datasource: { type: 'lihorhub-langfuse-datasource', uid: datasource.uid },
            targets: [
              {
                refId: 'A',
                kind: 'metrics',
                metricsQuery: JSON.stringify({
                  view: 'observations',
                  metrics: [{ measure: 'count', aggregation: 'count' }],
                  dimensions: [],
                  filters: [
                    { type: 'stringOptions', column: 'environment', operator: 'any of', value: '$environment' },
                  ],
                  config: { row_limit: 1000 },
                }),
              },
            ],
          },
        ],
      },
      overwrite: false,
    },
  });
  await expect(saved).toBeOK();
  try {
    const discovery = page.waitForResponse((response) => {
      const url = new URL(response.url());
      if (!url.pathname.endsWith('/api/public/v2/metrics')) {
        return false;
      }
      const query = JSON.parse(url.searchParams.get('query') ?? '{}');
      return query.dimensions?.[0]?.field === 'environment';
    });
    const dashboard = await gotoDashboardPage({ uid });
    const response = await discovery;
    await expect(response).toBeOK();
    const body = await response.json();
    const selected = body.data[0].environment;
    expect(typeof selected).toBe('string');
    await expect
      .poll(() =>
        requests.some((query) => {
          const filters = query.filters as Array<{ column: string; operator: string; value: unknown }> | undefined;
          return filters?.some(
            (filter) =>
              filter.column === 'environment' &&
              filter.operator === 'any of' &&
              Array.isArray(filter.value) &&
              filter.value.includes(selected)
          );
        })
      )
      .toBe(true);
    const panel = dashboard.getPanelByTitle('Variable-filtered count');
    await expect(panel.getErrorIcon()).not.toBeVisible();
    await expect(panel.locator.getByText('18', { exact: true })).toBeVisible();
    const discoveryQueries = requests.filter(
      (query) => (query.dimensions as Array<{ field: string }>)?.[0]?.field === 'environment'
    );
    expect(discoveryQueries).toHaveLength(1);
    expect(discoveryQueries[0]).toMatchObject({
      metrics: [{ measure: 'count', aggregation: 'count' }],
      config: { row_limit: 1000 },
    });
    expect(
      Date.parse(String(discoveryQueries[0].toTimestamp)) - Date.parse(String(discoveryQueries[0].fromTimestamp))
    ).toBe(86_400_000);
  } finally {
    await page.request.delete(`/api/dashboards/uid/${uid}`);
  }
});
