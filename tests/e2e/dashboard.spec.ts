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
  const showPanel = async (title: string) => {
    const panel = dashboard.getPanelByTitle(title);
    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error('A viewport is required for dashboard verification');
    }
    await page.mouse.move(viewport.width * 0.7, viewport.height * 0.65);
    // Grafana versions differ in whether the document or a nested container scrolls.
    await expect
      .poll(
        async () => {
          if (await panel.locator.isVisible()) {
            return true;
          }
          await page.mouse.wheel(0, 450);
          return false;
        },
        { timeout: 15_000 }
      )
      .toBe(true);
    await panel.locator.scrollIntoViewIfNeeded();
    return panel;
  };
  const introduction = page.getByText("Your platform's AI workload, in one view", { exact: true });
  await expect(introduction).toBeVisible();
  for (const [title, value] of panels) {
    const panel = await showPanel(title);
    await expect(panel.locator.getByText(value, { exact: false }).first()).toBeVisible();
    await expect(panel.getErrorIcon()).not.toBeVisible();
  }
  await page.mouse.wheel(0, -5000);
  await expect(introduction).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('platform-observability-overview.png') });
  for (const [title, fields] of [
    ['Workload volume by observation type', ['count_count']],
    ['Model latency — median and p95', ['p50_latency', 'p95_latency']],
    ['Recorded generation cost over time', ['sum_totalCost']],
    ['Input vs output tokens', ['sum_inputTokens', 'sum_outputTokens']],
  ] as const) {
    const panel = await showPanel(title);
    for (const field of fields) {
      await expect(panel.locator.getByText(field, { exact: false }).first()).toBeVisible();
    }
    await expect(panel.getErrorIcon()).not.toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('platform-observability-trends.png') });
  for (const title of ['Model mix — cost, tokens and calls', 'Error observations by operation']) {
    const panel = await showPanel(title);
    await expect(panel.data).toContainText(['demo-']);
    await expect(panel.getErrorIcon()).not.toBeVisible();
  }
  const scores = await showPanel('Numeric evaluation scores by name');
  await expect(scores.locator.getByText('avg_value', { exact: false }).first()).toBeVisible();
  await expect(scores.getErrorIcon()).not.toBeVisible();
  expect(containsSecret).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('platform-observability-details.png') });
});
