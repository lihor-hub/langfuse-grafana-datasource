import { expect, test } from '@grafana/plugin-e2e';

// Explore defaults to observation logs; explicitly choosing metrics must still
// produce the same useful observation-count default as a dashboard target.
test('Explore charts a default observation-count metrics query over its selected range', async ({
  page,
  explorePage,
  readProvisionedDataSource,
}) => {
  const datasource = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  const requests: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/api/public/v2/metrics')) {
      requests.push(JSON.parse(url.searchParams.get('query')!));
    }
  });
  const from = Date.parse('2026-11-01T00:00:00Z');
  const to = Date.parse('2026-11-02T00:00:00Z');
  const panes = {
    metrics: {
      datasource: datasource.uid,
      queries: [
        { refId: 'A', kind: 'metrics', datasource: { uid: datasource.uid, type: 'lihorhub-langfuse-datasource' } },
      ],
      range: { from: String(from), to: String(to) },
    },
  };
  await page.goto(`/explore?schemaVersion=1&panes=${encodeURIComponent(JSON.stringify(panes))}&orgId=1`);
  const editor = explorePage.getQueryEditorRow('A');
  await expect(editor.locator('code').filter({ hasText: /^count_count$/ })).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request).toMatchObject({
      view: 'observations',
      metrics: [{ measure: 'count', aggregation: 'count' }],
      config: { row_limit: 1000 },
      fromTimestamp: new Date(from).toISOString(),
      toTimestamp: new Date(to).toISOString(),
    });
  }
  // Require returned data in Explore as well as the alias displayed in its editor.
  await expect(explorePage.timeSeriesPanel.locator.getByText('count_count', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('An unexpected error happened', { exact: false })).not.toBeVisible();
});
