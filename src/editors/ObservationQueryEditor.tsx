import React from 'react';
import type { QueryEditorProps } from '@grafana/data';
import { Button, Checkbox, Combobox, Field, Input, TextArea } from '@grafana/ui';
import type { DataSource } from '../datasource';
import type { LangfuseDataSourceOptions, LangfuseQuery } from '../types';
import {
  DEFAULT_OBSERVATIONS_QUERY,
  OBSERVATION_FIELD_GROUPS,
  OBSERVATION_TYPES,
  observationFormat,
  parseObservationQuery,
  type ObservationQueryDefinition,
} from '../queries/observations';

export function ObservationQueryEditor({
  query,
  app,
  onChange,
  onRunQuery,
  validationQuery,
  validationError,
}: QueryEditorProps<DataSource, LangfuseQuery, LangfuseDataSourceOptions> & {
  validationQuery?: LangfuseQuery;
  validationError?: string;
}) {
  let definition: ObservationQueryDefinition = {};
  let error: string | undefined;
  try {
    parseObservationQuery((validationQuery ?? query).observationsQuery);
    // Validate substituted values, but keep variable references in the editable definition.
    const { fromStartTime, toStartTime, ...original } = JSON.parse(
      query.observationsQuery ?? DEFAULT_OBSERVATIONS_QUERY
    );
    definition = original;
  } catch {
    error = 'Invalid observation query. Check filters, field groups, format and ceiling (1–5,000).';
  }
  error = validationError ?? error;
  const advanced = query.editorMode === 'advanced' || Boolean(error);
  function update(patch: Partial<ObservationQueryDefinition>) {
    onChange({
      ...query,
      kind: 'observations',
      observationsQuery: JSON.stringify({ ...definition, ...patch }, null, 2),
    });
  }
  const format = observationFormat(definition, app);
  return (
    <div>
      <div>
        <Button
          variant="secondary"
          disabled={Boolean(error)}
          onClick={() => onChange({ ...query, editorMode: 'guided' })}
        >
          Guided
        </Button>
        <Button variant="secondary" onClick={() => onChange({ ...query, editorMode: 'advanced' })}>
          Advanced JSON
        </Button>
      </div>
      {advanced ? (
        <Field
          label="Observation query (JSON)"
          invalid={Boolean(error)}
          error={error}
          description="Grafana supplies the time bounds. Filters are ANDed with guided scope and the selected range."
        >
          <TextArea
            aria-label="Observation query (JSON)"
            rows={16}
            value={query.observationsQuery ?? DEFAULT_OBSERVATIONS_QUERY}
            onChange={(e) => onChange({ ...query, kind: 'observations', observationsQuery: e.currentTarget.value })}
            onBlur={() => {
              if (!error) {
                onRunQuery();
              }
            }}
          />
        </Field>
      ) : (
        <>
          <Field label="Format">
            <div>
              <Button variant="secondary" aria-pressed={format === 'table'} onClick={() => update({ format: 'table' })}>
                Table
              </Button>
              <Button variant="secondary" aria-pressed={format === 'logs'} onClick={() => update({ format: 'logs' })}>
                Logs
              </Button>
            </div>
          </Field>
          {format === 'logs' && (
            <Field
              label="Log body"
              description="Input/output require explicit io selection; unavailable or empty bodies fall back to observation name."
            >
              <Combobox
                aria-label="Log body"
                value={definition.logBody ?? 'name'}
                options={['name', 'statusMessage', 'input', 'output'].map((value) => ({ label: value, value }))}
                onChange={(option) => update({ logBody: option.value as ObservationQueryDefinition['logBody'] })}
              />
            </Field>
          )}
          <Field label="Observation type">
            <Combobox
              aria-label="Observation type"
              isClearable
              value={definition.type}
              options={OBSERVATION_TYPES.map((value) => ({ label: value, value }))}
              onChange={(option) => update({ type: option?.value })}
            />
          </Field>
          <Field label="Level">
            <Combobox
              aria-label="Level"
              isClearable
              value={definition.level}
              options={['DEBUG', 'DEFAULT', 'WARNING', 'ERROR'].map((value) => ({ label: value, value }))}
              onChange={(option) => update({ level: option?.value as ObservationQueryDefinition['level'] })}
            />
          </Field>
          {(
            [
              ['name', 'Name'],
              ['environment', 'Environment'],
              ['version', 'Version'],
              ['parentObservationId', 'Parent observation ID'],
              ['traceId', 'Trace ID'],
              ['userId', 'User ID'],
              ['sessionId', 'Session ID'],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              label={label}
              description={
                key === 'parentObservationId'
                  ? 'Use Advanced JSON with an empty parent ID to match physically parentless observations.'
                  : undefined
              }
            >
              <Input
                aria-label={label}
                value={
                  Array.isArray(definition[key]) ? (definition[key] as string[]).join(',') : (definition[key] ?? '')
                }
                onChange={(e) => update({ [key]: e.currentTarget.value || undefined })}
                onBlur={onRunQuery}
              />
            </Field>
          ))}
          <Field label="Logical root">
            <Combobox
              aria-label="Logical root"
              isClearable
              value={definition.isRootObservation === undefined ? null : String(definition.isRootObservation)}
              options={[
                { label: 'Root', value: 'true' },
                { label: 'Not root', value: 'false' },
              ]}
              onChange={(option) => update({ isRootObservation: option ? option.value === 'true' : undefined })}
            />
          </Field>
          <Field
            label="Field groups"
            description="Core fields are always present. Input/output and metadata are fetched only when explicitly selected."
          >
            <div>
              {OBSERVATION_FIELD_GROUPS.map((group) => (
                <Checkbox
                  key={group}
                  label={group}
                  value={(definition.fieldGroups ?? ['basic']).includes(group)}
                  onChange={(e) =>
                    update({
                      fieldGroups: e.currentTarget.checked
                        ? [...(definition.fieldGroups ?? ['basic']), group]
                        : (definition.fieldGroups ?? ['basic']).filter((g) => g !== group),
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <Field
            label="Result ceiling"
            description="1–5,000 rows, default 1,000; requests run sequentially with at most 1,000 rows per page."
          >
            <Input
              aria-label="Result ceiling"
              type="number"
              min={1}
              max={5000}
              value={definition.ceiling ?? 1000}
              onChange={(e) => update({ ceiling: e.currentTarget.valueAsNumber })}
              onBlur={onRunQuery}
            />
          </Field>
          <Button onClick={onRunQuery}>Run observation query</Button>
        </>
      )}
    </div>
  );
}
