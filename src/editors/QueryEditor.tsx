import React from 'react';
import { dateTime, type QueryEditorProps } from '@grafana/data';
import { Field, TextArea } from '@grafana/ui';

import type { DataSource } from '../datasource';
import { buildMetricsQuery, DEFAULT_METRICS_QUERY } from '../metrics';
import type { LangfuseDataSourceOptions, LangfuseQuery } from '../types';

export function QueryEditor({
  query,
  range,
  onChange,
  onRunQuery,
}: QueryEditorProps<DataSource, LangfuseQuery, LangfuseDataSourceOptions>) {
  let error: string | undefined;
  try {
    buildMetricsQuery(
      query,
      range ?? {
        from: dateTime().subtract(1, 'hour'),
        to: dateTime(),
        raw: { from: 'now-1h', to: 'now' },
      },
      60_000
    );
  } catch (cause) {
    error = (cause as Error).message;
  }
  return (
    <Field
      label="Metrics v2 query (JSON)"
      description="Aggregate observations or scores. Grafana supplies the time range. Use timeDimension for time series; omit it for tables and totals. Maximum 1,000 rows."
      invalid={Boolean(error)}
      error={error}
    >
      <TextArea
        aria-label="Metrics v2 query (JSON)"
        rows={14}
        value={query.metricsQuery ?? DEFAULT_METRICS_QUERY}
        onChange={(event) => onChange({ ...query, kind: 'metrics', metricsQuery: event.currentTarget.value })}
        onBlur={() => {
          if (!error) {
            onRunQuery();
          }
        }}
      />
    </Field>
  );
}
