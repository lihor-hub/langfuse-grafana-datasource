# Observation queries (Langfuse v4)

Observations use the read-only Observations v2 endpoint. New dashboard queries
produce tables; new Explore queries produce Grafana logs. Explicit `format`
overrides either default. Guided and advanced editors share the single
`observationsQuery` JSON string. Invalid JSON stays editable and cannot run.

## Definition

```json
{
  "format": "table",
  "type": "AGENT",
  "environment": ["production", "staging"],
  "isRootObservation": true,
  "fieldGroups": ["basic", "time", "model", "usage", "metrics"],
  "ceiling": 1000,
  "filters": [{ "type": "number", "column": "totalCost", "operator": ">", "value": 0 }]
}
```

Do not save fixed time bounds. Every request, including trace-specific queries
and later pages, uses Grafana's selected `fromStartTime` and `toStartTime`.
Langfuse's structured `filter` parameter overrides its simple URL filters,
including time. The translator therefore ANDs advanced filters, guided filters,
and authoritative start-time bounds into one structured array. Adding an
advanced filter cannot silently drop a trace/user/session scope or widen the
selected time range. Saved legacy top-level timestamps are ignored and removed
on the next guided edit. Additional advanced time filters can narrow, never
widen, the Grafana range.

The canonical `filters` value is an array, not a JSON-encoded string. The parent
Grafana integration interpolates scoped variables in the definition before the
runner validates it. Numeric values must remain finite numbers, boolean values
must be booleans, and multi-value options must be string arrays. Only request
translation encodes the array into the endpoint's `filter` string.

### Filters

Guided controls support type, name, level, environment, version, logical root,
physical parent, trace ID, user ID and session ID. An empty advanced
`parentObservationId` matches physically parentless observations; this is not
the same as logical-root status. An environment can be one string or a string
array (array editing is available in Advanced JSON).

All current types are accepted: `SPAN`, `GENERATION`, `EVENT`, `AGENT`, `TOOL`,
`CHAIN`, `RETRIEVER`, `EVALUATOR`, `EMBEDDING`, `GUARDRAIL`. Levels are `DEBUG`,
`DEFAULT`, `WARNING`, `ERROR`.

Advanced `filters` support the endpoint's string, number, datetime, boolean,
null, string-options, category-options, array-options, string-object and
number-object conditions. Object filters require a `key`. For example:

```json
{
  "filters": [
    { "type": "stringOptions", "column": "type", "operator": "any of", "value": ["SPAN", "GENERATION"] },
    { "type": "stringObject", "column": "metadata", "key": "team", "operator": "=", "value": "example" }
  ]
}
```

Input/output `matches` is indexed literal search, not a regular expression.
Langfuse requires an `=` or `matches` input/output condition when filtering
those columns; standalone legacy substring filters are rejected. The editor
never accepts arbitrary HTTP endpoints, methods or mutation operations.

### Field groups and payload privacy

`core` is always requested. Optional groups are `basic`, `time`, `io`,
`metadata`, `model`, `usage`, `prompt`, `metrics`, `trace_context`; the default
is only `basic`. Input/output and metadata are neither requested nor rendered
unless selected. Choosing a log body does **not** silently enable `io`.

Table columns have explicit types and a deterministic order: start time, name,
type, level, IDs, basic/time and trace context, model, usage/cost, prompt,
metrics, then large payloads. Usage/cost dictionaries, metadata, model
parameters and input/output stay structured rather than creating unbounded
columns. Cost units are USD; latency/TTFT preserve the API's seconds. Empty
successful responses retain the selected typed schema.

## Bounded pagination

The total `ceiling` is an integer from 1–5,000, default 1,000. Each sequential
request asks for at most 1,000 rows, reduced to the remaining ceiling. The same
AbortSignal and identical scope/time filters are used on every page. No retry
or result cache is added here.

Pagination stops at exhaustion (including an empty page), cancellation, error,
repeated cursor or the ceiling. A repeated cursor is an incompatible-response
error, not an infinite loop. When a cursor indicates more results at the ceiling,
a warning is attached to the frame. Narrow the range/filters or raise the ceiling.
Malformed page envelopes, cursors and typed fields are rejected without printing
payload contents. Page errors do not return misleading partial target data;
the parent orchestrator handles successful peer targets separately.

## Explore logs and links

```json
{
  "format": "logs",
  "logBody": "output",
  "fieldGroups": ["basic", "io", "model", "trace_context"],
  "ceiling": 1000
}
```

Log frames expose `timestamp` (time), `body` (string), normalized `severity`
(string), `id` (string), and `labels` (structured), with `log-lines` metadata
and preferred logs visualization. `logBody` supports `name`, `statusMessage`,
`input`, `output`; missing, unselected or empty bodies fall back to the name,
then `(unnamed observation)`. Structured bodies are JSON-serialized only for
log display. DEBUG/DEFAULT/WARNING/ERROR map to debug/info/warning/error.

Labels are limited to selected observation type, environment, model, trace
name, release and prompt name. Trace/observation/user/session identifiers never
become labels. Trace IDs remain separate fields for navigation.

Set the data source's **Langfuse UI URL** to its HTTP(S) application root,
including any deployment subpath. This is separate from Grafana's proxy URL.
Do not include `/project/.../traces` in that setting. Links use each returned
row's project ID and trace ID:

- `/project/{projectId}/traces/{traceId}`
- `/project/{projectId}/traces/{traceId}?observation={observationId}`

IDs are URL-encoded. Row-specific `traceUrl`/`observationUrl` fields supply
Grafana data links without interpolating raw IDs into URLs. Missing context
produces null URL values; missing/invalid UI configuration omits link configs.
If any row lacks project/trace context, frame-wide ID data links are omitted
rather than offering an unverifiable action; verified URL field values remain
available for the other rows.
Relative/proxy URLs, embedded credentials, query strings and fragments are not
accepted as UI roots. No project discovery or proxy-origin guess is performed.

Routing was verified against upstream Langfuse's
[project-scoped trace page](https://github.com/langfuse/langfuse/blob/main/web/src/pages/project/%5BprojectId%5D/traces/%5BtraceId%5D.tsx)
and [observation selection provider](https://github.com/langfuse/langfuse/blob/main/web/src/features/traces/contexts/SelectionProvider.tsx).

## Integration API

`src/queries/observations.ts` exports:

- `runObservationQuery(client, target, request, signal, uiUrl?) => Promise<DataFrame[]>`
- `DEFAULT_OBSERVATIONS_QUERY` (JSON string; no fixed format or timestamps)
- `parseObservationQuery(text?)`, `buildObservationRequest(definition, request)`
- `observationFormat(definition, app?)`, type/group constants and definition types

`src/transformers/observations.ts` exports `observationsToTable` and
`observationsToLogs`, each `(items, definition, refId, uiUrl?) => DataFrame`.
`src/editors/ObservationQueryEditor.tsx` exports `ObservationQueryEditor` using
standard Grafana QueryEditorProps plus optional `validationQuery?: LangfuseQuery`.
The parent passes the interpolated target as `validationQuery` so enum/numeric
variable placeholders validate after substitution without overwriting the
original references in guided or JSON edits.

The parent must dispatch `kind: 'observations'` to the runner **after** scoped
interpolation, pass the selected range/app, shared cancellation signal and
configured `jsonData.langfuseUiUrl`, and render the editor behind the common
query-kind selector. Parent-owned concurrency, shared metadata, partial-target
notices, README and changelog wiring are not modified in this isolated track.
The dedicated E2E spec requires that integration plus the release-track mock.
