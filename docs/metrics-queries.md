# Metrics v2 queries

Metrics queries read aggregates with one `GET /api/public/v2/metrics` request
per visible Grafana target. They do not retrieve raw observations/scores and
aggregate them in the browser. Grafana dashboards and Explore use the same
query definition.

## Defaults and output

A new query counts observations, uses automatic time granularity and a
1,000-row limit. Grafana's selected range always replaces persisted
`fromTimestamp` and `toTimestamp` immediately before dispatch. Automatic
resolution maps Grafana's interval to minute, hour, day, week or month.

With `timeDimension`, `time_dimension` becomes a sorted Grafana time field;
each dimension combination becomes a labelled series. Without it, results are
a table, in dimension/time/metric/remaining-column order. Empty responses keep
the expected schema rather than manufacturing zeroes. Invalid row objects,
invalid series timestamps and nonnumeric scalar metrics report an incompatible
response. Reaching the row limit adds a possible-truncation warning.

## Views and measures

The capability matrix in `src/metricsCapabilities.ts` drives **both** validation
and guided controls:

| View                 | Measures                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observations`       | `count`, `traceId`, `uniqueUserIds`, `uniqueSessionIds`, `latency`, `streamingLatency`, `timeToFirstToken`, `inputCost`, `outputCost`, `totalCost`, `inputTokens`, `outputTokens`, `totalTokens`, `tokensPerSecond`, `outputTokensPerSecond`, `countScores`, `toolDefinitions`, `toolCalls`, `toolCallInvocations`, `costByType`, `usageByType` |
| `scores-numeric`     | `count`, `value` (numeric **and boolean** scores)                                                                                                                                                                                                                                                                                               |
| `scores-categorical` | `count`                                                                                                                                                                                                                                                                                                                                         |

Counts default to `count`. Identifier measures support `count`/`uniq`; numeric
measures (including the integer count measure) support `sum`, `avg`, `min`, `max`, `p50`, `p75`, `p90`, `p95`, `p99`,
`histogram`, `count` and `uniq`. Histogram is not offered for identifier
measures. `toolCallInvocations`, `costByType` and `usageByType` require the
corresponding `calledToolNames`, `costType` and `usageType` dimension. The
guided measure selector adds that dimension; advanced mode requires it explicitly.

Observation grouping includes operation, type, level, environment, version,
model, trace name/release/version, prompt name/version, tags, month, logical
root status, available/called tools, skill names and cost/usage categories.
Score grouping includes score name, environment, source, data type, config,
trace name/tags/release/version, observation name/model/prompt, day/month, and
numeric `value` or categorical `stringValue` as appropriate. Trace,
observation, user and session identifiers are **filter-only**, never grouping
choices. Changing views preserves compatible fields and removes incompatible
metrics, dimensions, filters and ordering.

Metric aliases are the API-generated **`aggregation_measure`**, for example
`p95_latency`, `sum_totalCost`, `avg_value` and `count_count`. Guided mode shows
them and ordering can reference them. Duplicate aliases are rejected. The
upstream metric query schema has no custom `alias` property: custom alias
properties are explicitly rejected, not silently ignored. Use Grafana field
display names/overrides to rename a legend.

Units: costs use USD; latency/streaming latency/TTFT use milliseconds;
counts/tokens use short numbers; token throughput uses counts/second (`cps`).
`count` and `uniq` aggregations always have count units, not the source
measure's currency/time unit.

### Boolean scores

Use `scores-numeric` with a `dataType = BOOLEAN` filter, or group by `dataType`:

```json
{
  "view": "scores-numeric",
  "metrics": [{ "measure": "value", "aggregation": "avg" }],
  "dimensions": [{ "field": "name" }],
  "filters": [{ "column": "dataType", "type": "string", "operator": "=", "value": "BOOLEAN" }],
  "timeDimension": { "granularity": "auto" },
  "orderBy": [{ "field": "avg_value", "direction": "desc" }],
  "config": { "row_limit": 1000 }
}
```

Boolean averages get Grafana `percentunit` (0.75 means 75%, not 0.75%). A
boolean-labelled time series gets this unit independently of numeric series.
A mixed numeric/boolean **table column** cannot carry per-row units; it keeps
short-number units. Split such tables by data type when percentage formatting
is needed. No `scores-boolean` view is introduced.

## Guided and advanced editing

Both modes edit the same persisted `metricsQuery` JSON string. Switching modes
does not reserialize or remove supported fields. Advanced invalid JSON remains
visible and persisted for correction; an inline error appears and the editor's
Run button/blur handler never dispatch it. Runtime validation independently
rejects invalid queries, including dashboard refreshes outside the editor.

Guided controls support multiple measures, dimensions, time granularity,
ordering, typed filters, metadata keys, row limits and histogram bins. The
advanced representation uses the documented Metrics v2 object, not a generic
HTTP request: unknown top-level **and nested** properties are rejected.

Row limits are integers 1–1,000; bins are integers 1–100. Raw JSON input and the
encoded serialized request are each limited to 8,000 characters. Oversized
queries must be narrowed; HTTP 414 from the proxy/server must also be translated
by the client into an actionable “reduce filters/dimensions” message. This
module performs no retry or alternate-method request.

### Typed filters

Columns and compatible filter types are view-specific:

- Strings: `string` with `=`, `contains`, `does not contain`, `starts with`,
  `ends with`, `is not empty`; or `stringOptions` with `any of` / `none of` and
  a nonempty JSON string array.
- Arrays such as tags: `arrayOptions` with `any of`, `none of`, `all of` and a
  JSON string array. `any of` requires at least one item.
- Numbers such as prompt version or numeric score value: `number` with native
  JSON numbers and `=`, `>`, `<`, `>=`, `<=`.
- Booleans such as logical root status: `boolean` with native JSON booleans
  and `=` / `<>`.
- `startTime` (observations) / `timestamp` (scores): `datetime` with an ISO time
  string and `>`, `<`, `>=`, `<=`.
- Nullable dimensions: `null` with `is null` / `is not null`; value may be
  omitted, `null` or `""`.
- Metadata: **only** `stringObject`, a nonempty `key` and a string value. It
  supports string comparisons plus `is set` / `is not set`. Metrics v2 metadata
  does not support `numberObject` or `booleanObject`; those are rejected rather
  than offering controls that upstream cannot execute. `costType`/`usageType`
  are grouping-only, not filter columns.

```json
{
  "view": "observations",
  "metrics": [
    { "measure": "totalCost", "aggregation": "sum" },
    { "measure": "latency", "aggregation": "p95" }
  ],
  "dimensions": [{ "field": "providedModelName" }],
  "filters": [
    { "column": "environment", "type": "stringOptions", "operator": "any of", "value": ["production", "staging"] },
    { "column": "metadata", "type": "stringObject", "key": "team", "operator": "=", "value": "synthetic" }
  ],
  "orderBy": [{ "field": "sum_totalCost", "direction": "desc" }],
  "config": { "row_limit": 50 }
}
```

Scoped variables must be structurally interpolated by the parent **before**
`buildMetricsQuery`. Multi-value membership operators receive arrays, never a
comma-concatenated scalar. Numeric/boolean variables must resolve to native
values before runtime validation. Guided numeric inputs retain variable tokens;
advanced mode can also express typed placeholders. The parent supplies the
resolved `validationQuery` for editor validation while the raw query remains
unchanged in persistence.

## Histograms

Use a supported numeric measure, `aggregation: "histogram"`, and
`config: { "bins": 10, "row_limit": 1000 }`. Langfuse returns arrays of
**`[lower, upper, height]`** under the generated histogram alias, e.g.
`histogram_latency`. Timestamps belong to the containing row's
`time_dimension`, not to the tuple.

A single histogram measure produces typed `HeatmapCells` frames with explicit
`xMin`, `xMax`, `yMin`, `yMax`, `count` when each group has:

- real, valid row timestamps and concrete requested granularity;
- finite, positive-width, contiguous bucket bounds and nonnegative heights;
- the same bucket boundaries at every consecutive time bucket;
- no unrepresented extra response columns.

`xMax` is the end of the requested UTC time bucket (including calendar months),
not an invented sample timestamp. Unordered rows/tuples are sorted. Unknown,
missing, overlapping, changing or otherwise indefensible bounds/times,
empty histograms, missing time dimensions, mixed metric selections and extra
columns produce a deterministic table preserving original arrays and values.
No missing bucket, count or timestamp is fabricated. Adaptive upstream
histograms can legitimately trigger this fallback.

Select Grafana's **Heatmap** visualization with calculation disabled for
complete cells; select **Table** for fallback values. The pinned Grafana
`preferredVisualisationType` union has no `heatmap` value, so the plugin uses
its supported `meta.type = HeatmapCells`, not an unsafe metadata cast. The
editor displays the actual output from frame notices, not just the requested
format.

## Integration contract and verification

Preserved exports from `src/metrics.ts`:

- `DEFAULT_METRICS_QUERY: string`
- `buildMetricsQuery(target, range, intervalMs): MetricsDefinition`
- `metricsToFrames(data, definition, refId): DataFrame[]`

New exports:

- `MetricsQueryEditor` from `src/editors/MetricsQueryEditor.tsx`, with standard
  Grafana `QueryEditorProps<DataSource, LangfuseQuery, LangfuseDataSourceOptions>`
  plus optional `validationQuery?: LangfuseQuery`.
- `getMetricCapabilities(view)`, `METRICS_VIEWS`, `METRIC_FILTER_OPERATORS` and
  capability/filter/view types from `src/metricsCapabilities.ts`.
- `histogramToFrames(rows, definition, refId)` from `src/metricsHistogram.ts`
  (normally reached through `metricsToFrames`, which also validates row shape
  and adds row-limit notices).
- `MAX_METRICS_QUERY_SIZE` from `src/metrics.ts`.

Parent wiring: render `MetricsQueryEditor` in the metrics branch of the common
editor; pass safely interpolated `validationQuery` while leaving the original
`query`/`onChange` untouched. Block Run if interpolation itself fails. Runtime:
interpolate the original target with request scoped variables, call
`buildMetricsQuery`, make one `client.queryMetrics({query: JSON.stringify(definition)}, signal)`
request using the existing client contract, then
`metricsToFrames(response.data, definition, target.refId)`. Preserve partial
errors, hidden-target exclusion, cancellation and concurrency limits in the
parent orchestrator. The metrics module does not implement those shared jobs.

Unit/component suites cover capability rejection, typed/object filters, bounds,
encoded size, timestamp overrides, grouped/scalar/table units, boolean averages,
empty/malformed rows, histogram cells/fallback and guided/advanced round trips.
`tests/e2e/metrics-feature.spec.ts` adds real Grafana-proxy scenarios for filtered
and ordered queries, invalid JSON, score metrics, heatmap cells and table
fallback. It requires parent editor wiring and the shared mock's
`fixture-histogram-heatmap` / `fixture-histogram-table` structured name filters.
Browser execution and cross-track interpolation/error integration remain
parent validation gates, not claims implied by the presence of the test file.

API references: [Metrics v2 guide](https://langfuse.com/docs/metrics/features/metrics-api),
[view/measure declarations](https://github.com/langfuse/langfuse/blob/main/packages/shared/src/features/query/dataModel.ts),
[query schema](https://github.com/langfuse/langfuse/blob/main/packages/shared/src/features/query/types.ts),
[typed filters](https://github.com/langfuse/langfuse/blob/main/packages/shared/src/interfaces/filters.ts),
and [upstream histogram fixture assertions](https://github.com/langfuse/langfuse/blob/main/web/src/__tests__/server/metrics-v2-api.servertest.ts).
The approved three-view contract remains authoritative even when upstream main
adds newer views.
