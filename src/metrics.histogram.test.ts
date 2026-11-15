import { dateTime, DataFrameType, type TimeRange } from '@grafana/data';
import { buildMetricsQuery, metricsToFrames } from './metrics';
const range: TimeRange = {
  from: dateTime('2026-11-01'),
  to: dateTime('2026-11-02'),
  raw: { from: 'now-1d', to: 'now' },
};
const query = buildMetricsQuery(
  {
    refId: 'A',
    metricsQuery: JSON.stringify({
      view: 'observations',
      metrics: [{ measure: 'latency', aggregation: 'histogram' }],
      dimensions: [{ field: 'name' }],
      timeDimension: { granularity: 'hour' },
      config: { bins: 2, row_limit: 1000 },
    }),
  },
  range,
  3600000
);
it('returns explicit heatmap cells from unordered complete time/bucket/count tuples', () => {
  const [frame] = metricsToFrames(
    [
      {
        name: 'synthetic',
        time_dimension: '2026-11-01T01:00:00Z',
        histogram_latency: [
          [100, 200, 3],
          [0, 100, 2],
        ],
      },
      {
        name: 'synthetic',
        time_dimension: '2026-11-01T00:00:00Z',
        histogram_latency: [
          [0, 100, 1],
          [100, 200, 0],
        ],
      },
    ],
    query,
    'A'
  );
  expect(frame.meta).toMatchObject({ type: DataFrameType.HeatmapCells });
  expect(frame.fields.map((f) => f.name)).toEqual(['xMin', 'xMax', 'yMin', 'yMax', 'count']);
  expect(frame.fields[2].values).toEqual([0, 100, 0, 100]);
  expect(frame.fields[3].values).toEqual([100, 200, 100, 200]);
  expect(frame.fields[4].values).toEqual([1, 0, 2, 3]);
  expect(frame.fields[2].config.unit).toBe('ms');
  expect(frame.fields[4].labels).toEqual({ name: 'synthetic' });
});
it.each([
  { histogram_latency: [[0, 100, 2]] }, // no time
  { time_dimension: '2026-11-01T00:00:00Z', histogram_latency: [[100, 2]] }, // no bounds
  { time_dimension: 'not-a-time', histogram_latency: [[0, 100, 2]] },
  { time_dimension: '2026-11-01T00:00:00Z', histogram_latency: [[100, 0, 2]] },
  { time_dimension: '2026-11-01T00:00:00Z', histogram_latency: [[0, 100, -2]] },
  {
    time_dimension: '2026-11-01T00:00:00Z',
    histogram_latency: [
      [0, 100, 2],
      [200, 300, 1],
    ],
  },
])('falls back without losing uncertain or malformed tuple values: %j', (row) => {
  const [frame] = metricsToFrames([{ name: 'synthetic', ...row }], query, 'A');
  expect(frame.meta?.preferredVisualisationType).toBe('table');
  expect(frame.meta?.notices?.[0].text).toMatch(/Histogram.*table/);
  expect(frame.fields.find((field) => field.name === 'histogram_latency')?.values).toEqual([row.histogram_latency]);
});
it('falls back for changing bucket boundaries and preserves extra columns', () => {
  const rows = [
    { time_dimension: '2026-11-01T00:00:00Z', histogram_latency: [[0, 100, 2]], extra: { sample: true } },
    { time_dimension: '2026-11-01T01:00:00Z', histogram_latency: [[0, 200, 3]] },
  ];
  const [frame] = metricsToFrames(rows, query, 'A');
  expect(frame.meta?.preferredVisualisationType).toBe('table');
  expect(frame.fields.find((f) => f.name === 'histogram_latency')?.values).toEqual(
    rows.map((r) => r.histogram_latency)
  );
  expect(frame.fields.find((f) => f.name === 'extra')?.values[0]).toEqual({ sample: true });
});
it('does not discard unexpected response values when considering a heatmap', () => {
  const [frame] = metricsToFrames(
    [
      {
        name: 'synthetic',
        time_dimension: '2026-11-01T00:00:00Z',
        histogram_latency: [[0, 100, 2]],
        extra: { preserve: true },
      },
    ],
    query,
    'A'
  );
  expect(frame.meta?.preferredVisualisationType).toBe('table');
  expect(frame.fields.find((f) => f.name === 'extra')?.values).toEqual([{ preserve: true }]);
});

it('returns a valid empty histogram table with an honest output notice', () => {
  const [frame] = metricsToFrames([], query, 'A');
  expect(frame.length).toBe(0);
  expect(frame.meta?.preferredVisualisationType).toBe('table');
  expect(frame.fields.map((f) => f.name)).toEqual(['name', 'time_dimension', 'histogram_latency']);
});
