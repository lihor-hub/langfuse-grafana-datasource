# Individual score queries

Scores use the read-only Langfuse v4 `GET /api/public/v3/scores` endpoint.
They are tables, not client-side aggregates. Use Metrics v2 for score trends,
counts and averages.

## Definition and editor

The guided controls and advanced JSON edit the same `scoresQuery` string on a
Grafana target with `kind: "scores"`. Switching modes preserves filters and
optional groups. Invalid JSON stays visible for correction; invalid definitions
cannot run. The shared query-kind selector and DataSource dispatch must register
this editor and runner before these controls are reachable.

```json
{
  "dataType": "NUMERIC",
  "name": "quality,accuracy",
  "environment": "test",
  "source": "API,EVAL",
  "valueMin": 0,
  "valueMax": 1,
  "fields": "details,subject,annotation",
  "ceiling": 500
}
```

Grafana's range replaces `fromTimestamp` (inclusive) and `toTimestamp`
(exclusive) immediately before dispatch, including subject-specific lookups.
Do not save fixed times in dashboard definitions. The parent orchestrator must
interpolate scoped variables before invoking the runner; the runner validates
the resulting definition, not variable syntax. Numeric bounds and ceilings must
be JSON numbers after interpolation.

## Filters

All string filters accept comma-separated values: OR within a filter, AND
across filters. They are not arbitrary JSON arrays or generic request options.

| Property        | Meaning                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `id`            | Score IDs                                                                    |
| `name`          | Score names                                                                  |
| `source`        | `API`, `ANNOTATION`, `EVAL` (case-insensitive)                               |
| `dataType`      | `NUMERIC`, `BOOLEAN`, `CATEGORICAL`, `TEXT`, `CORRECTION` (case-insensitive) |
| `environment`   | Score environments                                                           |
| `configId`      | Score configuration IDs                                                      |
| `queueId`       | Annotation queue IDs                                                         |
| `authorUserId`  | Author IDs                                                                   |
| `traceId`       | Trace subjects, optionally scoped by `observationId`                         |
| `observationId` | Observation subjects; requires `traceId`                                     |
| `sessionId`     | Session subjects                                                             |
| `experimentId`  | Experiment/dataset-run subjects (not experiment browsing)                    |
| `value`         | Comma-separated exact values; see type rules below                           |

Choose only one subject family: trace/observation, session, or experiment.
`traceId` and `observationId` may be combined; session and experiment filters
cannot be combined with either of them or with each other. Empty list elements
in identifier, name, environment, source and type filters are rejected.

Exact `value` requires one data type, never multiple:

- `NUMERIC`: finite numbers encoded in the string, for example `"0,0.5,1"`.
- `BOOLEAN`: `"true"`, `"false"`, or `"true,false"`; not `0`/`1`.
- `CATEGORICAL`: category strings such as `"good,bad"`.
- `TEXT` and `CORRECTION`: exact filtering is not supported by Scores v3.

`valueMin` and `valueMax` are inclusive finite JSON numbers. They require exactly
`dataType: "NUMERIC"`, and the lower bound cannot exceed the upper bound.
Exact numeric values and bounds may be combined. Native response values are
never parsed as numeric just because an exact-value request uses a string.

## Optional fields and output

Core fields are always returned. `fields` selects any combination of `details`,
`subject`, and `annotation`; omit it to avoid fetching optional payloads.

| Group        | Table columns                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Core         | `timestamp`, `name`, `dataType`, `value`, `source`, `environment`, `id`, `projectId`, `createdAt`, `updatedAt` |
| `details`    | `comment`, `configId`, `metadata`                                                                              |
| `subject`    | `subject.kind`, `subject.id`, `subject.traceId`                                                                |
| `annotation` | `authorUserId`, `queueId`                                                                                      |

Only the documented subject object is flattened. Metadata remains a structured
Grafana `other` field; metadata keys never become dynamic columns. Missing
optional values become null. `subject.traceId` is set only for observation
subjects that include it. Timestamps are Grafana time fields.

Each selected data type gets a separate named table (`Scores (NUMERIC)`, etc.)
so `value` remains a native number, boolean, or string. With no `dataType`
filter, all five schemas are emitted, even when some are empty. This avoids
coercion and keeps schemas stable across time ranges. Column order is fixed,
independent of response property order or metadata keys. Tables use the target
`refId` and preferred table visualization.

## Bounded reads and errors

`ceiling` is an integer from 1 through 5,000, default 500. The runner requests
at most 100 rows per page, shrinking the last request to the remaining budget.
Pagination is sequential and uses one supplied AbortSignal. The endpoint's
`limit` and `cursor` are runner-owned; they cannot be set in advanced JSON.

Pagination stops on a final page, cancellation, a repeated cursor, an error,
or the ceiling. Empty pages with a next cursor are rejected as incompatible so
non-progressing pages cannot bypass the result budget indefinitely. A repeated cursor is an incompatible response error, not a
silent partial success. At the ceiling, a remaining cursor produces a visible
truncation warning. A confirmed final page exactly at the ceiling does not.
No follow-up probe or automatic retry is made. Narrow the time range or filters
to inspect more data rather than assuming the first 500 rows are exhaustive.

Malformed pages, native values inconsistent with their score type, and returned
types outside an explicit type filter are rejected without echoing score
payloads in error messages. Empty successful responses preserve their schemas.

## Integration API

`src/queries/scores.ts` exports:

- `runScoreQuery(client, target, request, signal): Promise<DataFrame[]>`.
- `DEFAULT_SCORES_QUERY` (canonical JSON default).
- `buildScoreRequest(target, range): ScoreRequest` for one bounded first page.
- `parseScoreQuery(text): ScoreQuery` for validation and normalization.
- `ScoreQuery`, `SCORE_DATA_TYPES`, `SCORE_FIELD_GROUPS`, `SCORE_STRING_FILTERS`.

`src/transformers/scores.ts` exports
`scoresToFrames(items, validatedDefinition, refId): DataFrame[]`.
`src/editors/ScoreQueryEditor.tsx` exports `ScoreQueryEditor` with the standard
Grafana `QueryEditorProps<DataSource, LangfuseQuery, LangfuseDataSourceOptions>`
and optional `validationQuery?: LangfuseQuery`. The parent can supply an
interpolated validation target without replacing raw placeholders in displayed
controls, advanced JSON or `onChange` output. Without that prop, validation uses
the raw query.

The parent must route `kind === "scores"` to this editor and runner, interpolate
before validation, propagate cancellation, preserve frame notices, and enforce
target concurrency/partial-error handling. The runner has no generic endpoint,
HTTP-method, mutation or credential inputs.

## Verification boundary

Synthetic unit/component tests cover typed values, all filters/groups,
validation, empty/malformed pages, ceilings, repeated cursors, cancellation and
canonical editor round trips. `tests/e2e/scores-table.spec.ts` adds five typed
score-table checks through the real Grafana proxy using temporary dashboards;
execute it only after integrating the shared runner/editor wiring and mock.
Unit/component passes do not establish real Grafana proxy, live Langfuse
compatibility or variable integration. Those checks require the
parent's shared wiring and integrated mock/browser matrix. No real credentials,
production infrastructure, or captured score data are used by this track.
