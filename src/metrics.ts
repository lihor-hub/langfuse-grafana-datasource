import { FieldType, type DataFrame, type Field, type TimeRange } from '@grafana/data';

import type { LangfuseQuery } from './types';
import { histogramToFrames } from './metricsHistogram';
import {
  getMetricCapabilities,
  METRICS_VIEWS,
  METRIC_FILTER_OPERATORS,
  type MetricFilterType,
} from './metricsCapabilities';

export interface MetricsDefinition {
  view: 'observations' | 'scores-numeric' | 'scores-categorical';
  metrics: Array<{ measure: string; aggregation: string }>;
  dimensions: Array<{ field: string }>;
  filters: Array<Record<string, unknown>>;
  timeDimension?: { granularity: string };
  orderBy?: Array<{ field: string; direction: string }>;
  config: { row_limit: number; bins?: number };
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

export const MAX_METRICS_QUERY_SIZE = 8000;

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
const INCOMPATIBLE = 'Langfuse returned an incompatible metrics response.';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validFilter(value: unknown, columns: Record<string, readonly MetricFilterType[]>): boolean {
  if (!record(value) || !onlyKeys(value, ['column', 'type', 'operator', 'value', 'key'])) {
    return false;
  }
  const type = value.type as MetricFilterType;
  if (
    !Object.hasOwn(columns, String(value.column)) ||
    !columns[String(value.column)].includes(type) ||
    !METRIC_FILTER_OPERATORS[type]?.includes(String(value.operator))
  ) {
    return false;
  }
  if (type === 'stringObject') {
    return typeof value.key === 'string' && value.key.trim().length > 0 && typeof value.value === 'string';
  }
  if (value.key !== undefined) {
    return false;
  }
  switch (type) {
    case 'string':
      return typeof value.value === 'string';
    case 'stringOptions':
    case 'arrayOptions':
      return (
        Array.isArray(value.value) &&
        value.value.every((item) => typeof item === 'string') &&
        (value.value.length > 0 || (type === 'arrayOptions' && value.operator !== 'any of'))
      );
    case 'number':
      return typeof value.value === 'number' && Number.isFinite(value.value);
    case 'boolean':
      return typeof value.value === 'boolean';
    case 'datetime':
      return (
        typeof value.value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T/.test(value.value) &&
        Number.isFinite(Date.parse(value.value))
      );
    case 'null':
      return value.value === '' || value.value === null || value.value === undefined;
    default:
      return false;
  }
}

export function buildMetricsQuery(target: LangfuseQuery, range: TimeRange, intervalMs: number): MetricsDefinition {
  if (target.kind && target.kind !== 'metrics') {
    throw new Error('This query editor currently supports aggregate metrics only.');
  }
  if ((target.metricsQuery?.length ?? 0) > MAX_METRICS_QUERY_SIZE) {
    throw new Error('Metrics query is too large for a safe proxy URL. Reduce filters or dimensions.');
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
  if (!METRICS_VIEWS.includes(value.view as MetricsDefinition['view'])) {
    throw new Error('Select an observations, scores-numeric or scores-categorical metrics view.');
  }
  const capabilities = getMetricCapabilities(value.view as MetricsDefinition['view']);
  if (
    !Array.isArray(value.metrics) ||
    value.metrics.length === 0 ||
    value.metrics.some(
      (metric) =>
        !record(metric) ||
        !onlyKeys(metric, ['measure', 'aggregation']) ||
        !Object.hasOwn(capabilities.measures, String(metric.measure)) ||
        !capabilities.measures[String(metric.measure)].aggregations.includes(String(metric.aggregation))
    )
  ) {
    throw new Error('Select supported metrics and aggregations for this view.');
  }
  const aliases = value.metrics.map((metric) => `${metric.aggregation}_${metric.measure}`);
  if (new Set(aliases).size !== aliases.length) {
    throw new Error('Each metric must have a distinct aggregation_measure alias.');
  }
  const dimensions = value.dimensions ?? [];
  if (
    !Array.isArray(dimensions) ||
    dimensions.some(
      (dimension) =>
        !record(dimension) ||
        !onlyKeys(dimension, ['field']) ||
        !capabilities.dimensions.includes(String(dimension.field))
    ) ||
    new Set(dimensions.map((dimension) => dimension.field)).size !== dimensions.length
  ) {
    throw new Error('Select supported low-cardinality dimensions; identifiers are not grouping dimensions.');
  }
  for (const metric of value.metrics) {
    const required = capabilities.measures[metric.measure].requiresDimension;
    if (required && !dimensions.some((dimension) => dimension.field === required)) {
      throw new Error(`Selected metric requires the ${required} dimension.`);
    }
  }
  const filters = value.filters ?? [];
  if (!Array.isArray(filters) || filters.some((filter) => !validFilter(filter, capabilities.filters))) {
    throw new Error(
      'Filters must use supported columns, types, operators and typed values. Metadata requires a stringObject key.'
    );
  }
  const config = value.config ?? { row_limit: 1000 };
  if (
    !record(config) ||
    !onlyKeys(config, ['row_limit', 'bins']) ||
    !Number.isInteger(config.row_limit ?? 1000) ||
    Number(config.row_limit ?? 1000) < 1 ||
    Number(config.row_limit ?? 1000) > 1000
  ) {
    throw new Error('Metrics row_limit must be an integer from 1 to 1000.');
  }
  if (
    config.bins !== undefined &&
    (!Number.isInteger(config.bins) || Number(config.bins) < 1 || Number(config.bins) > 100)
  ) {
    throw new Error('Histogram bins must be an integer from 1 to 100.');
  }
  let timeDimension = value.timeDimension ?? undefined;
  if (timeDimension !== undefined) {
    if (
      !record(timeDimension) ||
      !onlyKeys(timeDimension, ['granularity']) ||
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
  const orderFields = new Set([
    ...aliases,
    ...dimensions.map((dimension) => dimension.field),
    ...(timeDimension ? ['time_dimension'] : []),
  ]);
  if (
    value.orderBy != null &&
    (!Array.isArray(value.orderBy) ||
      value.orderBy.some(
        (order) =>
          !record(order) ||
          !onlyKeys(order, ['field', 'direction']) ||
          !orderFields.has(String(order.field)) ||
          !['asc', 'desc'].includes(String(order.direction))
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
    config: { ...config, row_limit: config.row_limit ?? 1000 },
    timeDimension,
    orderBy: value.orderBy ?? undefined,
    fromTimestamp: range.from.toISOString(),
    toTimestamp: range.to.toISOString(),
  } as MetricsDefinition;
  if (encodeURIComponent(JSON.stringify(query)).length > MAX_METRICS_QUERY_SIZE) {
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

function booleanScores(query: MetricsDefinition, rows: Array<Record<string, unknown>>): boolean {
  return (
    query.view === 'scores-numeric' &&
    (query.filters.some(
      (filter) =>
        filter.column === 'dataType' &&
        ((filter.operator === '=' && filter.value === 'BOOLEAN') ||
          (filter.operator === 'any of' &&
            Array.isArray(filter.value) &&
            filter.value.length === 1 &&
            filter.value[0] === 'BOOLEAN'))
    ) ||
      (query.dimensions.some(({ field }) => field === 'dataType') &&
        rows.length > 0 &&
        rows.every((row) => row.dataType === 'BOOLEAN')))
  );
}

function metricFields(query: MetricsDefinition, rows: Array<Record<string, unknown>> = []): Field[] {
  return query.metrics.map(({ measure, aggregation }) => ({
    name: `${aggregation}_${measure}`,
    type: FieldType.number,
    config: {
      unit:
        aggregation === 'count' || aggregation === 'uniq'
          ? 'short'
          : measure === 'value' && aggregation === 'avg' && booleanScores(query, rows)
            ? 'percentunit'
            : getMetricCapabilities(query.view).measures[measure].unit,
    },
    values: [],
  }));
}

function labelValue(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
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
  if (query.metrics.some((metric) => metric.aggregation === 'histogram')) {
    return histogramToFrames(rows, query, refId).map((frame) => ({
      ...frame,
      meta: { ...frame.meta, notices: [...(frame.meta?.notices ?? []), ...notices] },
    }));
  }
  if (!query.timeDimension) {
    const fields: Field[] = [
      ...query.dimensions.map(({ field }) => {
        const types = getMetricCapabilities(query.view).filters[field] ?? [];
        const type = types.includes('number')
          ? FieldType.number
          : types.includes('boolean')
            ? FieldType.boolean
            : types.includes('arrayOptions')
              ? FieldType.other
              : FieldType.string;
        return { name: field, type, config: {}, values: [] };
      }),
      ...(rows.some((row) => 'time_dimension' in row)
        ? [{ name: 'time_dimension', type: FieldType.other, config: {}, values: [] }]
        : []),
      ...metricFields(query, rows),
    ];
    const known = new Set(fields.map((field) => field.name));
    const extra = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !known.has(key)).sort();
    for (const name of extra) {
      fields.push({ name, type: FieldType.other, config: {}, values: [] });
    }
    for (const row of rows) {
      for (const field of fields) {
        field.values.push(
          field.type === FieldType.number
            ? metricValue(
                query.dimensions.some((dimension) => dimension.field === field.name)
                  ? (row[field.name] ?? null)
                  : row[field.name]
              )
            : field.type === FieldType.string && row[field.name] != null
              ? labelValue(row[field.name])
              : (row[field.name] ?? null)
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
      query.dimensions.map(({ field }) => [field, labelValue(group[0]?.[field] ?? '(unset)')])
    );
    const fields: Field[] = [
      { name: 'Time', type: FieldType.time, config: {}, values: timed.map(({ time }) => time) },
      ...metricFields(query, group).map((field) => ({
        ...field,
        labels,
        values: timed.map(({ row }) => metricValue(row[field.name])),
      })),
    ];
    return { refId, fields, length: group.length, meta: { preferredVisualisationType: 'graph' as const, notices } };
  });
}
