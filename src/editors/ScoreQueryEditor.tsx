import React from 'react';
import type { QueryEditorProps } from '@grafana/data';
import { Button, Checkbox, Field, Input, TextArea } from '@grafana/ui';
import type { DataSource } from '../datasource';
import { DEFAULT_SCORES_QUERY, parseScoreQuery, SCORE_FIELD_GROUPS, type ScoreQuery } from '../queries/scores';
import type { LangfuseDataSourceOptions, LangfuseQuery } from '../types';

const filters = [
  ['name', 'Score name'],
  ['id', 'Score IDs'],
  ['source', 'Sources'],
  ['dataType', 'Data types'],
  ['environment', 'Environments'],
  ['configId', 'Config IDs'],
  ['queueId', 'Annotation queue IDs'],
  ['authorUserId', 'Author user IDs'],
  ['traceId', 'Trace IDs'],
  ['observationId', 'Observation IDs'],
  ['sessionId', 'Session IDs'],
  ['experimentId', 'Experiment IDs'],
  ['value', 'Exact values'],
  ['valueMin', 'Numeric lower bound'],
  ['valueMax', 'Numeric upper bound'],
  ['ceiling', 'Result ceiling'],
] as const;

export function ScoreQueryEditor({
  query,
  onChange,
  onRunQuery,
}: QueryEditorProps<DataSource, LangfuseQuery, LangfuseDataSourceOptions>) {
  const text = query.scoresQuery ?? DEFAULT_SCORES_QUERY;
  let definition: ScoreQuery | undefined;
  let error: string | undefined;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      definition = parsed;
    }
    parseScoreQuery(text);
  } catch (cause) {
    error = cause instanceof SyntaxError ? 'Invalid score query: enter a JSON object.' : (cause as Error).message;
  }
  const advanced = query.editorMode === 'advanced' || !definition;
  const selectedGroups =
    typeof definition?.fields === 'string' ? definition.fields.split(',').map((group) => group.trim()) : [];
  const update = (key: keyof ScoreQuery, value: unknown) => {
    const next = { ...definition, [key]: value };
    if (value === undefined || value === '') {
      delete next[key];
    }
    onChange({ ...query, kind: 'scores', scoresQuery: JSON.stringify(next, null, 2) });
  };
  const run = () => {
    if (!error) {
      onRunQuery();
    }
  };
  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        disabled={!definition}
        onClick={() => onChange({ ...query, kind: 'scores', editorMode: 'guided' })}
      >
        Guided
      </Button>{' '}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange({ ...query, kind: 'scores', editorMode: 'advanced' })}
      >
        Advanced JSON
      </Button>
      <p>
        Scores v3 tables. Filters accept comma-separated values. Data types: NUMERIC, BOOLEAN, CATEGORICAL, TEXT,
        CORRECTION. Grafana supplies the time range.
      </p>
      {advanced ? (
        <Field label="Scores v3 query (JSON)" invalid={Boolean(error)} error={error}>
          <TextArea
            aria-label="Scores v3 query (JSON)"
            rows={16}
            value={text}
            onChange={(event) => onChange({ ...query, kind: 'scores', scoresQuery: event.currentTarget.value })}
            onBlur={run}
          />
        </Field>
      ) : (
        <>
          {filters.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                aria-label={label}
                type={key === 'ceiling' || key === 'valueMin' || key === 'valueMax' ? 'number' : 'text'}
                step={key === 'ceiling' ? 1 : 'any'}
                value={definition?.[key] ?? (key === 'ceiling' ? 500 : '')}
                onChange={(event) => {
                  const input = event.currentTarget.value;
                  const numeric = key === 'ceiling' || key === 'valueMin' || key === 'valueMax';
                  update(
                    key,
                    input === ''
                      ? undefined
                      : numeric && input.trim() !== '' && Number.isFinite(Number(input))
                        ? Number(input)
                        : input
                  );
                }}
                onBlur={run}
              />
            </Field>
          ))}
          <Field
            label="Optional field groups"
            description="Details adds comment, config and structured metadata; subject adds entity references; annotation adds author and queue."
          >
            <div>
              {SCORE_FIELD_GROUPS.map((group) => (
                <Checkbox
                  key={group}
                  label={group}
                  checked={selectedGroups.includes(group)}
                  onChange={(event) => {
                    const groups = new Set(selectedGroups.filter(Boolean));
                    if (event.currentTarget.checked) {
                      groups.add(group);
                    } else {
                      groups.delete(group);
                    }
                    update('fields', SCORE_FIELD_GROUPS.filter((item) => groups.has(item)).join(','));
                  }}
                />
              ))}
            </div>
          </Field>
          {error && <div role="alert">{error}</div>}
        </>
      )}
      <Button disabled={Boolean(error)} onClick={run}>
        Run score query
      </Button>
    </div>
  );
}
