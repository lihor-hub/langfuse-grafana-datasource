import { dateTime, FieldType, type TimeRange } from '@grafana/data';

import { buildMetricsQuery, metricsToFrames } from './metrics';

const range: TimeRange = {
  from: dateTime('2026-11-01T00:00:00Z'),
  to: dateTime('2026-11-02T00:00:00Z'),
  raw: { from: 'now-1d', to: 'now' },
};

it('defaults to bounded observation counts and replaces saved timestamps with Grafana time', () => {
  const query = buildMetricsQuery({ refId: 'A' }, range, 60_000);
  expect(query).toMatchObject({
    view: 'observations',
    metrics: [{ measure: 'count', aggregation: 'count' }],
    fromTimestamp: range.from.toISOString(),
    toTimestamp: range.to.toISOString(),
    timeDimension: { granularity: 'minute' },
    config: { row_limit: 1000 },
  });
  const advanced = buildMetricsQuery(
    { refId: 'A', metricsQuery: JSON.stringify({ ...query, fromTimestamp: '2000-01-01', toTimestamp: '2000-01-02' }) },
    range,
    60_000
  );
  expect(advanced.fromTimestamp).toBe(range.from.toISOString());
  expect(advanced.toTimestamp).toBe(range.to.toISOString());
});

it.each([
  '{',
  'null',
  '{"view":"traces","metrics":[{"measure":"count","aggregation":"count"}]}',
  '{"view":"observations","metrics":[]}',
  '{"view":"observations","metrics":[{"measure":"count","aggregation":"count"}],"config":{"row_limit":1001}}',
  '{"view":"observations","metrics":[{"measure":"count","aggregation":"count"}],"dimensions":[{"field":"traceId"}]}',
  '{"view":"observations","metrics":[{"measure":"count","aggregation":"count"}],"url":"https://example.test"}',
])('rejects invalid or unsupported advanced queries without echoing their contents', (metricsQuery) => {
  expect(() => buildMetricsQuery({ refId: 'A', metricsQuery }, range, 60_000)).toThrow();
});

it('creates sorted time series per dimension combination with numeric types and units', () => {
  const query = buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'observations',
        metrics: [{ measure: 'totalCost', aggregation: 'sum' }],
        dimensions: [{ field: 'providedModelName' }],
        timeDimension: { granularity: 'hour' },
      }),
    },
    range,
    60_000
  );
  const frames = metricsToFrames(
    [
      { time_dimension: '2026-11-01T01:00:00Z', providedModelName: 'demo-model', sum_totalCost: '0.2' },
      { time_dimension: '2026-11-01T00:00:00Z', providedModelName: 'demo-model', sum_totalCost: null },
    ],
    query,
    'A'
  );
  expect(frames).toHaveLength(1);
  expect(frames[0].refId).toBe('A');
  expect(frames[0].fields[0]).toMatchObject({
    type: FieldType.time,
    values: [Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-11-01T01:00:00Z')],
  });
  expect(frames[0].fields[1]).toMatchObject({
    name: 'sum_totalCost',
    type: FieldType.number,
    labels: { providedModelName: 'demo-model' },
    config: { unit: 'currencyUSD' },
    values: [null, 0.2],
  });
});

it('returns a typed empty frame rather than manufacturing zero measurements', () => {
  const query = buildMetricsQuery({ refId: 'A' }, range, 60_000);
  const [frame] = metricsToFrames([], query, 'A');
  expect(frame.length).toBe(0);
  expect(frame.fields.map((field) => field.type)).toEqual([FieldType.time, FieldType.number]);
  expect(frame.fields[1].values).toEqual([]);
});

it('preserves dimension-first tables, multiple measures and latency milliseconds', () => {
  const query = buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'observations',
        metrics: [
          { measure: 'latency', aggregation: 'p95' },
          { measure: 'count', aggregation: 'count' },
        ],
        dimensions: [{ field: 'name' }],
      }),
    },
    range,
    60_000
  );
  const [frame] = metricsToFrames([{ name: 'demo-operation', p95_latency: 1200, count_count: 3 }], query, 'A');
  expect(frame.fields.map((field) => field.name)).toEqual(['name', 'p95_latency', 'count_count']);
  expect(frame.fields[1].config.unit).toBe('ms');
});

it('preserves extra response columns in deterministic table order', () => {
  const query = buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'observations',
        metrics: [{ measure: 'count', aggregation: 'count' }],
        dimensions: [{ field: 'name' }],
      }),
    },
    range,
    60000
  );
  const [frame] = metricsToFrames([{ name: 'synthetic', count_count: 2, z: { nested: true }, a: false }], query, 'A');
  expect(frame.fields.map((field) => field.name)).toEqual(['name', 'count_count', 'a', 'z']);
  expect(frame.fields[3].values).toEqual([{ nested: true }]);
});

it('preserves native number, boolean and array dimensions in tables', () => {
  const query = buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'observations',
        metrics: [{ measure: 'count', aggregation: 'count' }],
        dimensions: [{ field: 'promptVersion' }, { field: 'isRootObservation' }, { field: 'tags' }],
      }),
    },
    range,
    60000
  );
  const [frame] = metricsToFrames(
    [{ promptVersion: 2, isRootObservation: true, tags: ['synthetic', 'demo'], count_count: 1 }],
    query,
    'A'
  );
  expect(frame.fields.slice(0, 3).map((field) => field.type)).toEqual([
    FieldType.number,
    FieldType.boolean,
    FieldType.other,
  ]);
  expect(frame.fields.slice(0, 3).map((field) => field.values[0])).toEqual([2, true, ['synthetic', 'demo']]);
});

it('orders an unexpected time column before metrics in table output', () => {
  const query = buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'scores-categorical',
        metrics: [{ measure: 'count', aggregation: 'count' }],
        dimensions: [{ field: 'stringValue' }],
        orderBy: [{ field: 'count_count', direction: 'desc' }],
      }),
    },
    range,
    60000
  );
  const [frame] = metricsToFrames([{ stringValue: 'pass', time_dimension: '2026-11-01', count_count: 4 }], query, 'A');
  expect(frame.fields.map((field) => field.name)).toEqual(['stringValue', 'time_dimension', 'count_count']);
});

it('uses percentunit only for boolean averages, including per-series dataType labels', () => {
  const query = buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'scores-numeric',
        metrics: [{ measure: 'value', aggregation: 'avg' }],
        dimensions: [{ field: 'dataType' }],
        timeDimension: { granularity: 'hour' },
      }),
    },
    range,
    60000
  );
  const frames = metricsToFrames(
    [
      { dataType: 'BOOLEAN', time_dimension: '2026-11-01T00:00:00Z', avg_value: 0.75 },
      { dataType: 'NUMERIC', time_dimension: '2026-11-01T00:00:00Z', avg_value: 3 },
    ],
    query,
    'A'
  );
  expect(frames[0].fields[1].config.unit).toBe('percentunit');
  expect(frames[1].fields[1].config.unit).toBe('short');
  const filtered = {
    ...query,
    dimensions: [],
    filters: [{ column: 'dataType', type: 'string', operator: '=', value: 'BOOLEAN' }],
  };
  expect(metricsToFrames([], filtered, 'A')[0].fields[1].config.unit).toBe('percentunit');
});

it('uses throughput units and count units for numeric count/uniq aggregations', () => {
  const query = buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'observations',
        metrics: [
          { measure: 'outputTokensPerSecond', aggregation: 'avg' },
          { measure: 'latency', aggregation: 'uniq' },
        ],
      }),
    },
    range,
    60000
  );
  expect(metricsToFrames([], query, 'A')[0].fields.map((field) => field.config.unit)).toEqual(['cps', 'short']);
});

it('rejects malformed rows, timestamps and nonnumeric metrics', () => {
  const query = buildMetricsQuery({ refId: 'A' }, range, 60_000);
  expect(() => metricsToFrames([{ time_dimension: 'not-a-date', count_count: 3 }], query, 'A')).toThrow('incompatible');
  expect(() => metricsToFrames([{ time_dimension: '2026-11-01', count_count: 'not-a-number' }], query, 'A')).toThrow(
    'incompatible'
  );
  expect(() => metricsToFrames([null] as never, query, 'A')).toThrow('incompatible');
});
