# Deterministic Langfuse HTTP fixture contract

This synthetic, local-only server is shared by the feature E2E tracks. Start
with `LANGFUSE_E2E_PUBLIC_KEY` and `LANGFUSE_E2E_SECRET` supplied through the
runtime environment. It listens on 8080, or `LANGFUSE_E2E_PORT` (0 selects an
ephemeral port for HTTP self-tests). `npm run test:fixtures` exercises the real
HTTP boundary without Docker. The Compose service is not production software.

## Baseline and pagination

- Only GET is accepted. Wrong/missing Basic Auth returns 401; mutations return 405.
- `/api/public/projects` returns the original synthetic project.
- `/api/public/v2/observations` retains `observation-e2e` as its first ID.
  Ten rows cover SPAN, GENERATION, EVENT, AGENT, TOOL, CHAIN, RETRIEVER,
  EVALUATOR, EMBEDDING, GUARDRAIL. EVENT has ERROR level. Names are `demo-span`,
  `demo-generation`, etc. The synthetic timestamp is `2026-08-05T11:30:00Z`.
- Default observation groups are core/basic/time. `fields` is comma-separated;
  IO, metadata, model, usage, prompt, metrics, trace_context are opt-in.
  IO contains only the strings “Synthetic input” and “Synthetic output”.
- `/api/public/v3/scores` supplies NUMERIC 0.85, BOOLEAN true, CATEGORICAL
  `helpful`, TEXT `Synthetic review`, CORRECTION `Synthetic correction`.
  Names are `demo-numeric`, `demo-boolean`, etc. Default core omits all optional
  groups; `fields=details,subject,annotation` opts in. Subject uses the pinned
  SDK shape `{ "kind": "trace", "id": "trace-e2e" }`.
- Both listing endpoints return at most **two rows per page** (or a smaller
  requested limit) so pagination is testable with small deterministic sets.
  Follow `meta.cursor` (`fixture-2`, `fixture-4`, …); absent means end. Scores
  include `meta.limit`. These property names match `@langfuse/core` 5.10.0.
  Invalid cursor/limits return 400. Maximum limits are 1,000 observations/100 scores.
- Exact simple filters supported: observation type/name/level/environment/traceId;
  score dataType/name/source/environment. Synthetic names beginning `fixture-`
  are scenario selectors, not literal row-name filters.
- Metrics retain baseline values: count 18/19, demo-model grouping, original
  bounded timestamps. No time dimension produces one table row; requesting
  time emits two rows. Existing dashboard assertions are preserved.

The mock is not a full Langfuse API emulator: it does not enforce range matching,
all advanced filter semantics or generate thousands of rows. Unit tests must
cover production validation, page-size maxima, large ceilings and boundary cases.

## Feature-query-compatible scenario controls

Use the valid upstream simple `name` filter for observations/scores:

```text
/api/public/v2/observations?name=fixture-rate-limit
/api/public/v3/scores?name=fixture-repeated-cursor
```

For Metrics v2, put the selector in its structured name filter:

```json
{
  "view": "observations",
  "metrics": [{ "measure": "count", "aggregation": "count" }],
  "filters": [{ "column": "name", "type": "string", "operator": "=", "value": "fixture-rate-limit" }],
  "timeDimension": { "granularity": "hour" },
  "config": { "row_limit": 1000 }
}
```

The plugin injects the current Grafana range. Do **not** add `__fixture` or
`delayMs` to plugin models: those direct-HTTP controls exist only for self-tests.

| Name                        | Result                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `fixture-empty`             | Successful empty data array with metadata.                      |
| `fixture-malformed`         | Successful JSON but data is a string, not an array.             |
| `fixture-rate-limit`        | HTTP 429, `Retry-After: 2`; no auto retry expected.             |
| `fixture-forbidden`         | HTTP 403.                                                       |
| `fixture-server-error`      | HTTP 503.                                                       |
| `fixture-url-too-long`      | HTTP 414.                                                       |
| `fixture-repeated-cursor`   | Same `fixture-2` cursor on every listing page.                  |
| `fixture-delay`             | 1,500 ms delay on every page/read.                              |
| `fixture-discovery`         | Two Metrics dimension rows with distinct synthetic values.      |
| `fixture-histogram-heatmap` | Histogram tuples with row time if query requests timeDimension. |
| `fixture-histogram-table`   | Same tuples without time if query omits timeDimension.          |

Histogram requests use `aggregation: "histogram"`, `config.bins` and generated
`histogram_<measure>` response aliases. Values are `[[0,100,3],[100,200,7]]`
on the first row, with counts incremented on the next row. Bounds are contiguous,
not inferred. The upstream contract is ClickHouse lower/upper/height tuples;
see Langfuse's `web/src/__tests__/server/metrics-v2-api.servertest.ts` histogram
custom-bin test. The query, not a fixture marker, controls whether time exists.

Discovery supports environment, name, type, providedModelName, tags, release,
promptName/promptVersion and score name/dataType/source dimension fixtures.
Always use Metrics v2; no raw-ID scanning.

## Cancellation and diagnostics

`delayMs` is finite-clamped to 0–10,000 for direct HTTP tests. Cancellation closes
the response before completion and marks `aborted: true` in `/__test/requests`.
That diagnostic endpoint records method/path/query/authAccepted/aborted, never
credentials or Authorization headers. `/__test/health` returns readiness.
`LANGFUSE_E2E_MODE=no-v2` returns 404 from the observation endpoint and retains
baseline Save & Test incompatibility coverage.

Diagnostics are intentionally test-only and unauthenticated. Never expose this
server publicly or use real credentials/payloads. The plugin itself acquires no
generic HTTP operation through these fixture controls.
