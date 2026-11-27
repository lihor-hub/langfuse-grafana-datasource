import React from 'react';
import type { QueryEditorProps } from '@grafana/data';
import { Combobox, Field } from '@grafana/ui';

import type { DataSource } from '../datasource';
import { interpolateQuery } from '../variables';
import type { LangfuseDataSourceOptions, LangfuseQuery } from '../types';
import { MetricsQueryEditor } from './MetricsQueryEditor';
import { ObservationQueryEditor } from './ObservationQueryEditor';
import { ScoreQueryEditor } from './ScoreQueryEditor';

const kinds = [
  { label: 'Aggregate metrics', value: 'metrics' as const },
  { label: 'Observations (table / logs)', value: 'observations' as const },
  { label: 'Scores (table)', value: 'scores' as const },
];

export function QueryEditor(props: QueryEditorProps<DataSource, LangfuseQuery, LangfuseDataSourceOptions>) {
  const { query, onChange } = props;
  let validationQuery = query;
  let validationError: string | undefined;
  try {
    validationQuery = interpolateQuery(query, props.data?.request?.scopedVars ?? {});
  } catch {
    const source =
      query.kind === 'observations'
        ? query.observationsQuery
        : query.kind === 'scores'
          ? query.scoresQuery
          : query.metricsQuery;
    try {
      JSON.parse(source ?? '{}');
      validationError =
        'Check dashboard variable selections. Multi-value variables require documented membership operators or score CSV filters; numeric fields require numeric values.';
    } catch {
      // The feature editor reports JSON syntax errors; template-service exceptions are never displayed.
    }
  }
  const editorProps = { ...props, validationQuery, validationError };
  return (
    <>
      <Field label="Query kind">
        <Combobox
          aria-label="Query kind"
          value={query.kind ?? 'metrics'}
          options={kinds}
          onChange={(option) => {
            if (option) {
              onChange({ ...query, kind: option.value });
            }
          }}
        />
      </Field>
      {query.kind === 'observations' ? (
        <ObservationQueryEditor {...editorProps} />
      ) : query.kind === 'scores' ? (
        <ScoreQueryEditor {...editorProps} />
      ) : (
        <MetricsQueryEditor {...editorProps} />
      )}
    </>
  );
}
