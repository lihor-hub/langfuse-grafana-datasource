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
  const browserRequests = captureRelevantBrowserRequests(page);
  const configPage = await createDataSourceConfigPage({ type: PLUGIN_ID });
  await fillConnection(page, 'http://mock-langfuse:8080', process.env.LANGFUSE_E2E_PUBLIC_KEY ?? '', LANGFUSE_SECRET!);
  const proxyPath = selectors.apis.DataSource.proxy(configPage.datasource.uid, configPage.datasource.id.toString());

  const saveAndTestStartedAt = Date.now();
  await expect(configPage.saveAndTest({ path: `${proxyPath}/api/public/projects` })).toBeOK();
  await expect(configPage).toHaveAlert('success', {
    hasText: 'Connected to Langfuse v4 project project-e2e.',
  });
  const saveAndTestFinishedAt = Date.now();

  const settingsResponse = await page.request.get(`/api/datasources/uid/${configPage.datasource.uid}`);
  await expect(settingsResponse).toBeOK();
  const settingsText = await settingsResponse.text();
  assertSecretRedacted(settingsText);
  expect(JSON.parse(settingsText).secureJsonFields).toEqual(expect.objectContaining({ basicAuthPassword: true }));
  await configPage.goto();
  await expect(page.getByRole('textbox', { name: 'Langfuse base URL' })).toHaveValue('http://mock-langfuse:8080');
  const bootData = await page.evaluate(() =>
    JSON.stringify((window as unknown as { grafanaBootData: unknown }).grafanaBootData)
  );
  const renderedConfigText = await page.locator('body').textContent();
  const completedBrowserRequests = await Promise.all(browserRequests);
  const expectedSaveRequestUrl = new URL(`/api/datasources/uid/${configPage.datasource.uid}`, page.url()).href;
  const saveRequestIndexes = completedBrowserRequests.flatMap(({ method, url }, index) =>
    method === 'PUT' && url === expectedSaveRequestUrl ? [index] : []
  );
  const legitimateSaveRequestCount = saveRequestIndexes.length;
  const legitimateSaveRequestIndex = saveRequestIndexes[0] ?? -1;
  const saveRequest = completedBrowserRequests[legitimateSaveRequestIndex];
  const otherBrowserRequests = completedBrowserRequests.filter((_, index) => index !== legitimateSaveRequestIndex);
  const laterBrowserRequests = completedBrowserRequests.slice(legitimateSaveRequestIndex + 1);
  const targetsMockLangfuse = completedBrowserRequests.some(({ url }) => {
    const hostname = new URL(url).hostname;
    return hostname === 'mock-langfuse' || hostname === 'mock-langfuse-no-v2';
  });
  const sendsBrowserAuthorization = completedBrowserRequests.some(({ headers }) => headers.authorization !== undefined);

  expect(legitimateSaveRequestIndex >= 0).toBe(true);
  expect(legitimateSaveRequestCount).toBe(1);
  sanitizeSaveRequest(saveRequest, expectedSaveRequestUrl);
  expect(laterBrowserRequests.length > 0).toBe(true);
  expect(targetsMockLangfuse).toBe(false);
  expect(sendsBrowserAuthorization).toBe(false);
  assertSecretRedacted(bootData);
  assertSecretRedacted(renderedConfigText);
  assertSecretRedacted(otherBrowserRequests);
  assertSecretRedacted(laterBrowserRequests);

  const proxyPrefix = `/${proxyPath.replace(/^\/+/, '')}`;
  const proxyRequests = completedBrowserRequests.filter(
    (request) => request.method === 'GET' && new URL(request.url).pathname.startsWith(`${proxyPrefix}/api/public/`)
  );
  expect(proxyRequests.map((request) => new URL(request.url).pathname.slice(proxyPrefix.length))).toEqual([
    '/api/public/projects',
    '/api/public/v2/observations',
  ]);
  const probeQuery = Object.fromEntries(new URL(proxyRequests[1].url).searchParams);
  const events = await readMockEvents(page, `${proxyPath}/__test/requests`);
  // Other parallel feature tests share the mock; correlate this probe by its own exact time bounds.
  const observationProbe = events.find(
    (event) =>
      event.path === '/api/public/v2/observations' &&
      event.query.fromStartTime === probeQuery.fromStartTime &&
      event.query.toStartTime === probeQuery.toStartTime
  );
  expect(observationProbe).toEqual({
    method: 'GET',
    path: '/api/public/v2/observations',
    query: { ...probeQuery, fields: 'core', limit: '1' },
    authAccepted: true,
    aborted: false,
  });
  assertObservationProbeWindow(observationProbe, saveAndTestStartedAt, saveAndTestFinishedAt);
});

test('aborts a delayed Metrics v2 request through the Grafana proxy', async ({
  createDataSourceConfigPage,
  selectors,
  page,
}) => {
  const configPage = await createDataSourceConfigPage({ type: PLUGIN_ID });
  await fillConnection(page, 'http://mock-langfuse:8080', process.env.LANGFUSE_E2E_PUBLIC_KEY ?? '', LANGFUSE_SECRET!);
  const proxyPath = selectors.apis.DataSource.proxy(configPage.datasource.uid, configPage.datasource.id.toString());
  await expect(configPage.saveAndTest({ path: `${proxyPath}/api/public/projects` })).toBeOK();
  const cancellationId = `cancel-${Date.now()}`;
  const metricsUrl = `${proxyPath}/api/public/v2/metrics?delayMs=5000&cancellationId=${cancellationId}&query=${encodeURIComponent('{"view":"observations"}')}`;

  await page.evaluate((url) => {
    const controller = new AbortController();
    const state: MetricsAbortState = { controller, isAbortError: false, responseConsumed: false, settled: false };
    (window as unknown as { __langfuseMetricsAbortState: MetricsAbortState }).__langfuseMetricsAbortState = state;
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        state.responseConsumed = true;
        await response.text();
      })
      .catch((error: unknown) => {
        state.isAbortError = error instanceof DOMException && error.name === 'AbortError';
      })
      .finally(() => {
        state.settled = true;
      });
  }, metricsUrl);

  await expect
    .poll(
      async () => {
        const events = await readMockEvents(page, `${proxyPath}/__test/requests`);
        return events.some(
          (event) =>
            event.path === '/api/public/v2/metrics' &&
            event.query.delayMs === '5000' &&
            event.query.cancellationId === cancellationId
        );
      },
      { timeout: 5_000 }
    )
    .toBe(true);
  const settledBeforeAbort = await page.evaluate(
    () => (window as unknown as { __langfuseMetricsAbortState: MetricsAbortState }).__langfuseMetricsAbortState.settled
  );
  expect(settledBeforeAbort).toBe(false);
  await page.evaluate(() => {
    (
      window as unknown as { __langfuseMetricsAbortState: MetricsAbortState }
    ).__langfuseMetricsAbortState.controller.abort();
  });
  await expect
    .poll(
      async () => {
        const events = await readMockEvents(page, `${proxyPath}/__test/requests`);
        return events.some(
          (event) =>
            event.path === '/api/public/v2/metrics' &&
            event.query.delayMs === '5000' &&
            event.query.cancellationId === cancellationId &&
            event.aborted
        );
      },
      { timeout: 10_000 }
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __langfuseMetricsAbortState: MetricsAbortState }).__langfuseMetricsAbortState
              .settled
        ),
      { timeout: 5_000 }
    )
    .toBe(true);
  const { isAbortError, responseConsumed } = await page.evaluate(
    () => (window as unknown as { __langfuseMetricsAbortState: MetricsAbortState }).__langfuseMetricsAbortState
  );
  expect(isAbortError).toBe(true);
  expect(responseConsumed).toBe(false);
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

type BrowserRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
};

type MetricsAbortState = {
  controller: AbortController;
  isAbortError: boolean;
  responseConsumed: boolean;
  settled: boolean;
};

function captureRelevantBrowserRequests(page: Page): Array<Promise<BrowserRequest>> {
  const requests: Array<Promise<BrowserRequest>> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const isDatasourceRequest = url.pathname.startsWith('/api/datasources');
    const isDirectMockRequest = url.hostname === 'mock-langfuse' || url.hostname === 'mock-langfuse-no-v2';
    if (isDatasourceRequest || isDirectMockRequest) {
      requests.push(
        request.allHeaders().then((headers) => ({
          method: request.method(),
          url: request.url(),
          headers,
          body: request.postData(),
        }))
      );
    }
  });
  return requests;
}

function assertSecretRedacted(value: unknown): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const containsSecret = serialized?.includes(LANGFUSE_SECRET!) ?? false;
  expect(containsSecret).toBe(false);
}

function sanitizeSaveRequest(saveRequest: BrowserRequest | undefined, expectedUrl: string): void {
  const hasExpectedRequest = saveRequest?.method === 'PUT' && saveRequest.url === expectedUrl;
  expect(hasExpectedRequest).toBe(true);
  if (!saveRequest) {
    throw new Error('Expected one Grafana data source save request');
  }

  assertSecretRedacted(saveRequest.url);
  assertSecretRedacted(saveRequest.headers);

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(saveRequest.body ?? 'null');
  } catch {
    throw new Error('Expected the Grafana data source save request to contain a JSON body');
  }
  const hasSaveBody = isRecord(parsedBody) && isRecord(parsedBody.secureJsonData);
  expect(hasSaveBody).toBe(true);
  if (!isRecord(parsedBody) || !isRecord(parsedBody.secureJsonData)) {
    throw new Error('Expected secureJsonData in the Grafana data source save request');
  }

  const secureJsonData = parsedBody.secureJsonData;
  const hasExpectedSecret = secureJsonData.basicAuthPassword === LANGFUSE_SECRET;
  expect(hasExpectedSecret).toBe(true);
  secureJsonData.basicAuthPassword = '[REDACTED]';

  const sanitizedSaveRequest = { ...saveRequest, body: parsedBody };
  assertSecretRedacted(sanitizedSaveRequest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertGrafanaAuthFailureBody(body: string): void {
  const hasExpectedSafeBody = body === 'Authentication to data source failed';
  expect(hasExpectedSafeBody).toBe(true);
}

function assertObservationProbeWindow(event: MockEvent | undefined, startedAt: number, finishedAt: number): void {
  const from = event?.query.fromStartTime ?? '';
  const to = event?.query.toStartTime ?? '';
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  const isExactIsoInstant = (value: string, time: number) =>
    Number.isFinite(time) && new Date(time).toISOString() === value;
  const isExactlyOneHour = toTime - fromTime === 60 * 60 * 1000;
  const clockToleranceMs = 1_000;
  const bracketsSaveAndTest = toTime >= startedAt - clockToleranceMs && toTime <= finishedAt + clockToleranceMs;

  expect(isExactIsoInstant(from, fromTime)).toBe(true);
  expect(isExactIsoInstant(to, toTime)).toBe(true);
  expect(isExactlyOneHour).toBe(true);
  expect(bracketsSaveAndTest).toBe(true);
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
