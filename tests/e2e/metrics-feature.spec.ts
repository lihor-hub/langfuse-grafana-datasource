import { expect, test } from '@grafana/plugin-e2e';
import { HISTOGRAM_DASHBOARD_TIME, HISTOGRAM_GRANULARITY } from '../../src/metrics.testFixtures';

const datasourceType = 'lihorhub-langfuse-datasource';
const definition = (histogram: boolean, timed: boolean) => ({
  view: 'observations',
  metrics: [{ measure: histogram ? 'latency' : 'count', aggregation: histogram ? 'histogram' : 'count' }],
  dimensions: [{ field: 'name' }],
  filters: [
    {
      column: 'name',
      type: 'string',
      operator: '=',
      value: histogram ? (timed ? 'fixture-histogram-heatmap' : 'fixture-histogram-table') : 'synthetic',
    },
  ],
  ...(timed ? { timeDimension: { granularity: HISTOGRAM_GRANULARITY } } : {}),
  orderBy: [{ field: histogram ? 'histogram_latency' : 'count_count', direction: 'desc' }],
  config: { row_limit: 25, ...(histogram ? { bins: 2 } : {}) },
});

test('metrics editor preserves filtered/ordered JSON and prevents invalid execution through Grafana', async ({
  page,
  readProvisionedDataSource,
  gotoPanelEditPage,
}) => {
  const datasource = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  const uid = `metrics-editor-${Date.now()}`;
  const original = definition(false, true);
  const created = await page.request.post('/api/dashboards/db', {
    data: {
      dashboard: {
        uid,
        title: uid,
        schemaVersion: 39,
        time: { from: 'now-6h', to: 'now' },
        panels: [
          {
            id: 1,
            title: 'Metrics editor',
            type: 'timeseries',
            gridPos: { x: 0, y: 0, w: 24, h: 12 },
            datasource: { type: datasourceType, uid: datasource.uid },
            targets: [{ refId: 'A', kind: 'metrics', editorMode: 'advanced', metricsQuery: JSON.stringify(original) }],
          },
        ],
      },
      overwrite: false,
    },
  });
  await expect(created).toBeOK();
  try {
    const requests: Array<Record<string, unknown>> = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/api/public/v2/metrics')) {
        requests.push(JSON.parse(url.searchParams.get('query')!));
      }
    });
    const edit = await gotoPanelEditPage({ dashboard: { uid }, id: '1' });
    const input = page.getByRole('textbox', { name: 'Metrics v2 query (JSON)' });
    await expect(input).toHaveValue(JSON.stringify(original));
    await page.getByRole('button', { name: 'Guided', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Row limit', exact: true }).fill('50');
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    const updated = JSON.parse(await input.inputValue());
    expect(updated).toEqual({ ...original, config: { row_limit: 50 } });
    await page.getByRole('button', { name: 'Run query', exact: true }).click();
    await expect.poll(() => requests.some((q) => (q.config as { row_limit: number }).row_limit === 50)).toBe(true);
    expect(requests.at(-1)).toMatchObject({ filters: original.filters, orderBy: original.orderBy });
    expect(Number.isFinite(Date.parse(String(requests.at(-1)?.fromTimestamp)))).toBe(true);
    await input.fill('{');
    await expect(page.getByText('Metrics query must be valid JSON.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run query', exact: true })).toBeDisabled();
    const count = requests.length;
    await input.blur();
    await expect(input).toHaveValue('{');
    expect(requests).toHaveLength(count);
    // Exercise the aggregate score path through the same editor, not raw score aggregation.
    const scores = {
      ...original,
      view: 'scores-numeric',
      metrics: [{ measure: 'value', aggregation: 'avg' }],
      dimensions: [{ field: 'name' }, { field: 'dataType' }],
      filters: [{ column: 'dataType', type: 'string', operator: '=', value: 'BOOLEAN' }],
      orderBy: [{ field: 'avg_value', direction: 'desc' }],
    };
    await input.fill(JSON.stringify(scores));
    await page.getByRole('button', { name: 'Guided', exact: true }).click();
    await expect(page.locator('code').filter({ hasText: /^avg_value$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Run query', exact: true }).click();
    await expect.poll(() => requests.some((q) => q.view === 'scores-numeric')).toBe(true);
    await expect(edit.panel.getErrorIcon()).not.toBeVisible();
  } finally {
    await page.request.delete(`/api/dashboards/uid/${uid}`);
  }
});

for (const timed of [true, false]) {
  test(`histogram ${timed ? 'heatmap cells' : 'lossless table fallback'} through the real Grafana proxy`, async ({
    page,
    readProvisionedDataSource,
    gotoPanelEditPage,
  }, testInfo) => {
    const datasource = await readProvisionedDataSource({ fileName: 'datasources.yml' });
    const uid = `metrics-hist-${timed}-${Date.now()}`;
    const created = await page.request.post('/api/dashboards/db', {
      data: {
        dashboard: {
          uid,
          title: uid,
          schemaVersion: 39,
          time: HISTOGRAM_DASHBOARD_TIME,
          panels: [
            {
              id: 1,
              title: 'Histogram',
              type: timed ? 'heatmap' : 'table',
              gridPos: { x: 0, y: 0, w: 24, h: 12 },
              options: timed ? { calculate: false } : {},
              datasource: { type: datasourceType, uid: datasource.uid },
              targets: [{ refId: 'A', kind: 'metrics', metricsQuery: JSON.stringify(definition(true, timed)) }],
            },
          ],
        },
        overwrite: false,
      },
    });
    await expect(created).toBeOK();
    try {
      const edit = await gotoPanelEditPage({ dashboard: { uid }, id: '1' });
      await expect(
        page.getByRole('status').filter({ hasText: timed ? 'Histogram output: heatmap' : 'Histogram output: table' })
      ).toBeVisible();
      await expect(edit.panel.getErrorIcon()).not.toBeVisible();
      if (timed) {
        await edit.toggleTableView();
      }
      // Panel.data contains gridcells only, not column headers.
      const headers = edit.panel.locator.getByRole('columnheader');
      if (timed) {
        await expect(headers).toContainText(['xMin', 'xMax', 'yMin', 'yMax', 'count']);
        for (const count of [3, 7, 4, 8]) {
          await expect(edit.panel.data.filter({ hasText: new RegExp(`^${count}$`) })).toBeVisible();
        }
      } else {
        await expect(headers).toContainText(['name', 'histogram_latency']);
        await expect(edit.panel.data).toContainText(['demo-operation']);
        const histogramCell = edit.panel.data.filter({ hasText: /^\s*\[/ });
        await expect(histogramCell).toBeVisible();
        expect(JSON.parse(await histogramCell.innerText())).toEqual([
          [0, 100, 3],
          [100, 200, 7],
        ]);
      }
      await page.screenshot({ path: testInfo.outputPath(timed ? 'histogram-cells.png' : 'histogram-table.png') });
    } finally {
      await page.request.delete(`/api/dashboards/uid/${uid}`);
    }
  });
}
