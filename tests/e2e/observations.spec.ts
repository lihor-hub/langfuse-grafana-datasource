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
  explorePage,
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
  // Explore also renders Logs/Table outline buttons; never select format controls page-wide.
  const editor = explorePage.getQueryEditorRow('A');
  await expect(editor.getByRole('button', { name: 'Logs', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Synthetic output', { exact: false }).first()).toBeVisible();
  // Enter can submit no option, even for a partial label such as "Score".
  // Older host Combobox implementations do not forward aria-label. Scope by
  // editor row and the guided form's stable order (Query kind, then Log body).
  const kind = editor.getByRole('combobox').nth(0);
  await kind.fill('Score');
  await kind.press('Enter');
  await expect(editor.getByRole('button', { name: 'Logs', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const body = editor.getByRole('combobox').nth(1);
  await body.fill('status');
  await body.press('Enter');
  await expect(editor.getByRole('button', { name: 'Logs', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('An unexpected error happened', { exact: false })).not.toBeVisible();
  await editor.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  const definition = JSON.parse(await editor.getByRole('textbox', { name: 'Observation query (JSON)' }).inputValue());
  expect(definition).toMatchObject({ format: 'table', logBody: 'output', fieldGroups: ['basic', 'io'], ceiling: 3 });
});
