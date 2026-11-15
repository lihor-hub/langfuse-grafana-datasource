import { expect, test } from '@grafana/plugin-e2e';

const PLUGIN_ID = 'lihorhub-langfuse-datasource';

for (const dataType of ['NUMERIC', 'BOOLEAN', 'CATEGORICAL', 'TEXT', 'CORRECTION']) {
  test(`renders ${dataType} scores through the real Grafana proxy`, async ({
    readProvisionedDataSource,
    gotoPanelEditPage,
    page,
  }) => {
    const datasource = await readProvisionedDataSource({ fileName: 'datasources.yml' });
    const uid = `scores-${dataType.toLowerCase()}-${Date.now()}`;
    const saved = await page.request.post('/api/dashboards/db', {
      data: {
        dashboard: {
          uid,
          title: `Scores fixture ${dataType}`,
          schemaVersion: 39,
          time: { from: 'now-1h', to: 'now' },
          panels: [
            {
              id: 1,
              title: `${dataType} scores`,
              type: 'table',
              gridPos: { x: 0, y: 0, w: 24, h: 12 },
              datasource: { type: PLUGIN_ID, uid: datasource.uid },
              targets: [
                {
                  refId: 'A',
                  kind: 'scores',
                  scoresQuery: JSON.stringify({ dataType, fields: 'details,subject,annotation', ceiling: 500 }),
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
      const firstPage = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname.includes('/api/datasources/proxy/') &&
          url.pathname.endsWith('/api/public/v3/scores') &&
          url.searchParams.get('dataType') === dataType &&
          !url.searchParams.has('cursor')
        );
      });
      const editor = await gotoPanelEditPage({ dashboard: { uid }, id: '1' });
      const response = await firstPage;
      await expect(response).toBeOK();
      const url = new URL(response.url());
      expect(url.searchParams.get('limit')).toBe('100');
      expect(url.searchParams.get('fields')).toBe('details,subject,annotation');
      expect(Number.isFinite(Date.parse(url.searchParams.get('fromTimestamp') ?? ''))).toBe(true);
      expect(Number.isFinite(Date.parse(url.searchParams.get('toTimestamp') ?? ''))).toBe(true);
      await expect(editor.panel.data).toContainText([dataType]);
      await expect(editor.panel.getErrorIcon()).not.toBeVisible();
    } finally {
      const removed = await page.request.delete(`/api/dashboards/uid/${uid}`);
      await expect(removed).toBeOK();
    }
  });
}
