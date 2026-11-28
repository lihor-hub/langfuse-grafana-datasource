import {
  CoreApp,
  dateTime,
  type DataFrame,
  type DataQueryRequest,
  type DataSourceInstanceSettings,
  type ScopedVars,
} from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';

import type { LangfuseObservabilityClient } from './client/types';
import { DataSource } from './datasource';
import type { LangfuseDataSourceOptions, LangfuseQuery } from './types';

jest.mock('@grafana/runtime', () => ({ ...jest.requireActual('@grafana/runtime'), getTemplateSrv: jest.fn() }));

beforeEach(() => {
  jest.mocked(getTemplateSrv).mockReturnValue({
    replace: (text: string, scoped: ScopedVars, format: (value: unknown) => string) => {
      const name = text.replace(/^\$\{?|\}$/g, '');
      return scoped[name] ? format(scoped[name].value) : text;
    },
  } as unknown as ReturnType<typeof getTemplateSrv>);
});

const settings = {
  uid: 'mixed-fixture',
  url: '/api/datasources/proxy/uid/mixed-fixture',
  jsonData: {},
} as DataSourceInstanceSettings<LangfuseDataSourceOptions>;

function request(targets: LangfuseQuery[], app = CoreApp.Dashboard): DataQueryRequest<LangfuseQuery> {
  return {
    targets,
    app,
    scopedVars: {},
    intervalMs: 3_600_000,
    range: {
      from: dateTime('2026-11-01T00:00:00Z'),
      to: dateTime('2026-11-02T00:00:00Z'),
      raw: { from: 'now-1d', to: 'now' },
    },
  } as DataQueryRequest<LangfuseQuery>;
}

function client(): LangfuseObservabilityClient {
  return {
    checkConnection: jest.fn(),
    queryMetrics: jest.fn().mockResolvedValue({ data: [] }),
    listObservations: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    listScores: jest.fn().mockResolvedValue({ data: [], meta: { limit: 100 } }),
  };
}

it('dispatches mixed query kinds and preserves successful empty schemas with their refIds', async () => {
  const api = client();
  const datasource = new DataSource(settings, () => api);
  const result = await lastValueFrom(
    datasource.query(
      request([
        { refId: 'M', kind: 'metrics' },
        { refId: 'O', kind: 'observations' },
        { refId: 'S', kind: 'scores' },
        { refId: 'H', kind: 'observations', hide: true },
      ])
    )
  );
  expect(api.queryMetrics).toHaveBeenCalledTimes(1);
  expect(api.listObservations).toHaveBeenCalledTimes(1);
  expect(api.listScores).toHaveBeenCalledTimes(1);
  expect(new Set(result.data.map((frame) => frame.refId))).toEqual(new Set(['M', 'O', 'S']));
  expect(result.data.every((frame) => frame.length === 0 && frame.fields.length > 0)).toBe(true);
});

it('keeps dashboards on metrics but defaults new Explore queries to observation logs', () => {
  const datasource = new DataSource(settings, client);
  expect(datasource.getDefaultQuery(CoreApp.Dashboard).kind).toBe('metrics');
  const explore = datasource.getDefaultQuery(CoreApp.Explore);
  expect(explore.kind).toBe('observations');
  expect(JSON.parse(explore.observationsQuery!)).toEqual(expect.objectContaining({ format: 'logs' }));
});

it('validates each canonical JSON definition before dispatch without dropping successful peers', async () => {
  const api = client();
  const datasource = new DataSource(settings, () => api);
  const result = await lastValueFrom(
    datasource.query(
      request([
        { refId: 'M', kind: 'metrics' },
        { refId: 'O', kind: 'observations', observationsQuery: '{' },
        { refId: 'S', kind: 'scores', scoresQuery: '{' },
      ])
    )
  );
  expect(api.queryMetrics).toHaveBeenCalledTimes(1);
  expect(api.listObservations).not.toHaveBeenCalled();
  expect(api.listScores).not.toHaveBeenCalled();
  const notices = result.data
    .flatMap((frame) => frame.meta?.notices ?? [])
    .map((notice) => notice.text)
    .join(' ');
  expect(notices).toContain('O:');
  expect(notices).toContain('S:');
  expect(notices).toMatch(/invalid|valid JSON/i);
});

it('shares a four-target concurrency ceiling and cancellation across all query kinds', () => {
  const signals: AbortSignal[] = [];
  const pending = (_query: unknown, signal?: AbortSignal) => {
    signals.push(signal!);
    return new Promise<never>(() => {});
  };
  const api: LangfuseObservabilityClient = {
    checkConnection: jest.fn(),
    queryMetrics: jest.fn(pending),
    listObservations: jest.fn(pending),
    listScores: jest.fn(pending),
  };
  const datasource = new DataSource(settings, () => api);
  const subscription = datasource
    .query(
      request([
        { refId: 'M1', kind: 'metrics' },
        { refId: 'O1', kind: 'observations' },
        { refId: 'S1', kind: 'scores' },
        { refId: 'M2', kind: 'metrics' },
        { refId: 'O2', kind: 'observations' },
        { refId: 'S2', kind: 'scores' },
      ])
    )
    .subscribe();
  try {
    expect(signals).toHaveLength(4);
    expect(api.listObservations).toHaveBeenCalledTimes(1);
    expect(api.listScores).toHaveBeenCalledTimes(1);
  } finally {
    subscription.unsubscribe();
  }
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it('interpolates scoped membership, object-number and score CSV values before validation and dispatch', async () => {
  const api = client();
  const datasource = new DataSource(settings, () => api);
  const targets: LangfuseQuery[] = [
    {
      refId: 'M',
      metricsQuery: JSON.stringify({
        view: 'observations',
        metrics: [{ measure: 'count', aggregation: 'count' }],
        filters: [
          { type: 'number', column: 'promptVersion', operator: '>=', value: '$amount' },
          { type: 'stringOptions', column: 'environment', operator: 'any of', value: '$environments' },
        ],
      }),
    },
    {
      refId: 'O',
      kind: 'observations',
      observationsQuery: JSON.stringify({
        type: '$type',
        filters: [{ type: 'numberObject', column: 'metadata', key: 'synthetic', operator: '>=', value: '$amount' }],
      }),
    },
    {
      refId: 'S',
      kind: 'scores',
      scoresQuery:
        '{"source":"$source","dataType":"$dataType","value":"$values","valueMin":"$amount","ceiling":"$limit"}',
    },
  ];
  const saved = JSON.stringify(targets);
  const query = request(targets);
  query.scopedVars = {
    amount: { value: '2' },
    environments: { value: ['synthetic-a', 'synthetic-b'] },
    type: { value: 'SPAN' },
    source: { value: 'API' },
    dataType: { value: 'NUMERIC' },
    values: { value: ['2', '3'] },
    limit: { value: '2' },
  };
  await lastValueFrom(datasource.query(query));
  expect(JSON.parse(jest.mocked(api.queryMetrics).mock.calls[0][0].query).filters).toEqual([
    { type: 'number', column: 'promptVersion', operator: '>=', value: 2 },
    { type: 'stringOptions', column: 'environment', operator: 'any of', value: ['synthetic-a', 'synthetic-b'] },
  ]);
  expect(JSON.parse(jest.mocked(api.listObservations).mock.calls[0][0].filter!)).toEqual(
    expect.arrayContaining([
      { type: 'numberObject', column: 'metadata', key: 'synthetic', operator: '>=', value: 2 },
      { type: 'string', column: 'type', operator: '=', value: 'SPAN' },
    ])
  );
  expect(jest.mocked(api.listScores).mock.calls[0][0]).toEqual(
    expect.objectContaining({ source: 'API', dataType: 'NUMERIC', value: '2,3', valueMin: 2, limit: 2 })
  );
  expect(JSON.stringify(targets)).toBe(saved);
});

it('rejects scalar multi-value expansion without sending that target or dropping its successful peer', async () => {
  const api = client();
  const datasource = new DataSource(settings, () => api);
  const query = request([
    {
      refId: 'M',
      metricsQuery:
        '{"view":"observations","metrics":[{"measure":"count","aggregation":"count"}],"filters":[{"type":"string","column":"environment","operator":"=","value":"$environments"}]}',
    },
    { refId: 'S', kind: 'scores' },
  ]);
  query.scopedVars = { environments: { value: ['synthetic-a', 'synthetic-b'] } };
  const result = await lastValueFrom(datasource.query(query));
  expect(api.queryMetrics).not.toHaveBeenCalled();
  expect(api.listScores).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).toContain('M: Invalid Langfuse query');
});

it.each([CoreApp.Dashboard, CoreApp.Explore])(
  'passes configured UI links and context defaults through populated observation dispatch in %s without persisting bounds',
  async (app) => {
    const api = client();
    jest.mocked(api.listObservations).mockResolvedValue({
      data: [
        {
          endTime: null,
          parentObservationId: null,
          modelId: null,
          inputPrice: null,
          outputPrice: null,
          totalPrice: null,
          id: 'observation/1',
          projectId: 'project/1',
          traceId: 'trace/1',
          type: 'AGENT',
          name: 'synthetic agent',
          startTime: '2026-11-01T01:00:00Z',
        },
      ],
      meta: {},
    });
    const datasource = new DataSource(
      { ...settings, jsonData: { langfuseUiUrl: 'https://ui.example.test/langfuse/' } },
      () => api
    );
    const target: LangfuseQuery = {
      refId: 'O',
      kind: 'observations',
      observationsQuery: '{"logBody":"output","fieldGroups":["basic"]}',
    };
    const saved = JSON.stringify(target);
    const query = request([target], app);
    const first = await lastValueFrom(datasource.query(query));
    const frame: DataFrame = first.data[0];
    expect(frame.meta?.preferredVisualisationType).toBe(app === CoreApp.Explore ? 'logs' : 'table');
    expect(frame.fields.find(({ name }) => name === 'traceUrl')?.values).toEqual([
      'https://ui.example.test/langfuse/project/project%2F1/traces/trace%2F1',
    ]);
    expect(frame.fields.find(({ name }) => name === 'observationUrl')?.values).toEqual([
      'https://ui.example.test/langfuse/project/project%2F1/traces/trace%2F1?observation=observation%2F1',
    ]);
    expect(frame.fields.find(({ name }) => name === 'id')?.config.links?.[0].title).toBe(
      'View observation in Langfuse'
    );
    if (app === CoreApp.Explore) {
      expect(frame.fields.find(({ name }) => name === 'body')?.values).toEqual(['synthetic agent']);
      expect(frame.fields.find(({ name }) => name === 'labels')?.values).toEqual([{ type: 'AGENT' }]);
    }
    const refreshed = { ...query, range: { ...query.range, to: dateTime('2026-11-03T00:00:00Z') } };
    await lastValueFrom(datasource.query(refreshed));
    expect(jest.mocked(api.listObservations).mock.calls[1][0]).toMatchObject({
      toStartTime: refreshed.range.to.toISOString(),
      fields: 'core,basic',
    });
    expect(JSON.stringify(target)).toBe(saved);
  }
);

it('keeps discovery caching instance-local and forwards cancellation without a request', async () => {
  const api = client();
  jest.mocked(api.queryMetrics).mockResolvedValue({ data: [{ environment: 'synthetic' }] });
  const first = new DataSource(settings, () => api);
  const second = new DataSource({ ...settings, uid: 'second-fixture' }, () => api);
  const query = { view: 'observations', dimension: 'environment', lookback: '24h' } as const;
  const values = await Promise.all([first.metricFindQuery(query), first.metricFindQuery(query)]);
  expect(values).toEqual([[{ text: 'synthetic', value: 'synthetic' }], [{ text: 'synthetic', value: 'synthetic' }]]);
  expect(api.queryMetrics).toHaveBeenCalledTimes(1);
  await second.metricFindQuery(query);
  expect(api.queryMetrics).toHaveBeenCalledTimes(2);
  const controller = new AbortController();
  controller.abort();
  await expect(first.metricFindQuery(query, { signal: controller.signal })).rejects.toHaveProperty(
    'name',
    'AbortError'
  );
  expect(api.queryMetrics).toHaveBeenCalledTimes(2);
});
