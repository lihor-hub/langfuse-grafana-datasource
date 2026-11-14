import { expect, test } from '@grafana/plugin-e2e';

const panels = [
  ['Recorded observations', '18'],
  ['LLM generations', '18'],
  ['Recorded generation cost', '0.12'],
  ['Generation tokens', '120'],
] as const;

test('renders the provisioned platform dashboard through the real Grafana proxy', async ({
  readProvisionedDashboard,
  readProvisionedDataSource,
  gotoDashboardPage,
  page,
}, testInfo) => {
  const secret = process.env.LANGFUSE_E2E_SECRET;
  if (!secret) {
    throw new Error('LANGFUSE_E2E_SECRET must be supplied at runtime');
  }
  let containsSecret = false;
  page.on('request', (request) => {
    if (request.url().includes('/api/datasources/proxy/')) {
      containsSecret ||= JSON.stringify({
        url: request.url(),
        body: request.postData(),
        headers: request.headers(),
      }).includes(secret);
    }
  });
  const model = await readProvisionedDashboard({ fileName: 'platform-observability.json' });
  const datasource = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  const dashboard = await gotoDashboardPage({
    uid: model.uid,
    queryParams: new URLSearchParams({ 'var-langfuse': datasource.uid }),
  });
  await expect(page.getByText("Your platform's AI workload, in one view", { exact: true })).toBeVisible();
  for (const [title, value] of panels) {
    const panel = dashboard.getPanelByTitle(title);
    await panel.scrollIntoView();
    await expect(panel.locator.getByText(value, { exact: false }).first()).toBeVisible();
    await expect(panel.getErrorIcon()).not.toBeVisible();
  }
  for (const [title, fields] of [
    ['Workload volume by observation type', ['count_count']],
    ['Model latency — median and p95', ['p50_latency', 'p95_latency']],
    ['Recorded generation cost over time', ['sum_totalCost']],
    ['Input vs output tokens', ['sum_inputTokens', 'sum_outputTokens']],
    ['Numeric evaluation scores by name', ['avg_value']],
  ] as const) {
    const panel = dashboard.getPanelByTitle(title);
    await panel.scrollIntoView();
    for (const field of fields) {
      await expect(panel.locator.getByText(field, { exact: false }).first()).toBeVisible();
    }
    await expect(panel.getErrorIcon()).not.toBeVisible();
  }
  for (const title of ['Model mix — cost, tokens and calls', 'Error observations by operation']) {
    const panel = dashboard.getPanelByTitle(title);
    await panel.scrollIntoView();
    await expect(panel.data).toContainText(['demo-']);
    await expect(panel.getErrorIcon()).not.toBeVisible();
  }
  expect(containsSecret).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('platform-observability.png'), fullPage: true });
});
