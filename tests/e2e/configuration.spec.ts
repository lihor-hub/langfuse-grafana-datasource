import { expect, test } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';

const PLUGIN_ID = 'lihorhub-langfuse-datasource';
const LANGFUSE_SECRET = process.env.LANGFUSE_E2E_SECRET;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!LANGFUSE_SECRET) {
    throw new Error('LANGFUSE_E2E_SECRET must be supplied at runtime');
  }
});

test('Save & Test succeeds through the Grafana proxy and redacts the saved secret', async ({
  createDataSourceConfigPage,
  selectors,
  page,
}) => {
  const browserRequests: Array<Promise<{ url: string; headers: Record<string, string>; body: string | null }>> = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/datasources/proxy/')) {
      browserRequests.push(
        request.allHeaders().then((headers) => ({ url: request.url(), headers, body: request.postData() }))
      );
    }
  });
  const configPage = await createDataSourceConfigPage({ type: PLUGIN_ID });
  await fillConnection(page, 'http://mock-langfuse:8080', process.env.LANGFUSE_E2E_PUBLIC_KEY ?? '', LANGFUSE_SECRET!);
  const proxyPath = selectors.apis.DataSource.proxy(configPage.datasource.uid, configPage.datasource.id.toString());

  await expect(configPage.saveAndTest({ path: `${proxyPath}/api/public/projects` })).toBeOK();
  await expect(configPage).toHaveAlert('success', {
    hasText: 'Connected to Langfuse v4 project project-e2e.',
  });

  const settingsResponse = await page.request.get(`/api/datasources/uid/${configPage.datasource.uid}`);
  await expect(settingsResponse).toBeOK();
  const settingsText = await settingsResponse.text();
  assertSecretRedacted(settingsText);
  expect(JSON.parse(settingsText).secureJsonFields).toEqual(expect.objectContaining({ basicAuthPassword: true }));
  const bootData = await page.evaluate(() =>
    JSON.stringify((window as unknown as { grafanaBootData: unknown }).grafanaBootData)
  );
  const completedBrowserRequests = await Promise.all(browserRequests);
  assertSecretRedacted(bootData);
  assertSecretRedacted(completedBrowserRequests);
  expect(completedBrowserRequests.every(({ headers }) => headers.authorization === undefined)).toBe(true);

  const events = await readMockEvents(page, `${proxyPath}/__test/requests`);
  expect(events.slice(-2)).toEqual([
    { method: 'GET', path: '/api/public/projects', query: {}, authAccepted: true, aborted: false },
    expect.objectContaining({
      method: 'GET',
      path: '/api/public/v2/observations',
      query: expect.objectContaining({ fields: 'core', limit: '1' }),
      authAccepted: true,
      aborted: false,
    }),
  ]);
});

test('Save & Test classifies Grafana proxy authentication failure', async ({
  createDataSourceConfigPage,
  selectors,
  page,
}) => {
  const configPage = await createDataSourceConfigPage({ type: PLUGIN_ID });
  await fillConnection(page, 'http://mock-langfuse:8080', 'pk-invalid', LANGFUSE_SECRET!);
  const proxyPath = selectors.apis.DataSource.proxy(configPage.datasource.uid, configPage.datasource.id.toString());

  const response = await configPage.saveAndTest({ path: `${proxyPath}/api/public/projects` });

  expect(response.status()).toBe(400);
  assertGrafanaAuthFailureBody(await response.text());
  await expect(configPage).toHaveAlert('error', {
    hasText: 'Invalid Langfuse credentials. Check the public and secret keys.',
  });
});

test('Save & Test requires Observations v2', async ({ createDataSourceConfigPage, selectors, page }) => {
  const configPage = await createDataSourceConfigPage({ type: PLUGIN_ID });
  await fillConnection(
    page,
    'http://mock-langfuse-no-v2:8080',
    process.env.LANGFUSE_E2E_PUBLIC_KEY ?? '',
    LANGFUSE_SECRET!
  );
  const proxyPath = selectors.apis.DataSource.proxy(configPage.datasource.uid, configPage.datasource.id.toString());

  await expect(configPage.saveAndTest({ path: `${proxyPath}/api/public/projects` })).toBeOK();
  await expect(configPage).toHaveAlert('error', {
    hasText: 'Langfuse v4 is required; the Observations v2 endpoint is unavailable.',
  });
});

async function fillConnection(page: Page, url: string, publicKey: string, secretKey: string) {
  await page.getByRole('textbox', { name: 'Langfuse base URL' }).fill(url);
  await page.getByRole('textbox', { name: 'Langfuse public key' }).fill(publicKey);
  await page.getByLabel('Langfuse secret key').fill(secretKey);
}

function assertSecretRedacted(value: unknown): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const containsSecret = serialized?.includes(LANGFUSE_SECRET!) ?? false;
  expect(containsSecret).toBe(false);
}

function assertGrafanaAuthFailureBody(body: string): void {
  const hasExpectedSafeBody = body === 'Authentication to data source failed';
  expect(hasExpectedSafeBody).toBe(true);
}

type MockEvent = {
  method: string;
  path: string;
  query: Record<string, string>;
  authAccepted: boolean;
  aborted: boolean;
};

async function readMockEvents(page: Page, path: string): Promise<MockEvent[]> {
  const response = await page.request.get(path);
  await expect(response).toBeOK();
  return (await response.json()).events as MockEvent[];
}
