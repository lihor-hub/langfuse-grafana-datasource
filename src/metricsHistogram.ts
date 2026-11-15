import { DataFrameType, FieldType, type DataFrame, type Field } from '@grafana/data';
import type { MetricsDefinition } from './metrics';
import { getMetricCapabilities } from './metricsCapabilities';

type Row = Record<string, unknown>;
type Bucket = [number, number, number];
function buckets(value: unknown): Bucket[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(
      (tuple) =>
        !Array.isArray(tuple) ||
        tuple.length !== 3 ||
        tuple.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
        tuple[0] >= tuple[1] ||
        tuple[2] < 0
    )
  ) {
    return undefined;
  }
  const sorted = [...(value as Bucket[])].sort((a, b) => a[0] - b[0]);
  if (sorted.some((tuple, index) => index > 0 && sorted[index - 1][1] !== tuple[0])) {
    return undefined;
  }
  return sorted;
}
function endTime(start: number, granularity: string): number {
  const date = new Date(start);
  switch (granularity) {
    case 'minute':
      return start + 60000;
    case 'hour':
      return start + 3600000;
    case 'day':
      return start + 86400000;
    case 'week':
      return start + 604800000;
    case 'month':
      date.setUTCMonth(date.getUTCMonth() + 1);
      return date.valueOf();
    default:
      return NaN;
  }
}
function fallback(rows: Row[], query: MetricsDefinition, refId: string): DataFrame[] {
  const names = [
    ...query.dimensions.map(({ field }) => field),
    ...(query.timeDimension ? ['time_dimension'] : []),
    ...query.metrics.map((metric) => `${metric.aggregation}_${metric.measure}`),
  ];
  names.push(...[...new Set(rows.flatMap(Object.keys))].filter((name) => !names.includes(name)).sort());
  const fields: Field[] = names.map((name) => ({
    name,
    type: FieldType.other,
    config: {},
    values: rows.map((row) => row[name] ?? null),
  }));
  return [
    {
      refId,
      fields,
      length: rows.length,
      meta: {
        preferredVisualisationType: 'table',
        notices: [
          {
            severity: 'info',
            text: 'Histogram output: table. Complete, consistent bucket bounds and time buckets are required for a heatmap; original values are preserved.',
          },
        ],
      },
    },
  ];
}

/** ClickHouse histogram tuples are [lower, upper, height]; never infer missing edges from adjacent counts. */
export function histogramToFrames(rows: Row[], query: MetricsDefinition, refId: string): DataFrame[] {
  if (!query.timeDimension || rows.length === 0 || query.metrics.length !== 1) {
    return fallback(rows, query, refId);
  }
  const metric = query.metrics[0];
  const alias = `${metric.aggregation}_${metric.measure}`;
  const known = new Set([...query.dimensions.map(({ field }) => field), 'time_dimension', alias]);
  if (rows.some((row) => Object.keys(row).some((key) => !known.has(key)))) {
    return fallback(rows, query, refId);
  }
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = JSON.stringify(query.dimensions.map(({ field }) => row[field] ?? null));
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const frames: DataFrame[] = [];
  for (const group of groups.values()) {
    const timed = group
      .map((row) => ({
        row,
        time: typeof row.time_dimension === 'string' ? Date.parse(row.time_dimension) : NaN,
        bins: buckets(row[alias]),
      }))
      .sort((a, b) => a.time - b.time);
    const boundaries = JSON.stringify(timed[0].bins?.map(([lower, upper]) => [lower, upper]));
    if (
      timed.some(
        (entry, index) =>
          !entry.bins ||
          !Number.isFinite(entry.time) ||
          !Number.isFinite(endTime(entry.time, query.timeDimension!.granularity)) ||
          JSON.stringify(entry.bins.map(([lower, upper]) => [lower, upper])) !== boundaries ||
          (index > 0 && endTime(timed[index - 1].time, query.timeDimension!.granularity) !== entry.time)
      )
    ) {
      return fallback(rows, query, refId);
    }
    const labels = Object.fromEntries(
      query.dimensions.map(({ field }) => [
        field,
        typeof group[0][field] === 'object' ? JSON.stringify(group[0][field]) : String(group[0][field] ?? '(unset)'),
      ])
    );
    const unit = getMetricCapabilities(query.view).measures[metric.measure].unit;
    const fields: Field[] = [
      { name: 'xMin', type: FieldType.time, config: {}, values: [] },
      { name: 'xMax', type: FieldType.time, config: {}, values: [] },
      { name: 'yMin', type: FieldType.number, config: { unit }, values: [] },
      { name: 'yMax', type: FieldType.number, config: { unit }, values: [] },
      { name: 'count', type: FieldType.number, config: { unit: 'short' }, labels, values: [] },
    ];
    for (const { time, bins } of timed) {
      for (const [lower, upper, count] of bins!) {
        [time, endTime(time, query.timeDimension.granularity), lower, upper, count].forEach((value, index) =>
          fields[index].values.push(value)
        );
      }
    }
    frames.push({
      refId,
      name: alias,
      fields,
      length: fields[0].values.length,
      meta: {
        type: DataFrameType.HeatmapCells,
        notices: [{ severity: 'info', text: 'Histogram output: heatmap (explicit time and bucket bounds).' }],
      },
    });
  }
  return frames;
}
