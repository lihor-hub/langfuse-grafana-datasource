# Dashboard variables

Variable discovery uses **one Metrics v2 request** per cache miss: one selected
low-cardinality dimension plus a count metric, with no time grouping and a
maximum of 1,000 groups. It never lists raw observations or scores to scan IDs.
Values are unique text/value pairs, sorted lexicographically (numeric prompt
versions become strings). Null and empty values are omitted; tag arrays are
flattened and deduplicated.

## Configure a query variable

In dashboard settings, add a **Query** variable using the Langfuse data source.
Choose a view, dimension and lookback in the variable editor:

| View                 | Dimensions                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `observations`       | `environment`, `name`, `type`, `providedModelName`, `tags`, `release`, `promptName`, `promptVersion` |
| `scores-numeric`     | `environment`, `name`, `dataType`, `source`                                                          |
| `scores-categorical` | `environment`, `name`, `dataType`, `source`                                                          |

Lookbacks are `1h`, `6h`, `24h`, `7d` and `30d`. Omitted lookback means `24h`.
They are relative to discovery execution, independent of the dashboard range.
No fixed timestamps are persisted. For example:

```json
{
  "view": "observations",
  "dimension": "environment",
  "lookback": "24h"
}
```

Score discovery is scoped to its selected Metrics view: numeric/boolean scores
use `scores-numeric`; categorical scores use `scores-categorical`. There is no
cross-view union or TEXT/CORRECTION score discovery. Trace, observation, user and
session IDs are not discovery dimensions. Use Grafana custom, constant or
external variables for those values. More than 1,000 matching groups can mean
incomplete discovery; narrow the lookback. Discovery has no additional filter
or endpoint controls.

## Use a variable in a filter

A single-value variable can be used in a scalar filter:

```json
{
  "type": "string",
  "column": "environment",
  "operator": "=",
  "value": "$environment"
}
```

Enable Grafana's **Multi-value** setting when needed, and use a documented
membership operator: `any of`, `none of` or `all of` (subject to the selected
filter type's validation). A `stringOptions` example:

```json
{
  "type": "stringOptions",
  "column": "environment",
  "operator": "any of",
  "value": "$environment"
}
```

For selected values `prod` and `stage`, this becomes `"value": ["prod", "stage"]`,
not a CSV string. Existing literal arrays are retained and exact variable
references within membership arrays expand in place. Scalar operators and
embedded text such as `prefix-$environment` reject multi-values rather than
joining them (except the documented Scores v3 CSV filters below). Use plain
`$name`, `${name}` or `[[name]]` references; explicit
Grafana formatting directives are not needed. Unresolved variables are errors.
Grafana scoped values take precedence through its template service. Number and
boolean filters convert values only according to their declared filter type;
non-finite numbers and invalid boolean values are rejected.

Interpolation parses the active canonical query JSON first, replaces values
(not keys), then serializes it. Quotes, backslashes and JSON-looking variable
contents remain data, never query structure. The saved query and inactive query
drafts are not modified. Each query-kind validator must still validate the
interpolated definition before dispatch and inject the current Grafana range.
Do not use a custom **All value** wildcard: it would be sent as a literal filter
value. Grafana's normal expanded selection is suitable for membership filters.

### Scores v3 CSV filters

Scores v3 uses direct CSV-string filters, not structured filter objects. Only
these root properties of `scoresQuery` accept exact multi-value references:
`id`, `name`, `source`, `dataType`, `environment`, `configId`, `queueId`,
`authorUserId`, `traceId`, `observationId`, `sessionId`, `experimentId` and `value`.
For example, `"environment": "$environment"` becomes
`"environment": "prod,stage"` for two selected environments. The endpoint uses
OR within each CSV field and AND across fields. Its documented interface has no
CSV quoting or escaping: a variable element containing a comma is rejected
rather than split into additional values. Empty selections are rejected; exact
categorical `value` entries may be empty. Literal CSV in the saved query remains
CSV. Embedded multi-value references are not supported.

`value` remains a string even for NUMERIC or BOOLEAN exact values. Source and
data-type placeholders resolve before score validation. Only root score paths
`valueMin`, `valueMax` and `ceiling` coerce finite numeric text to JSON numbers;
the score validator still enforces integer ceilings, data-type compatibility,
enums, and mutually exclusive subject filters. These exceptions do not apply
to metrics, observations, arbitrary nested paths or `fields` group selection.
No unsupported score filter objects are introduced.

## Cache and cancellation

Each DataSource instance owns its own runner/cache, isolating credentials,
projects and proxy settings. Keys include view, dimension and normalized
lookback. Identical in-flight calls share one upstream request. Fulfilled
entries expire exactly 60 seconds after completion; failures are removed so the
next call retries normally. Main dashboard query results are not cached here.

An optional `AbortSignal` cancels a caller's wait. Cancelling one caller does
not interrupt other subscribers; when the last pending subscriber leaves, the
upstream signal is aborted and the entry is removed. Returned results are copied
so one caller cannot mutate another caller's cached options.

## Integration contract

All exports are available from `src/variables/index.ts`:

```ts
import { createDiscoveryQueryRunner, interpolateQuery, VariableQueryEditor, type DiscoveryQuery } from './variables';
```

- `DiscoveryQuery` is a discriminated view/dimension model with optional bounded
  `lookback`. `DEFAULT_DISCOVERY_QUERY`, `DISCOVERY_DIMENSIONS` and
  `DISCOVERY_LOOKBACKS` are also exported.
- `createDiscoveryQueryRunner(client)` returns
  `(query: DiscoveryQuery, options?: { signal?: AbortSignal }) => Promise<MetricFindValue[]>`.
  Construct it **once per DataSource instance**, after constructing the client;
  expose it through `metricFindQuery`. Do not create it on each invocation or
  share it globally between data sources. Recreate the runner when replacing a
  client or its connection settings.
- Register `.setVariableQueryEditor(VariableQueryEditor)` on the existing plugin
  in `src/module.ts`. Its props are `query?: DiscoveryQuery` and
  `onChange(query, definition)`; its controls emit the persisted model and a
  human-readable definition.
- `interpolateQuery(target: LangfuseQuery, scopedVars: ScopedVars): LangfuseQuery`
  returns a copy with only the active kind's canonical JSON interpolated
  (`metricsQuery` by default, `observationsQuery` or `scoresQuery` for those
  kinds). Invoke immediately before validation/building, with
  `request.scopedVars ?? {}`. Keep structured filters as objects/arrays until
  after interpolation; endpoint-specific JSON encoding belongs in the builder.

This track does not edit shared DataSource/module wiring. Unit/component tests
cover the exported runtime/editor seams. `tests/e2e/variables.spec.ts` creates a
temporary dashboard, discovers an environment through the real Grafana proxy,
and checks the selected value reaches a dashboard membership filter; it needs
the parent integration and running Grafana/mock services to execute. Browser
execution is a remaining acceptance gate, not implied by unit-test success.
