import type { DataSourceInstanceSettings } from '@grafana/data';
import { setBackendSrv, type BackendSrv, type BackendSrvRequest, type FetchResponse } from '@grafana/runtime';
import { of, throwError } from 'rxjs';

import { DataSource } from './datasource';
import { LangfuseClientError } from './client/errors';
import { createLangfuseCoreClient } from './client/langfuseCoreClient';
import { createGrafanaHttpClient } from './client/grafanaHttpClient';
import { createObservabilityClient } from './client/createClient';
import type { LangfuseObservabilityClient } from './client/types';
import type { LangfuseDataSourceOptions } from './types';

function instanceSettings(
  overrides: Partial<DataSourceInstanceSettings<LangfuseDataSourceOptions>> = {}
): DataSourceInstanceSettings<LangfuseDataSourceOptions> {
  return {
    uid: 'langfuse-test',
    type: 'lihorhub-langfuse-datasource',
    name: 'Langfuse test',
    meta: {} as DataSourceInstanceSettings<LangfuseDataSourceOptions>['meta'],
    readOnly: false,
    url: '/api/datasources/proxy/uid/langfuse-test',
    jsonData: { timeout: 30 },
    access: 'proxy',
    ...overrides,
  };
}

function clientWithConnection(
  checkConnection: LangfuseObservabilityClient['checkConnection']
): LangfuseObservabilityClient {
  return {
    checkConnection,
    queryMetrics: jest.fn(),
    listObservations: jest.fn(),
    listScores: jest.fn(),
  };
}

describe('DataSource.testDatasource', () => {
  it('rejects a missing Grafana proxy URL without making a request', async () => {
    const datasource = new DataSource(instanceSettings({ url: undefined }));

    await expect(datasource.testDatasource()).resolves.toEqual({
      status: 'error',
      message: 'Langfuse base URL is required.',
    });
  });

  it('classifies invalid credentials without echoing upstream details', async () => {
    const client = clientWithConnection(() =>
      Promise.reject(new LangfuseClientError('unauthorized', 'Unauthorized sk-browser-sentinel'))
    );
    const datasource = new DataSource(instanceSettings(), () => client);

    const result = await datasource.testDatasource();

    expect(result).toEqual({
      status: 'error',
      message: 'Invalid Langfuse credentials. Check the public and secret keys.',
    });
    expect(JSON.stringify(result)).not.toContain('sk-browser-sentinel');
  });

  it('reports when the configured server lacks Observations v2', async () => {
    const client = clientWithConnection(() =>
      Promise.reject(new LangfuseClientError('v4-required', 'GET /api/public/v2/observations returned 404'))
    );
    const datasource = new DataSource(instanceSettings(), () => client);

    await expect(datasource.testDatasource()).resolves.toEqual({
      status: 'error',
      message: 'Langfuse v4 is required; the Observations v2 endpoint is unavailable.',
    });
  });

  it('reports the validated Langfuse v4 project', async () => {
    const client = clientWithConnection(() => Promise.resolve({ projectId: 'project-123', apiVersion: 'v4' }));
    const datasource = new DataSource(instanceSettings(), () => client);

    await expect(datasource.testDatasource()).resolves.toEqual({
      status: 'success',
      message: 'Connected to Langfuse v4 project project-123.',
    });
  });

  it('uses createObservabilityClient when Grafana constructs the data source', async () => {
    setBackendSrv({
      fetch: jest.fn((request: BackendSrvRequest) => {
        const data = request.url.endsWith('/api/public/projects')
          ? { data: [{ id: 'project-default' }] }
          : { data: [], meta: {} };
        return of({ data, status: 200, statusText: 'OK' } as FetchResponse<typeof data>);
      }),
    } as unknown as BackendSrv);
    const datasource = new DataSource(instanceSettings());

    await expect(datasource.testDatasource()).resolves.toEqual({
      status: 'success',
      message: 'Connected to Langfuse v4 project project-default.',
    });
  });
});

describe('Langfuse core adapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('checks projects then a bounded Observations v2 page without browser credentials', async () => {
    const seenRequests: Array<{ url: string; headers: Record<string, string>; body?: string }> = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        seenRequests.push({
          url,
          headers: Object.fromEntries(
            Object.entries(init?.headers ?? {}).map(([name, value]) => [name.toLowerCase(), String(value)])
          ),
          body: typeof init?.body === 'string' ? init.body : undefined,
        });

        if (url.endsWith('/api/public/projects')) {
          return jsonResponse({
            data: [
              {
                id: 'project-123',
                name: 'Test project',
                organization: { id: 'org-123', name: 'Test org' },
                metadata: {},
              },
            ],
          });
        }

        return jsonResponse({ data: [], meta: {} });
      }),
    });
    const client = createLangfuseCoreClient(
      instanceSettings({
        username: 'pk-browser-sentinel',
        password: 'sk-browser-sentinel',
        basicAuth: 'Basic c2stYnJvd3Nlci1zZW50aW5lbA==',
      }),
      () => new Date('2026-08-05T12:00:00.000Z')
    );

    await expect(client.checkConnection()).resolves.toEqual({
      projectId: 'project-123',
      apiVersion: 'v4',
    });

    expect(seenRequests).toHaveLength(2);
    expect(new URL(seenRequests[0].url, 'https://grafana.test').pathname).toBe(
      '/api/datasources/proxy/uid/langfuse-test/api/public/projects'
    );
    const observationUrl = new URL(seenRequests[1].url, 'https://grafana.test');
    expect(observationUrl.pathname).toBe('/api/datasources/proxy/uid/langfuse-test/api/public/v2/observations');
    expect(Object.fromEntries(observationUrl.searchParams)).toEqual({
      fields: 'core',
      limit: '1',
      fromStartTime: '2026-08-05T11:00:00.000Z',
      toStartTime: '2026-08-05T12:00:00.000Z',
    });
    expect(JSON.stringify(seenRequests)).not.toContain('sk-browser-sentinel');
    expect(seenRequests.every(({ headers }) => headers.authorization === undefined)).toBe(true);
  });

  it('exposes only the four read methods and forwards each read request', async () => {
    const seenUrls: string[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        seenUrls.push(url);
        if (url.includes('/metrics')) {
          return jsonResponse({ data: [{ count_count: 7 }] });
        }
        if (url.includes('/observations')) {
          return jsonResponse({ data: [], meta: {} });
        }
        return jsonResponse({ data: [], meta: { limit: 1 } });
      }),
    });
    const client = createLangfuseCoreClient(instanceSettings());

    await expect(client.queryMetrics({ query: '{"view":"observations"}' })).resolves.toEqual({
      data: [{ count_count: 7 }],
    });
    await expect(client.listObservations({ fields: 'core', limit: 2 })).resolves.toEqual({
      data: [],
      meta: {},
    });
    await expect(client.listScores({ fields: 'details', limit: 1 })).resolves.toEqual({
      data: [],
      meta: { limit: 1 },
    });

    expect(Object.keys(client).sort()).toEqual(['checkConnection', 'listObservations', 'listScores', 'queryMetrics']);
    expect(seenUrls.map((url) => new URL(url, 'https://grafana.test').pathname)).toEqual([
      '/api/datasources/proxy/uid/langfuse-test/api/public/v2/metrics',
      '/api/datasources/proxy/uid/langfuse-test/api/public/v2/observations',
      '/api/datasources/proxy/uid/langfuse-test/api/public/v3/scores',
    ]);
  });

  it('propagates cancellation to the browser fetch', async () => {
    let receivedSignal: AbortSignal | undefined;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        receivedSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          const fallback = setTimeout(() => reject(new Error('request was not aborted')), 20);
          receivedSignal?.addEventListener('abort', () => {
            clearTimeout(fallback);
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      }),
    });
    const client = createLangfuseCoreClient(instanceSettings());
    const controller = new AbortController();

    const pending = client.queryMetrics({ query: '{"view":"observations"}' }, controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    expect(receivedSignal?.aborted).toBe(true);
  });
});

describe('Grafana HTTP adapter', () => {
  it('uses BackendSrv for the same bounded connection probe without an Authorization header', async () => {
    const requests: BackendSrvRequest[] = [];
    const backendSrv = {
      fetch: jest.fn((request: BackendSrvRequest) => {
        requests.push(request);
        const data = request.url.endsWith('/api/public/projects')
          ? { data: [{ id: 'project-native' }] }
          : { data: [], meta: {} };
        return of({ data, status: 200, statusText: 'OK' } as FetchResponse<typeof data>);
      }),
    } as unknown as BackendSrv;
    const client = createGrafanaHttpClient(instanceSettings(), backendSrv, () => new Date('2026-08-05T12:00:00.000Z'));
    const signal = new AbortController().signal;

    await expect(client.checkConnection(signal)).resolves.toEqual({
      projectId: 'project-native',
      apiVersion: 'v4',
    });

    expect(requests).toEqual([
      expect.objectContaining({
        method: 'GET',
        url: '/api/datasources/proxy/uid/langfuse-test/api/public/projects',
        abortSignal: signal,
        headers: undefined,
      }),
      expect.objectContaining({
        method: 'GET',
        url: '/api/datasources/proxy/uid/langfuse-test/api/public/v2/observations',
        abortSignal: signal,
        params: {
          fields: 'core',
          limit: 1,
          fromStartTime: '2026-08-05T11:00:00.000Z',
          toStartTime: '2026-08-05T12:00:00.000Z',
        },
        headers: undefined,
      }),
    ]);
  });

  it('maps Grafana proxy authentication failures to the invalid-credentials response', async () => {
    const backendSrv = backendSrvRejecting(400, 'Authentication to data source failed');
    const datasource = new DataSource(instanceSettings(), (settings) => createGrafanaHttpClient(settings, backendSrv));

    await expect(datasource.testDatasource()).resolves.toEqual({
      status: 'error',
      message: 'Invalid Langfuse credentials. Check the public and secret keys.',
    });
  });

  it('maps Grafana frontend-normalized proxy authentication failures to invalid credentials', async () => {
    const backendSrv = backendSrvRejecting(400, {
      message: 'Authentication to data source failed',
      error: 'Bad Request',
      response: 'Authentication to data source failed',
    });
    const datasource = new DataSource(instanceSettings(), (settings) => createGrafanaHttpClient(settings, backendSrv));

    await expect(datasource.testDatasource()).resolves.toEqual({
      status: 'error',
      message: 'Invalid Langfuse credentials. Check the public and secret keys.',
    });
  });

  it('keeps unrelated Grafana proxy HTTP 400 responses unexpected and sanitized', async () => {
    const backendSrv = backendSrvRejecting(400, 'Invalid request sk-upstream-sentinel');
    const datasource = new DataSource(instanceSettings(), (settings) => createGrafanaHttpClient(settings, backendSrv));

    const result = await datasource.testDatasource();

    expect(result).toEqual({
      status: 'error',
      message: 'Cannot validate the Langfuse data source.',
    });
    expect(JSON.stringify(result).includes('sk-upstream-sentinel')).toBe(false);
  });
});

describe('createObservabilityClient', () => {
  it('returns only the narrow read-only client interface', () => {
    const client = createObservabilityClient(instanceSettings());

    expect(Object.keys(client).sort()).toEqual(['checkConnection', 'listObservations', 'listScores', 'queryMetrics']);
  });
});

function jsonResponse(data: unknown, status = 200): Response {
  const text = JSON.stringify(data);
  return {
    body: {} as ReadableStream,
    bodyUsed: false,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    } as Headers,
    ok: status >= 200 && status < 400,
    redirected: false,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    type: 'basic',
    url: '',
    text: async () => text,
  } as Response;
}

function backendSrvRejecting(status: number, data: unknown): BackendSrv {
  return {
    fetch: jest.fn((request: BackendSrvRequest) =>
      throwError(() => ({ status, data, statusText: 'Bad Request', config: request }))
    ),
  } as unknown as BackendSrv;
}
