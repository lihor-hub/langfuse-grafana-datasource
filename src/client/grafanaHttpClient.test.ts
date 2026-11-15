import type { DataSourceInstanceSettings } from '@grafana/data';
import type { BackendSrv, BackendSrvRequest } from '@grafana/runtime';
import { Observable, of, throwError } from 'rxjs';

import type { LangfuseDataSourceOptions } from '../types';
import { queryErrorMessage } from './errors';
import { createGrafanaHttpClient } from './grafanaHttpClient';

const settings = {
  url: '/api/datasources/proxy/uid/synthetic',
  jsonData: {},
} as DataSourceInstanceSettings<LangfuseDataSourceOptions>;

function transport(data: unknown, failure = false) {
  const fetch = jest.fn((_request: BackendSrvRequest) =>
    failure ? throwError(() => data) : of({ data, status: 200 })
  );
  return { fetch, client: createGrafanaHttpClient(settings, { fetch } as unknown as BackendSrv) };
}

function httpError(status: number, extra: Record<string, unknown> = {}) {
  return {
    status,
    data: { message: 'synthetic-secret', input: 'private-payload' },
    config: { headers: { Authorization: 'synthetic-secret' } },
    ...extra,
  };
}

const observation = {
  id: 'synthetic-observation',
  traceId: null,
  projectId: 'synthetic-project',
  type: 'SPAN',
  startTime: '2026-08-05T12:00:00Z',
};
const score = {
  id: 'synthetic-score',
  projectId: 'synthetic-project',
  name: 'quality',
  source: 'API',
  environment: 'test',
  timestamp: '2026-08-05T12:00:00Z',
  createdAt: '2026-08-05T12:00:00Z',
  updatedAt: '2026-08-05T12:00:00Z',
  dataType: 'NUMERIC',
  value: 1,
};

describe('response boundary guards', () => {
  it.each([undefined, null, '<html>private-payload</html>', {}, { data: {} }, { data: [null] }, { data: [[]] }])(
    'rejects malformed metrics envelopes without echoing their contents',
    async (data) => {
      const { client } = transport(data);
      const error = await client.queryMetrics({ query: '{}' }).catch((error: unknown) => error);
      expect(error).toMatchObject({ kind: 'malformed-response' });
      expect(queryErrorMessage(error)).not.toContain('private-payload');
    }
  );

  it('accepts empty and dynamic metrics rows without mutating the response', async () => {
    for (const data of [{ data: [] }, { data: [{ count_count: 0, histogram: [[1, 2]], environment: null }] }]) {
      await expect(transport(data).client.queryMetrics({ query: '{}' })).resolves.toBe(data);
    }
  });

  it.each([
    {},
    { data: [] },
    { data: [], meta: null },
    { data: [], meta: { cursor: 42 } },
    { data: [null], meta: {} },
    { data: [{}], meta: {} },
    { data: [{ ...observation, startTime: 'not-a-time' }], meta: {} },
    { data: [{ ...observation, traceId: 12 }], meta: {} },
    { data: [{ ...observation, usageDetails: { tokens: 'bad' } }], meta: {} },
    { data: [{ ...observation, name: {} }], meta: {} },
    { data: [{ ...observation, level: ['ERROR'] }], meta: {} },
  ])('rejects incompatible observation envelopes and rows', async (data) => {
    await expect(transport(data).client.listObservations({ limit: 1 })).rejects.toMatchObject({
      kind: 'malformed-response',
    });
  });

  it('accepts sparse field groups, arbitrary requested payloads and future observation types', async () => {
    const data = {
      data: [{ ...observation, type: 'FUTURE_TYPE', input: { arbitrary: true }, output: ['synthetic'], metadata: 42 }],
      meta: { cursor: 'next' },
    };
    await expect(transport(data).client.listObservations({ limit: 1 })).resolves.toBe(data);
    await expect(transport({ data: [], meta: {} }).client.listObservations({ limit: 1 })).resolves.toEqual({
      data: [],
      meta: {},
    });
  });

  it.each([
    {},
    { data: [] },
    { data: [], meta: {} },
    { data: [], meta: { limit: 101 } },
    { data: [], meta: { limit: 1, cursor: {} } },
    { data: [null], meta: { limit: 1 } },
    { data: [{ ...score, value: 'bad' }], meta: { limit: 1 } },
    { data: [{ ...score, dataType: 'BOOLEAN', value: 1 }], meta: { limit: 1 } },
    { data: [{ ...score, timestamp: null }], meta: { limit: 1 } },
    { data: [{ ...score, source: ['API'] }], meta: { limit: 1 } },
    { data: [{ ...score, dataType: ['TEXT'], value: 'synthetic' }], meta: { limit: 1 } },
    { data: [{ ...score, subject: { kind: ['trace'], id: 'synthetic' } }], meta: { limit: 1 } },
    { data: [{ ...score, subject: { kind: 'observation', id: 'synthetic', traceId: 42 } }], meta: { limit: 1 } },
  ])('rejects incompatible score envelopes and discriminated values', async (data) => {
    await expect(transport(data).client.listScores({ limit: 1 })).rejects.toMatchObject({ kind: 'malformed-response' });
  });

  it.each([
    ['NUMERIC', 1],
    ['BOOLEAN', false],
    ['CATEGORICAL', 'good'],
    ['TEXT', 'synthetic'],
    ['CORRECTION', ''],
  ])('accepts native %s score values', async (dataType, value) => {
    const data = { data: [{ ...score, dataType, value }], meta: { limit: 1 } };
    await expect(transport(data).client.listScores({ limit: 1 })).resolves.toBe(data);
    await expect(transport({ data: [], meta: { limit: 1 } }).client.listScores({ limit: 1 })).resolves.toEqual({
      data: [],
      meta: { limit: 1 },
    });
  });

  it.each([{}, { data: [] }, { data: [null] }, { data: [{ id: 42 }] }])(
    'rejects malformed projects before issuing the v4 probe',
    async (data) => {
      const { client, fetch } = transport(data);
      await expect(client.checkConnection()).rejects.toMatchObject({ kind: 'malformed-response' });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects pages exceeding the endpoint maximum instead of forwarding them to transformers', async () => {
    await expect(
      transport({ data: Array(1001).fill(observation), meta: {} }).client.listObservations({ limit: 1000 })
    ).rejects.toMatchObject({ kind: 'malformed-response' });
    await expect(
      transport({ data: Array(101).fill(score), meta: { limit: 100 } }).client.listScores({ limit: 100 })
    ).rejects.toMatchObject({ kind: 'malformed-response' });
  });

  it('validates the response from the bounded v4 probe', async () => {
    const fetch = jest
      .fn()
      .mockReturnValueOnce(of({ data: { data: [{ id: 'synthetic' }] } }))
      .mockReturnValueOnce(of({ data: { data: 'private-payload' } }));
    const client = createGrafanaHttpClient(settings, { fetch } as unknown as BackendSrv);
    await expect(client.checkConnection()).rejects.toMatchObject({ kind: 'malformed-response' });
  });
});

describe('HTTP error normalization', () => {
  it.each([
    [400, 'invalid-query'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'network'],
    [408, 'timeout'],
    [413, 'invalid-query'],
    [414, 'url-too-long'],
    [422, 'invalid-query'],
    [429, 'rate-limit'],
    [500, 'server'],
    [502, 'network'],
    [503, 'server'],
    [504, 'timeout'],
    [0, 'network'],
  ])('normalizes HTTP %s without preserving response data and performs one attempt', async (status, kind) => {
    const { client, fetch } = transport(httpError(Number(status)), true);
    const error = await client.queryMetrics({ query: '{}' }).catch((error: unknown) => error);
    expect(error).toMatchObject({ kind, status });
    expect(JSON.stringify(error)).not.toMatch(/synthetic-secret|private-payload|Authorization/);
    expect(queryErrorMessage(error)).not.toMatch(/synthetic-secret|private-payload|Authorization/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ retry: 0, showErrorAlert: false, headers: undefined })
    );
  });

  it.each(['Authentication to data source failed', { message: 'Authentication to data source failed' }])(
    'preserves Grafana proxy authentication classification',
    async (data) => {
      const { client } = transport(httpError(400, { data }), true);
      await expect(client.queryMetrics({ query: '{}' })).rejects.toMatchObject({ kind: 'unauthorized' });
    }
  );

  it('classifies v4 incompatibility only after a successful project probe', async () => {
    const { client } = transport(httpError(404), true);
    await expect(client.listObservations({ limit: 1 })).rejects.toMatchObject({ kind: 'network' });
    const fetch = jest
      .fn()
      .mockReturnValueOnce(of({ data: { data: [{ id: 'synthetic-project' }] }, status: 200 }))
      .mockReturnValueOnce(throwError(() => httpError(404)));
    const probe = createGrafanaHttpClient(settings, { fetch } as unknown as BackendSrv);
    await expect(probe.checkConnection()).rejects.toMatchObject({ kind: 'v4-required' });
  });

  it.each([
    ['120', '120 seconds'],
    ['0', '0 seconds'],
    ['Wed, 21 Oct 2026 07:28:00 GMT', 'Wed, 21 Oct 2026 07:28:00 GMT'],
    ['synthetic-secret', undefined],
    ['-1', undefined],
    ['1\r\nAuthorization: synthetic-secret', undefined],
  ])('only displays validated Retry-After %s and never schedules a retry', async (header, expected) => {
    const { client, fetch } = transport(httpError(429, { headers: { 'Retry-After': header } }), true);
    const error = await client.queryMetrics({ query: '{}' }).catch((error: unknown) => error);
    const message = queryErrorMessage(error);
    expect(message).toContain('no automatic retry');
    expect(message).not.toContain('synthetic-secret');
    if (expected) {
      expect(message).toContain(`Retry-After: ${expected}`);
    } else {
      expect(message).not.toContain('Retry-After:');
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads native Headers and tolerates unavailable Retry-After', async () => {
    const { client } = transport(httpError(429, { headers: new Headers({ 'retry-after': '30' }) }), true);
    await expect(client.queryMetrics({ query: '{}' }).catch(queryErrorMessage)).resolves.toContain('30 seconds');
    const missing = transport(httpError(429), true);
    await expect(missing.client.queryMetrics({ query: '{}' }).catch(queryErrorMessage)).resolves.toContain(
      'Retry timing is unavailable'
    );
  });

  it.each([
    [new DOMException('synthetic-secret', 'AbortError'), 'cancelled'],
    [new DOMException('synthetic-secret', 'TimeoutError'), 'timeout'],
    [new SyntaxError('private-payload'), 'malformed-response'],
    [new TypeError('synthetic-secret'), 'network'],
    [httpError(-1, { cancelled: true }), 'cancelled'],
  ])('classifies transport failures without error text', async (failure, kind) => {
    const { client } = transport(failure, true);
    await expect(client.queryMetrics({ query: '{}' })).rejects.toMatchObject({ kind });
  });

  it.each([
    ['api/datasources/proxy/uid/synthetic', 'api/datasources/proxy/uid/synthetic/api/public/v2/metrics'],
    [
      '/grafana/api/datasources/proxy/uid/synthetic/',
      '/grafana/api/datasources/proxy/uid/synthetic/api/public/v2/metrics',
    ],
    [
      'https://grafana.example.invalid/grafana/api/datasources/proxy/uid/synthetic',
      'https://grafana.example.invalid/grafana/api/datasources/proxy/uid/synthetic/api/public/v2/metrics',
    ],
  ])('preserves Grafana relative, subpath and absolute proxy URL %s', async (url, expected) => {
    const fetch = jest.fn(() => of({ data: { data: [] } }));
    const client = createGrafanaHttpClient({ ...settings, url }, { fetch } as unknown as BackendSrv);
    await expect(client.queryMetrics({ query: '{}' })).resolves.toEqual({ data: [] });
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ url: expected }));
  });

  it('rejects missing or unsafe proxy URLs before sending a request', async () => {
    for (const url of [
      undefined,
      '',
      'javascript:alert(1)',
      'https://user:synthetic-secret@example.invalid',
      '//example.invalid',
    ]) {
      const fetch = jest.fn();
      const client = createGrafanaHttpClient({ ...settings, url }, { fetch } as unknown as BackendSrv);
      await expect(client.queryMetrics({ query: '{}' })).rejects.toMatchObject({ kind: 'configuration' });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('does not start pre-cancelled requests and cancels active subscriptions', async () => {
    const controller = new AbortController();
    controller.abort('synthetic-secret');
    const pre = transport({ data: [] });
    await expect(pre.client.queryMetrics({ query: '{}' }, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    expect(pre.fetch).not.toHaveBeenCalled();

    const active = new AbortController();
    const cleanup = jest.fn();
    const fetch = jest.fn(() => new Observable(() => cleanup));
    const client = createGrafanaHttpClient(settings, { fetch } as unknown as BackendSrv);
    const pending = client.queryMetrics({ query: '{}' }, active.signal);
    active.abort('private-payload');
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: active.signal }));
  });
});
