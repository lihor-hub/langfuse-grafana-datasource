import React from 'react';
import { dateTime, type QueryEditorProps } from '@grafana/data';
import { Button, Field, Input, MultiSelect, Select, TextArea } from '@grafana/ui';
import type { DataSource } from '../datasource';
import type { LangfuseDataSourceOptions, LangfuseQuery } from '../types';
import { buildMetricsQuery, DEFAULT_METRICS_QUERY, type MetricsDefinition } from '../metrics';
import {
  getMetricCapabilities,
  METRICS_VIEWS,
  METRIC_FILTER_OPERATORS,
  type MetricFilterType,
  type MetricsView,
} from '../metricsCapabilities';

const options = (values: readonly string[]) => values.map((value) => ({ label: value, value }));
const defaultValue = (type: string): unknown =>
  type === 'number' ? 0 : type === 'boolean' ? false : type.endsWith('Options') ? [] : '';
type Definition = Omit<MetricsDefinition, 'fromTimestamp' | 'toTimestamp'> &
  Partial<Pick<MetricsDefinition, 'fromTimestamp' | 'toTimestamp'>>;

export function MetricsQueryEditor({
  query,
  range,
  onChange,
  onRunQuery,
  data,
  validationQuery,
  validationError,
}: QueryEditorProps<DataSource, LangfuseQuery, LangfuseDataSourceOptions> & {
  validationQuery?: LangfuseQuery;
  validationError?: string;
}) {
  const text = query.metricsQuery ?? DEFAULT_METRICS_QUERY;
  let error: string | undefined;
  let definition: Definition | undefined;
  try {
    buildMetricsQuery(
      validationQuery ?? query,
      range ?? { from: dateTime().subtract(1, 'hour'), to: dateTime(), raw: { from: 'now-1h', to: 'now' } },
      60000
    );
  } catch (cause) {
    error = (cause as Error).message;
  }
  error = validationError ?? error;
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      METRICS_VIEWS.includes(parsed.view) &&
      Array.isArray(parsed.metrics) &&
      parsed.metrics.every((m: unknown) => m && typeof m === 'object' && 'measure' in m && 'aggregation' in m) &&
      (parsed.filters === undefined ||
        (Array.isArray(parsed.filters) && parsed.filters.every((f: unknown) => f && typeof f === 'object'))) &&
      (parsed.dimensions === undefined ||
        (Array.isArray(parsed.dimensions) && parsed.dimensions.every((d: unknown) => d && typeof d === 'object'))) &&
      (parsed.orderBy == null ||
        (Array.isArray(parsed.orderBy) && parsed.orderBy.every((o: unknown) => o && typeof o === 'object')))
    ) {
      definition = parsed;
    }
  } catch {
    /* Invalid text stays canonical and editable in either mode. */
  }
  const update = (next: Definition) =>
    onChange({ ...query, kind: 'metrics', metricsQuery: JSON.stringify(next, null, 2) });
  const mode = query.editorMode ?? 'guided';
  const capabilities = getMetricCapabilities(definition?.view ?? 'observations');
  const aliases = definition?.metrics.map((m) => `${m.aggregation}_${m.measure}`) ?? [];
  const orderFields = [
    ...aliases,
    ...(definition?.dimensions ?? []).map((d) => d.field),
    ...(definition?.timeDimension ? ['time_dimension'] : []),
  ];
  function setMetrics(metrics: Definition['metrics']) {
    if (!definition) {
      return;
    }
    const dimensions = [...(definition.dimensions ?? [])];
    for (const metric of metrics) {
      const required = capabilities.measures[metric.measure]?.requiresDimension;
      if (required && !dimensions.some((d) => d.field === required)) {
        dimensions.push({ field: required });
      }
    }
    const validFields = [
      ...metrics.map((m) => `${m.aggregation}_${m.measure}`),
      ...dimensions.map((d) => d.field),
      ...(definition.timeDimension ? ['time_dimension'] : []),
    ];
    update({
      ...definition,
      metrics,
      dimensions,
      orderBy: definition.orderBy?.filter((o) => validFields.includes(o.field)),
    });
  }
  function changeView(view: MetricsView) {
    if (!definition) {
      return;
    }
    const next = getMetricCapabilities(view);
    const metrics = definition.metrics.filter(
      (m) => Object.hasOwn(next.measures, m.measure) && next.measures[m.measure].aggregations.includes(m.aggregation)
    );
    const dimensions = (definition.dimensions ?? []).filter((d) => next.dimensions.includes(d.field));
    const selected = metrics.length ? metrics : [{ measure: 'count', aggregation: 'count' }];
    const fields = [
      ...selected.map((m) => `${m.aggregation}_${m.measure}`),
      ...dimensions.map((d) => d.field),
      ...(definition.timeDimension ? ['time_dimension'] : []),
    ];
    update({
      ...definition,
      view,
      metrics: selected,
      dimensions,
      filters: (definition.filters ?? []).filter(
        (f) =>
          Object.hasOwn(next.filters, String(f.column)) &&
          next.filters[String(f.column)].includes(f.type as MetricFilterType)
      ),
      orderBy: definition.orderBy?.filter((o) => fields.includes(o.field)),
    });
  }
  return (
    <div>
      <div>
        <Button
          variant={mode === 'guided' ? 'primary' : 'secondary'}
          onClick={() => onChange({ ...query, editorMode: 'guided' })}
        >
          Guided
        </Button>{' '}
        <Button
          variant={mode === 'advanced' ? 'primary' : 'secondary'}
          onClick={() => onChange({ ...query, editorMode: 'advanced' })}
        >
          Advanced
        </Button>
      </div>
      {mode === 'advanced' || !definition ? (
        <Field
          label="Metrics v2 query (JSON)"
          invalid={Boolean(error)}
          error={error}
          description="Grafana overrides timestamps. Maximum 1,000 rows; no custom aliases or arbitrary request properties."
        >
          <TextArea
            aria-label="Metrics v2 query (JSON)"
            rows={14}
            value={text}
            onChange={(event) => onChange({ ...query, kind: 'metrics', metricsQuery: event.currentTarget.value })}
            onBlur={() => {
              if (!error) {
                onRunQuery();
              }
            }}
          />
        </Field>
      ) : (
        <>
          {error && <div role="alert">{error}</div>}
          <Field label="Metrics view">
            <Select
              aria-label="Metrics view"
              options={options(METRICS_VIEWS)}
              value={definition.view}
              onChange={(v) => changeView(v.value! as MetricsView)}
            />
          </Field>
          {definition.metrics.map((metric, index) => (
            <div key={index}>
              <Field label={`Measure ${index + 1}`}>
                <Select
                  aria-label={`Measure ${index + 1}`}
                  options={options(Object.keys(capabilities.measures))}
                  value={metric.measure}
                  onChange={(v) => {
                    const measure = v.value!;
                    const aggs = capabilities.measures[measure].aggregations;
                    setMetrics(
                      definition!.metrics.map((m, i) =>
                        i === index
                          ? {
                              measure,
                              aggregation: aggs.includes(m.aggregation)
                                ? m.aggregation
                                : aggs.includes('avg')
                                  ? 'avg'
                                  : aggs[0],
                            }
                          : m
                      )
                    );
                  }}
                />
              </Field>
              <Field label={`Aggregation ${index + 1}`}>
                <Select
                  aria-label={`Aggregation ${index + 1}`}
                  options={options(capabilities.measures[metric.measure]?.aggregations ?? [])}
                  value={metric.aggregation}
                  onChange={(v) =>
                    setMetrics(definition!.metrics.map((m, i) => (i === index ? { ...m, aggregation: v.value! } : m)))
                  }
                />
              </Field>
              <Field label="Generated alias">
                <code>{aliases[index]}</code>
              </Field>
              <Button
                variant="secondary"
                aria-label={`Remove metric ${index + 1}`}
                disabled={definition!.metrics.length === 1}
                onClick={() => setMetrics(definition!.metrics.filter((_, i) => i !== index))}
              >
                Remove metric
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => {
              const available = Object.entries(capabilities.measures)
                .flatMap(([measure, capability]) =>
                  capability.aggregations.map((aggregation) => ({ measure, aggregation }))
                )
                .find((m) => !aliases.includes(`${m.aggregation}_${m.measure}`));
              if (available) {
                setMetrics([...definition!.metrics, available]);
              }
            }}
          >
            Add metric
          </Button>
          <Field
            label="Dimensions"
            description="Identifiers are filter-only. Dimension combinations become series labels."
          >
            <MultiSelect
              aria-label="Dimensions"
              options={options(capabilities.dimensions)}
              value={(definition.dimensions ?? []).map((d) => d.field)}
              onChange={(selected) => {
                const dimensions = selected.map((v) => ({ field: v.value! }));
                const fields = [
                  ...aliases,
                  ...dimensions.map((d) => d.field),
                  ...(definition!.timeDimension ? ['time_dimension'] : []),
                ];
                update({
                  ...definition!,
                  dimensions,
                  orderBy: definition!.orderBy?.filter((o) => fields.includes(o.field)),
                });
              }}
            />
          </Field>
          <Field label="Time granularity">
            <Select
              aria-label="Time granularity"
              options={options(['none', 'auto', 'minute', 'hour', 'day', 'week', 'month'])}
              value={definition.timeDimension?.granularity ?? 'none'}
              onChange={(v) =>
                update({
                  ...definition!,
                  timeDimension: v.value === 'none' ? undefined : { granularity: v.value! },
                  orderBy: definition!.orderBy?.filter((o) => v.value !== 'none' || o.field !== 'time_dimension'),
                })
              }
            />
          </Field>
          <Field label="Row limit">
            <Input
              aria-label="Row limit"
              type="number"
              min={1}
              max={1000}
              value={definition.config?.row_limit ?? 1000}
              onChange={(event) =>
                update({
                  ...definition!,
                  config: { ...definition!.config, row_limit: Number(event.currentTarget.value) },
                })
              }
            />
          </Field>
          {definition.metrics.some((m) => m.aggregation === 'histogram') && (
            <>
              <Field label="Histogram bins">
                <Input
                  aria-label="Histogram bins"
                  type="number"
                  min={1}
                  max={100}
                  value={definition.config?.bins ?? 10}
                  onChange={(event) =>
                    update({
                      ...definition!,
                      config: {
                        ...definition!.config,
                        row_limit: definition!.config?.row_limit ?? 1000,
                        bins: Number(event.currentTarget.value),
                      },
                    })
                  }
                />
              </Field>
              <p>
                Histogram output is reported in result notices: heatmap for complete consistent time/bucket bounds;
                otherwise a lossless table. Mixed metrics use a table.
              </p>
            </>
          )}
          {(definition.filters ?? []).map((filter, index) => {
            const type = filter.type as MetricFilterType;
            const updateFilter = (next: Record<string, unknown>) =>
              update({ ...definition!, filters: definition!.filters.map((f, i) => (i === index ? next : f)) });
            return (
              <div key={index}>
                <Field label={`Filter ${index + 1} column`}>
                  <Select
                    aria-label={`Filter ${index + 1} column`}
                    options={options(Object.keys(capabilities.filters))}
                    value={String(filter.column)}
                    onChange={(v) => {
                      const type = capabilities.filters[v.value!][0];
                      updateFilter({
                        column: v.value!,
                        type,
                        operator: METRIC_FILTER_OPERATORS[type][0],
                        value: defaultValue(type),
                      });
                    }}
                  />
                </Field>
                <Field label={`Filter ${index + 1} type`}>
                  <Select
                    aria-label={`Filter ${index + 1} type`}
                    options={options(capabilities.filters[String(filter.column)] ?? [])}
                    value={type}
                    onChange={(v) => {
                      const type = v.value! as MetricFilterType;
                      updateFilter({
                        column: filter.column,
                        type,
                        ...(type === 'stringObject' ? { key: '' } : {}),
                        operator: METRIC_FILTER_OPERATORS[type][0],
                        value: defaultValue(type),
                      });
                    }}
                  />
                </Field>
                {type === 'stringObject' && (
                  <Field label={`Filter ${index + 1} key`}>
                    <Input
                      aria-label={`Filter ${index + 1} key`}
                      value={String(filter.key ?? '')}
                      onChange={(e) => updateFilter({ ...filter, key: e.currentTarget.value })}
                    />
                  </Field>
                )}
                <Field label={`Filter ${index + 1} operator`}>
                  <Select
                    aria-label={`Filter ${index + 1} operator`}
                    options={options(METRIC_FILTER_OPERATORS[type] ?? [])}
                    value={String(filter.operator)}
                    onChange={(v) => updateFilter({ ...filter, operator: v.value! })}
                  />
                </Field>
                {type !== 'null' && (
                  <Field
                    label={`Filter ${index + 1} value`}
                    description={
                      type.endsWith('Options')
                        ? 'JSON array of strings; supports multi-value variables.'
                        : type === 'stringObject'
                          ? 'Metadata key values are strings, not numberObject/booleanObject.'
                          : undefined
                    }
                  >
                    {type === 'boolean' ? (
                      <Select
                        aria-label={`Filter ${index + 1} value`}
                        options={[
                          { label: 'true', value: true },
                          { label: 'false', value: false },
                        ]}
                        value={filter.value as boolean}
                        onChange={(v) => updateFilter({ ...filter, value: v.value })}
                      />
                    ) : (
                      <Input
                        aria-label={`Filter ${index + 1} value`}
                        type="text"
                        inputMode={type === 'number' ? 'decimal' : undefined}
                        value={Array.isArray(filter.value) ? JSON.stringify(filter.value) : String(filter.value ?? '')}
                        onChange={(e) => {
                          const text = e.currentTarget.value;
                          let value: unknown = text;
                          if (type === 'number') {
                            value = text === '' ? null : Number.isFinite(Number(text)) ? Number(text) : text;
                          } else if (type.endsWith('Options')) {
                            try {
                              value = JSON.parse(text);
                            } catch {
                              /* Keep invalid typed input for correction. */
                            }
                          }
                          updateFilter({ ...filter, value });
                        }}
                      />
                    )}
                  </Field>
                )}
                <Button
                  variant="secondary"
                  aria-label={`Remove filter ${index + 1}`}
                  onClick={() => update({ ...definition!, filters: definition!.filters.filter((_, i) => i !== index) })}
                >
                  Remove filter
                </Button>
              </div>
            );
          })}
          <Button
            variant="secondary"
            onClick={() =>
              update({
                ...definition!,
                filters: [...(definition!.filters ?? []), { column: 'name', type: 'string', operator: '=', value: '' }],
              })
            }
          >
            Add filter
          </Button>
          {(definition.orderBy ?? []).map((order, index) => (
            <div key={index}>
              <Field label={`Order ${index + 1} field`}>
                <Select
                  aria-label={`Order ${index + 1} field`}
                  options={options(orderFields)}
                  value={order.field}
                  onChange={(v) =>
                    update({
                      ...definition!,
                      orderBy: definition!.orderBy!.map((o, i) => (i === index ? { ...o, field: v.value! } : o)),
                    })
                  }
                />
              </Field>
              <Field label={`Order ${index + 1} direction`}>
                <Select
                  aria-label={`Order ${index + 1} direction`}
                  options={options(['asc', 'desc'])}
                  value={order.direction}
                  onChange={(v) =>
                    update({
                      ...definition!,
                      orderBy: definition!.orderBy!.map((o, i) => (i === index ? { ...o, direction: v.value! } : o)),
                    })
                  }
                />
              </Field>
              <Button
                variant="secondary"
                aria-label={`Remove order ${index + 1}`}
                onClick={() => update({ ...definition!, orderBy: definition!.orderBy!.filter((_, i) => i !== index) })}
              >
                Remove order
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              update({
                ...definition!,
                orderBy: [...(definition!.orderBy ?? []), { field: orderFields[0], direction: 'desc' }],
              })
            }
          >
            Add ordering
          </Button>
          <p>
            Aliases are generated as aggregation_measure. Boolean scores use scores-numeric with a dataType = BOOLEAN
            filter or grouping; averages use zero-to-one percent units.
          </p>
        </>
      )}
      {[
        ...new Set(
          data?.series
            .filter((frame) => !frame.refId || frame.refId === query.refId)
            .flatMap((frame) => frame.meta?.notices ?? [])
            .filter((notice) => notice.text.startsWith('Histogram output:'))
            .map((notice) => notice.text)
        ),
      ].map((text) => (
        <p key={text} role="status">
          {text}
        </p>
      ))}
      <Button onClick={onRunQuery} disabled={Boolean(error)}>
        Run query
      </Button>
    </div>
  );
}
