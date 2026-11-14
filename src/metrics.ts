import { FieldType, type DataFrame, type Field, type TimeRange } from '@grafana/data';

import type { LangfuseQuery } from './types';

export interface MetricsDefinition {
  view: 'observations' | 'scores-numeric' | 'scores-categorical';
  metrics: Array<{ measure: string; aggregation: string }>;
  dimensions: Array<{ field: string }>;
  filters: Array<Record<string, unknown>>;
  timeDimension?: { granularity: string };
  orderBy?: Array<{ field: string; direction: string }>;
  config: { row_limit: number };
  fromTimestamp: string;
  toTimestamp: string;
}

export const DEFAULT_METRICS_QUERY = JSON.stringify(
  {
    view: 'observations',
    metrics: [{ measure: 'count', aggregation: 'count' }],
    dimensions: [],
    filters: [],
    timeDimension: { granularity: 'auto' },
    config: { row_limit: 1000 },
  },
  null,
  2
);

const DIMENSIONS = new Set([
  'name',
  'type',
  'level',
  'environment',
  'providedModelName',
  'traceName',
  'release',
  'version',
  'promptName',
  'promptVersion',
  'tags',
  'dataType',
  'source',
  'stringValue',
]);
const OBSERVATION_MEASURES = new Set([
  'count',
  'latency',
  'streamingLatency',
  'timeToFirstToken',
  'totalCost',
  'inputCost',
  'outputCost',
  'totalTokens',
  'inputTokens',
  'outputTokens',
  'tokensPerSecond',
]);
const AGGREGATIONS = new Set(['count', 'sum', 'avg', 'min', 'max', 'p50', 'p75', 'p90', 'p95', 'p99']);
const INCOMPATIBLE = 'Langfuse returned an incompatible metrics response.';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildMetricsQuery(target: LangfuseQuery, range: TimeRange, intervalMs: number): MetricsDefinition {
  if (target.kind && target.kind !== 'metrics') {
    throw new Error('This query editor currently supports aggregate metrics only.');
  }
  let value: unknown;
  try {
    value = JSON.parse(target.metricsQuery ?? DEFAULT_METRICS_QUERY);
  } catch {
    throw new Error('Metrics query must be valid JSON.');
  }
  if (!record(value)) {
    throw new Error('Metrics query must be a JSON object.');
  }
  const allowed = new Set([
    'view',
    'metrics',
    'dimensions',
    'filters',
    'timeDimension',
    'orderBy',
    'config',
    'fromTimestamp',
    'toTimestamp',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('Unsupported metrics query property. Use the documented Metrics v2 query format.');
  }
  if (!['observations', 'scores-numeric', 'scores-categorical'].includes(String(value.view))) {
    throw new Error('Select an observations, scores-numeric or scores-categorical metrics view.');
  }
  const measures =
    value.view === 'observations'
      ? OBSERVATION_MEASURES
      : new Set(value.view === 'scores-numeric' ? ['count', 'value'] : ['count']);
  if (
    !Array.isArray(value.metrics) ||
    value.metrics.length === 0 ||
    value.metrics.some(
      (metric) =>
        !record(metric) ||
        !measures.has(String(metric.measure)) ||
        !AGGREGATIONS.has(String(metric.aggregation)) ||
        (metric.measure === 'count' && metric.aggregation !== 'count') ||
        (metric.measure !== 'count' && metric.aggregation === 'count')
    )
  ) {
    throw new Error('Select supported metrics and aggregations for this view.');
  }
  const dimensions = value.dimensions ?? [];
  if (
    !Array.isArray(dimensions) ||
    dimensions.some((dimension) => !record(dimension) || !DIMENSIONS.has(String(dimension.field)))
  ) {
    throw new Error('Select supported low-cardinality dimensions; identifiers are not grouping dimensions.');
  }
  const filters = value.filters ?? [];
  if (
    !Array.isArray(filters) ||
    filters.some(
      (filter) =>
        !record(filter) ||
        typeof filter.type !== 'string' ||
        typeof filter.column !== 'string' ||
        typeof filter.operator !== 'string' ||
        !('value' in filter)
    )
  ) {
    throw new Error('Filters must be structured Langfuse filter objects.');
  }
  const config = value.config ?? { row_limit: 1000 };
  if (
    !record(config) ||
    !Number.isInteger(config.row_limit) ||
    Number(config.row_limit) < 1 ||
    Number(config.row_limit) > 1000
  ) {
    throw new Error('Metrics row_limit must be an integer from 1 to 1000.');
  }
  let timeDimension = value.timeDimension;
  if (timeDimension !== undefined) {
    if (
      !record(timeDimension) ||
      !['auto', 'minute', 'hour', 'day', 'week', 'month'].includes(String(timeDimension.granularity))
    ) {
      throw new Error('Select a supported time granularity.');
    }
    if (timeDimension.granularity === 'auto') {
      const granularity =
        intervalMs <= 60_000
          ? 'minute'
          : intervalMs <= 3_600_000
            ? 'hour'
            : intervalMs <= 86_400_000
              ? 'day'
              : intervalMs <= 604_800_000
                ? 'week'
                : 'month';
      timeDimension = { granularity };
    }
  }
  const aliases = new Set(value.metrics.map((metric) => `${metric.aggregation}_${metric.measure}`));
  const orderFields = new Set([
    ...aliases,
    ...dimensions.map((dimension) => dimension.field),
    ...(timeDimension ? ['time_dimension'] : []),
  ]);
  if (
    value.orderBy !== undefined &&
    (!Array.isArray(value.orderBy) ||
      value.orderBy.some(
        (order) =>
          !record(order) || !orderFields.has(String(order.field)) || !['asc', 'desc'].includes(String(order.direction))
      ))
  ) {
    throw new Error('Ordering must reference a selected metric, dimension or time_dimension.');
  }
  if (!range.from.isValid() || !range.to.isValid() || range.from.valueOf() >= range.to.valueOf()) {
    throw new Error('Select a valid increasing Grafana time range.');
  }
  const query = {
    ...value,
    dimensions,
    filters,
    config,
    ...(timeDimension ? { timeDimension } : {}),
    fromTimestamp: range.from.toISOString(),
    toTimestamp: range.to.toISOString(),
  } as MetricsDefinition;
  if (encodeURIComponent(JSON.stringify(query)).length > 8000) {
    throw new Error('Metrics query is too large for a safe proxy URL. Reduce filters or dimensions.');
  }
  return query;
}

function metricValue(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '') ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error(INCOMPATIBLE);
  }
  return Number(value);
}

function metricFields(query: MetricsDefinition): Field[] {
  return query.metrics.map(({ measure, aggregation }) => ({
    name: `${aggregation}_${measure}`,
    type: FieldType.number,
    config: {
      unit: measure.endsWith('Cost')
        ? 'currencyUSD'
        : ['latency', 'streamingLatency', 'timeToFirstToken'].includes(measure)
          ? 'ms'
          : 'short',
    },
    values: [],
  }));
}

export function metricsToFrames(
  rows: Array<Record<string, unknown>>,
  query: MetricsDefinition,
  refId: string
): DataFrame[] {
  if (!Array.isArray(rows) || rows.some((row) => !record(row))) {
    throw new Error(INCOMPATIBLE);
  }
  const notices =
    rows.length >= query.config.row_limit
      ? [
          {
            severity: 'warning' as const,
            text: 'Metrics row limit reached; results may be truncated. Narrow the range or reduce grouping.',
          },
        ]
      : [];
  if (!query.timeDimension) {
    const fields: Field[] = [
      ...query.dimensions.map(({ field }) => ({ name: field, type: FieldType.string, config: {}, values: [] })),
      ...metricFields(query),
    ];
    for (const row of rows) {
      for (const field of fields) {
        field.values.push(
          field.type === FieldType.number
            ? metricValue(row[field.name])
            : row[field.name] == null
              ? null
              : String(row[field.name])
        );
      }
    }
    return [{ refId, fields, length: rows.length, meta: { preferredVisualisationType: 'table', notices } }];
  }
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = JSON.stringify(query.dimensions.map(({ field }) => row[field] ?? null));
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  if (groups.size === 0) {
    groups.set('[]', []);
  }
  return [...groups.values()].map((group) => {
    const timed = group
      .map((row) => {
        const time = typeof row.time_dimension === 'string' ? Date.parse(row.time_dimension) : NaN;
        if (!Number.isFinite(time)) {
          throw new Error(INCOMPATIBLE);
        }
        return { row, time };
      })
      .sort((a, b) => a.time - b.time);
    const labels = Object.fromEntries(
      query.dimensions.map(({ field }) => [field, String(group[0]?.[field] ?? '(unset)')])
    );
    const fields: Field[] = [
      { name: 'Time', type: FieldType.time, config: {}, values: timed.map(({ time }) => time) },
      ...metricFields(query).map((field) => ({
        ...field,
        labels,
        values: timed.map(({ row }) => metricValue(row[field.name])),
      })),
    ];
    return { refId, fields, length: group.length, meta: { preferredVisualisationType: 'graph' as const, notices } };
  });
}
