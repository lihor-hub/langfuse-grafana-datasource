import { dateTime, type TimeRange } from '@grafana/data';
import { buildMetricsQuery } from './metrics';
import { getMetricCapabilities } from './metricsCapabilities';

const range: TimeRange = {
  from: dateTime('2026-11-01'),
  to: dateTime('2026-11-02'),
  raw: { from: 'now-1d', to: 'now' },
};
const build = (value: object) => buildMetricsQuery({ refId: 'A', metricsQuery: JSON.stringify(value) }, range, 60000);

it('exposes complete observation measures including distinct counts and output throughput', () => {
  const capabilities = getMetricCapabilities('observations');
  expect(Object.keys(capabilities.measures)).toEqual(
    expect.arrayContaining([
      'count',
      'traceId',
      'uniqueUserIds',
      'uniqueSessionIds',
      'latency',
      'streamingLatency',
      'timeToFirstToken',
      'inputTokens',
      'outputTokens',
      'totalTokens',
      'tokensPerSecond',
      'outputTokensPerSecond',
      'inputCost',
      'outputCost',
      'totalCost',
      'countScores',
    ])
  );
  expect(build({ view: 'observations', metrics: [{ measure: 'uniqueUserIds', aggregation: 'uniq' }] }).metrics).toEqual(
    [{ measure: 'uniqueUserIds', aggregation: 'uniq' }]
  );
});

it.each(['observations', 'scores-numeric', 'scores-categorical'] as const)(
  'keeps identifiers filter-only in %s',
  (view) => {
    const capabilities = getMetricCapabilities(view);
    for (const id of ['id', 'traceId', 'userId', 'sessionId']) {
      expect(capabilities.dimensions).not.toContain(id);
      expect(capabilities.filters[id]).toBeDefined();
    }
  }
);

it.each([
  { view: 'scores-numeric', metrics: [{ measure: 'latency', aggregation: 'avg' }] },
  { view: 'scores-categorical', metrics: [{ measure: 'value', aggregation: 'avg' }] },
  {
    view: 'scores-numeric',
    metrics: [{ measure: 'count', aggregation: 'count' }],
    dimensions: [{ field: 'providedModelName' }],
  },
  { view: 'observations', metrics: [{ measure: 'latency', aggregation: 'avg', alias: 'injected' }] },
  {
    view: 'observations',
    metrics: [{ measure: 'count', aggregation: 'count' }],
    config: { row_limit: 10, unexpected: true },
  },
])('rejects invalid view-specific fields and nested properties', (value) => expect(() => build(value)).toThrow());

it('accepts stable numeric aggregations for count measures and rejects histogram on identifiers', () => {
  expect(build({ view: 'observations', metrics: [{ measure: 'count', aggregation: 'sum' }] }).metrics).toEqual([
    { measure: 'count', aggregation: 'sum' },
  ]);
  expect(() =>
    build({ view: 'observations', metrics: [{ measure: 'uniqueUserIds', aggregation: 'histogram' }] })
  ).toThrow();
});

it('rejects duplicate aliases and validates histogram bins', () => {
  expect(() =>
    build({
      view: 'observations',
      metrics: [
        { measure: 'count', aggregation: 'count' },
        { measure: 'count', aggregation: 'count' },
      ],
    })
  ).toThrow();
  expect(
    build({
      view: 'observations',
      metrics: [{ measure: 'latency', aggregation: 'histogram' }],
      config: { bins: 100, row_limit: 1000 },
    }).config.bins
  ).toBe(100);
  expect(() =>
    build({
      view: 'observations',
      metrics: [{ measure: 'latency', aggregation: 'histogram' }],
      config: { bins: 101, row_limit: 1000 },
    })
  ).toThrow();
});
