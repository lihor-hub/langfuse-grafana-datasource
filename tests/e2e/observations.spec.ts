import { expect, test } from '@grafana/plugin-e2e';

// These tests require the parent integration: observation dispatch/editor and the release-track mock.
for (const empty of [false, true]) {
  test(`observation dashboard table ${empty ? 'retains an empty schema' : 'renders bounded results and truncation'}`, async ({
    page,
    readProvisionedDataSource,
    gotoDashboardPage,
  }) => {
    const datasource = await readProvisionedDataSource({ fileName: 'datasources.yml' });
    const uid = `observation-e2e-${empty ? 'empty' : 'rows'}`;
    const response = await page.request.post('/api/dashboards/db', {
      data: {
        overwrite: true,
        dashboard: {
          uid,
          title: uid,
          schemaVersion: 39,
          time: { from: '2026-08-05T11:00:00Z', to: '2026-08-05T12:00:00Z' },
          panels: [
            {
              id: 1,
              title: 'Observation table',
              type: 'table',
              gridPos: { h: 12, w: 24, x: 0, y: 0 },
              datasource: { uid: datasource.uid, type: 'lihorhub-langfuse-datasource' },
              targets: [
                {
                  refId: 'A',
                  kind: 'observations',
                  observationsQuery: JSON.stringify({ name: empty ? 'fixture-empty' : undefined, ceiling: 3 }),
                },
              ],
            },
          ],
        },
      },
    });
    expect(response.ok()).toBe(true);
    try {
      const sent: URL[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/public/v2/observations')) {
          sent.push(new URL(request.url()));
        }
      });
      const dashboard = await gotoDashboardPage({ uid });
      const panel = dashboard.getPanelByTitle('Observation table');
      await expect(panel.getErrorIcon()).not.toBeVisible();
      await expect.poll(() => sent.length).toBeGreaterThan(0);
      for (const url of sent) {
        expect(url.searchParams.get('fields')).not.toMatch(/io|metadata/);
        expect(Number(url.searchParams.get('limit'))).toBeLessThanOrEqual(1000);
        const filters = JSON.parse(url.searchParams.get('filter') ?? '[]');
        expect(filters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ column: 'startTime', operator: '>=' }),
            expect.objectContaining({ column: 'startTime', operator: '<' }),
          ])
        );
      }
      if (!empty) {
        await expect(panel.locator).toContainText('observation-e2e');
      } else {
        await expect(panel.locator).not.toContainText('observation-e2e');
      }
    } finally {
      await page.request.delete(`/api/dashboards/uid/${uid}`);
    }
  });
}

test('Explore defaults observations to logs and supports body and table switching', async ({
  page,
  readProvisionedDataSource,
}) => {
  const datasource = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  const panes = {
    observation: {
      datasource: datasource.uid,
      queries: [
        {
          refId: 'A',
          datasource: { uid: datasource.uid, type: 'lihorhub-langfuse-datasource' },
          kind: 'observations',
          observationsQuery: JSON.stringify({ fieldGroups: ['basic', 'io'], logBody: 'output', ceiling: 3 }),
        },
      ],
      range: { from: '1785927600000', to: '1785931200000' },
    },
  };
  await page.goto(`/explore?schemaVersion=1&panes=${encodeURIComponent(JSON.stringify(panes))}&orgId=1`);
  await expect(page.getByRole('button', { name: 'Logs', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Synthetic output', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Table', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Table', exact: true }).first()).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  const definition = JSON.parse(await page.getByRole('textbox', { name: 'Observation query (JSON)' }).inputValue());
  expect(definition).toMatchObject({ format: 'table', logBody: 'output', fieldGroups: ['basic', 'io'], ceiling: 3 });
});
