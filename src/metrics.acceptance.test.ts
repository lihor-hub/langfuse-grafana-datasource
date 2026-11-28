import {
  CoreApp,
  dateTime,
  FieldType,
  type DataFrame,
  type DataQueryRequest,
  type DataSourceInstanceSettings,
} from '@grafana/data';
import type { BackendSrv, BackendSrvRequest } from '@grafana/runtime';
import { lastValueFrom, of } from 'rxjs';

import { createGrafanaHttpClient } from './client/grafanaHttpClient';
import { DataSource } from './datasource';
import { DEFAULT_METRICS_QUERY } from './metrics';
import type { LangfuseDataSourceOptions, LangfuseQuery } from './types';

// Substitute only Grafana's HTTP boundary: translation, validation, response guards,
// dispatch, and frame conversion below are the production implementations.
const settings = {
  uid: 'metrics-acceptance',
  url: '/api/datasources/proxy/uid/metrics-acceptance',
  jsonData: {},
} as DataSourceInstanceSettings<LangfuseDataSourceOptions>;
const range = {
  from: dateTime('2026-11-01T00:00:00Z'),
  to: dateTime('2026-11-02T00:00:00Z'),
  raw: { from: 'now-1d', to: 'now' },
};
function setup(data: unknown) {
  const fetch = jest.fn((_request: BackendSrvRequest) => of({ data, status: 200 }));
  const datasource = new DataSource(settings, (options) =>
    createGrafanaHttpClient(options, { fetch } as unknown as BackendSrv)
  );
  const run = (target: Partial<LangfuseQuery>, selectedRange = range) =>
    lastValueFrom(
      datasource.query({
        targets: [{ refId: 'A', ...target }],
        intervalMs: 3_600_000,
        range: selectedRange,
      } as DataQueryRequest<LangfuseQuery>)
    );
  return { datasource, fetch, run };
}
const target = (definition: object) => ({ kind: 'metrics' as const, metricsQuery: JSON.stringify(definition) });

it('dispatches one default observation GET and returns short-unit time series', async () => {
  const { datasource, fetch, run } = setup({ data: [{ time_dimension: range.from.toISOString(), count_count: 7 }] });
  const defaults = datasource.getDefaultQuery(CoreApp.Dashboard);
  expect(JSON.parse(defaults.metricsQuery!)).toMatchObject({
    view: 'observations',
    metrics: [{ measure: 'count', aggregation: 'count' }],
    timeDimension: { granularity: 'auto' },
    config: { row_limit: 1000 },
  });
  const { data } = await run(defaults);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toMatchObject({
    method: 'GET',
    url: `${settings.url}/api/public/v2/metrics`,
    params: { query: expect.any(String) },
  });
  expect(JSON.parse(fetch.mock.calls[0][0].params!.query)).toMatchObject({
    fromTimestamp: range.from.toISOString(),
    toTimestamp: range.to.toISOString(),
    timeDimension: { granularity: 'hour' },
  });
  expect(data[0].fields).toMatchObject([
    { type: FieldType.time, values: [range.from.valueOf()] },
    { name: 'count_count', type: FieldType.number, config: { unit: 'short' }, values: [7] },
  ]);
});

it('replaces advanced timestamps on each dispatch without mutating the saved query', async () => {
  const { fetch, run } = setup({ data: [] });
  const saved = target({
    ...JSON.parse(DEFAULT_METRICS_QUERY),
    fromTimestamp: '2000-01-01',
    toTimestamp: '2000-01-02',
  });
  const original = saved.metricsQuery;
  await run(saved);
  const nextRange = { ...range, from: dateTime('2026-11-03'), to: dateTime('2026-11-04') };
  await run(saved, nextRange);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[1][0].params!.query)).toMatchObject({
    fromTimestamp: nextRange.from.toISOString(),
    toTimestamp: nextRange.to.toISOString(),
  });
  expect(saved.metricsQuery).toBe(original);
});

it('distinguishes an empty schema from malformed response failures at the data source boundary', async () => {
  const empty = await setup({ data: [] }).run({});
  expect(empty.data[0]).toMatchObject({ length: 0, fields: [{ type: FieldType.time }, { type: FieldType.number }] });
  for (const response of [
    { data: {} },
    { data: [{ time_dimension: 'invalid', count_count: 1 }] },
    { data: [{ time_dimension: range.from.toISOString() }] },
  ]) {
    await expect(setup(response).run({})).rejects.toThrow(/incompatible response/i);
  }
});

it('keeps multiple aliases distinct across dimension combinations and sorted timestamps', async () => {
  const { run } = setup({
    data: [
      {
        name: 'synthetic',
        environment: 'stage',
        time_dimension: '2026-11-01T01:00:00Z',
        count_count: 2,
        p95_latency: 20,
      },
      {
        name: 'synthetic',
        environment: 'prod',
        time_dimension: '2026-11-01T00:00:00Z',
        count_count: 3,
        p95_latency: 30,
      },
      {
        name: 'synthetic',
        environment: 'stage',
        time_dimension: '2026-11-01T00:00:00Z',
        count_count: 1,
        p95_latency: 10,
      },
    ],
  });
  const { data } = await run(
    target({
      ...JSON.parse(DEFAULT_METRICS_QUERY),
      metrics: [
        { measure: 'count', aggregation: 'count' },
        { measure: 'latency', aggregation: 'p95' },
      ],
      dimensions: [{ field: 'name' }, { field: 'environment' }],
    })
  );
  expect(data).toHaveLength(2);
  expect(data[0].fields.slice(1)).toMatchObject([
    { name: 'count_count', labels: { name: 'synthetic', environment: 'stage' }, values: [1, 2] },
    { name: 'p95_latency', labels: { name: 'synthetic', environment: 'stage' }, values: [10, 20] },
  ]);
  expect(data[1].fields[1].labels).toEqual({ name: 'synthetic', environment: 'prod' });
});

it.each([
  ['inputCost', 'currencyUSD'],
  ['outputCost', 'currencyUSD'],
  ['totalCost', 'currencyUSD'],
  ['latency', 'ms'],
  ['streamingLatency', 'ms'],
  ['timeToFirstToken', 'ms'],
  ['inputTokens', 'short'],
  ['outputTokens', 'short'],
  ['totalTokens', 'short'],
  ['tokensPerSecond', 'cps'],
  ['outputTokensPerSecond', 'cps'],
  ['count', 'short'],
])('preserves %s unit metadata through dispatch', async (measure, unit) => {
  const aggregation = measure === 'count' ? 'count' : 'avg';
  const alias = `${aggregation}_${measure}`;
  const { run } = setup({ data: [{ [alias]: 1 }] });
  const { data } = await run(target({ view: 'observations', metrics: [{ measure, aggregation }] }));
  expect(data[0].fields[0]).toMatchObject({ name: alias, config: { unit }, values: [1] });
});

it.each([
  ['scores-numeric', 'NUMERIC', 'value', 'avg', 3, 'short'],
  ['scores-numeric', 'BOOLEAN', 'value', 'avg', 0.75, 'percentunit'],
  ['scores-categorical', 'CATEGORICAL', 'count', 'count', 4, 'short'],
])(
  'uses the common metrics pipeline for %s/%s trends and tables',
  async (view, dataType, measure, aggregation, value, unit) => {
    const alias = `${aggregation}_${measure}`;
    const { fetch, run } = setup({
      data: [{ name: 'quality', dataType, time_dimension: range.from.toISOString(), [alias]: value }],
    });
    const definition = {
      view,
      metrics: [{ measure, aggregation }],
      dimensions: [{ field: 'name' }, { field: 'dataType' }],
      filters: [{ column: 'dataType', type: 'string', operator: '=', value: dataType }],
      orderBy: [{ field: alias, direction: 'desc' }],
    };
    const trend = await run(target({ ...definition, timeDimension: { granularity: 'hour' } }));
    expect(trend.data[0].fields[1]).toMatchObject({
      name: alias,
      labels: { name: 'quality', dataType },
      config: { unit },
      values: [value],
    });
    const table = await run(target(definition));
    expect(table.data[0].meta?.preferredVisualisationType).toBe('table');
    expect((table.data[0] as DataFrame).fields.map((field) => field.name)).toEqual([
      'name',
      'dataType',
      'time_dimension',
      alias,
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [request] of fetch.mock.calls) {
      expect(request.url).toBe(`${settings.url}/api/public/v2/metrics`);
      expect(JSON.parse(request.params!.query)).toMatchObject(definition);
    }
  }
);

it.each([
  { view: 'scores-boolean', metrics: [{ measure: 'value', aggregation: 'avg' }] },
  { view: 'scores-categorical', metrics: [{ measure: 'value', aggregation: 'avg' }] },
  { view: 'scores-numeric', metrics: [{ measure: 'latency', aggregation: 'avg' }] },
  { view: 'observations', metrics: [{ measure: 'traceId', aggregation: 'histogram' }] },
  { view: 'observations', metrics: [{ measure: 'count', aggregation: 'count' }], dimensions: [{ field: 'sessionId' }] },
])('never dispatches unsupported combinations: %j', async (definition) => {
  const { fetch, run } = setup({ data: [] });
  await expect(run(target(definition))).rejects.toThrow(/Invalid Langfuse query/);
  expect(fetch).not.toHaveBeenCalled();
});
