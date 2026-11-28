# Metrics issues #4–#8 acceptance evidence

## Scope and baseline

Audited `origin/main` at `b333f94e5a58dfb9bd8f763be233ff90f43a7ee3`
against issue bodies, comments (none), and `ready-for-agent` labels.
The approved Metrics v2 behavior already exists. This change adds regression
coverage and an acceptance map, not another implementation or product behavior.
No changelog entry is needed for this test/documentation-only change.

All paths below are repository-relative. The new
`src/metrics.acceptance.test.ts` substitutes only Grafana's HTTP transport;
it exercises real interpolation, validation, dispatch, response guards, and
frame conversion together. It is not a browser/proxy-authentication test.

## #4 — Observation volume

- **Defaults:** `DEFAULT_METRICS_QUERY` in `src/metrics.ts` selects
  `observations/count/count/auto/1000`. The acceptance suite starts with
  `DataSource.getDefaultQuery`; `src/editors/MetricsQueryEditor.test.tsx`
  checks guided controls and the generated alias.
- **One GET:** the acceptance suite asserts exactly one transport call to the
  configured Grafana proxy's `/api/public/v2/metrics`, with method `GET`.
- **Authoritative time:** the acceptance suite dispatches the same saved advanced
  query twice with different Grafana ranges, asserts replacement on each call,
  and verifies the saved query remains unchanged.
- **Fields/units:** the default transport-to-frame case asserts native time,
  numeric `count_count`, and `short` metadata. Automatic granularity is resolved
  from Grafana's interval immediately before dispatch.
- **Empty versus malformed:** the acceptance suite checks the empty time/numeric
  schema and distinct incompatible-response errors for malformed envelopes,
  timestamps, and missing metric values. No zero points are invented.
- **Layers and contexts:** translation/transformation tests in
  `src/metrics.test.ts`, component tests above, dashboard browser coverage in
  `tests/e2e/dashboard.spec.ts`, and the new explicit metrics selection in
  `tests/e2e/metrics-volume.spec.ts` for Explore. Explore's default query kind
  remains observation logs; this does not change that approved behavior.

## #5 — Grouped, multi-measure observations

- **Stable matrix:** `src/metricsCapabilities.ts` is shared by editor and request
  validation. `src/metrics.capabilities.test.ts` covers the observation measure
  set, numeric/distinct aggregations, and invalid view-specific combinations.
  This is the repository's reviewed matrix, not a claim about future upstream
  API additions.
- **Invalid dispatch:** the acceptance suite verifies unsupported measures,
  aggregations, and identifier grouping never reach the HTTP transport.
- **Grouping versus filtering:** capability tests retain identifiers as filters
  and exclude them from grouping. `src/metrics.filters.test.ts` checks typed
  identifier/null filters; low-cardinality dimensions come from the shared matrix.
- **Multiple aliases:** the new transport-to-frame test asserts separate
  `count_count` and `p95_latency` fields across name/environment combinations,
  with sorted time points and distinct labels.
- **Tables/order:** `src/metrics.test.ts` covers dimension-first deterministic
  tables, multiple metrics, native dimensions, and sorted extra columns.
  Request ordering is checked through the acceptance score cases and editor
  round-trip tests; API row ordering is not recomputed client-side for tables.
- **Units:** the acceptance suite explicitly checks all input/output/total costs,
  latency, streaming latency, TTFT, input/output/total tokens, both throughputs,
  and count. Existing tests also ensure count/uniq aggregations use `short`.
- **Browser:** the provisioned dashboard covers grouped volume, multi-measure
  latency/tokens, and grouped tables through the real Grafana proxy.

## #6 — Aggregate scores

- **Views and valid capabilities:** only `scores-numeric` and
  `scores-categorical` are exposed alongside observations. Capability tests
  reject score latency, categorical value averages, and incompatible dimensions.
  The acceptance suite additionally proves `scores-boolean` cannot dispatch.
- **Boolean representation:** boolean scores use numeric `value/avg` plus a
  `dataType = BOOLEAN` filter or dimension. No raw Scores v3 records are fetched
  or aggregated for these charts.
- **Common transformer:** the new acceptance cases run numeric, boolean, and
  categorical queries as both grouped time series and deterministic tables;
  they verify the only endpoint is Metrics v2 and preserve filters/order.
- **Percent semantics:** boolean average `0.75` is preserved and receives
  `percentunit`, not a multiplied value. `src/metrics.test.ts` also checks mixed
  BOOLEAN/NUMERIC series and empty boolean-filtered output.
- **Browser:** `tests/e2e/metrics-feature.spec.ts` executes filtered, ordered
  boolean score metrics through the editor; the dashboard covers numeric trends.

## #7 — Histograms

- **Selection/bins:** capabilities permit histogram only on numeric/count
  measures, not identifier measures. Builder validation constrains bins to
  integer 1–100; capability tests cover rejection and the upper boundary.
- **Heatmap frames:** `src/metrics.histogram.test.ts` verifies unordered complete
  tuples become sorted Grafana `HeatmapCells` with explicit x/y bounds, counts,
  labels, and units. `src/metrics.mock.test.ts` uses the actual shared mock.
- **Lossless fallback:** histogram tests preserve incomplete, malformed,
  changing-boundary, missing-time, extra-column, and empty responses as tables.
  Bounds/timestamps are never fabricated from insufficient response information.
- **Actual-output feedback:** transformer notices report heatmap versus table;
  component tests assert the editor displays returned frame notices.
- **Browser:** `tests/e2e/metrics-feature.spec.ts` exercises both heatmap cells
  (then table inspection) and the original tuple table fallback through Grafana.

## #8 — Guided and advanced metrics

- **Guided fields:** `src/editors/MetricsQueryEditor.tsx` exposes typed filters,
  metadata object keys, dimensions, time, generated metric aliases, ordering,
  and row limits. Aliases follow the API's `aggregation_measure` convention;
  arbitrary custom aliases are not an approved API field.
- **Canonical round trips:** component tests preserve all supported fields
  while switching modes and editing limits/order/object filters. Both modes
  edit the same serialized Metrics v2 object.
- **Invalid JSON:** component tests keep invalid text and inline errors, block
  execution/mode switching, and do not discard the draft. The data-source
  boundary independently rejects invalid JSON (`src/query.test.ts`).
- **Dispatch defenses:** `src/metrics.ts` allows only documented fields at each
  level, enforces 1–1000 rows, overwrites timestamps, and bounds raw and encoded
  query size. `src/metrics.filters.test.ts` includes oversized Unicode values.
- **HTTP 414:** `src/client/grafanaHttpClient.test.ts` classifies 414 as
  `url-too-long`; `src/client/errors.test.ts` verifies actionable guidance to
  reduce filters or dimensions, without leaking upstream payloads.
- **Variables:** `src/variables/interpolate.test.ts` covers scalar values,
  membership arrays, single/multiple scoped values, numeric/boolean coercion,
  invalid/unresolved variables, and rejection of scalar multi-values.
- **Browser:** `tests/e2e/metrics-feature.spec.ts` round-trips guided/advanced
  filtered and ordered observations, rejects invalid JSON, then executes a
  filtered and ordered boolean score metric query.

## Verification provenance and limitations

Fresh local checks for this change: Node 24.18.0, isolated `npm ci
--ignore-scripts`, full Jest (28 suites, 437 tests), typecheck, lint (zero
errors; 16 existing deprecation warnings), and production build passed.
Only synthetic fixtures were used. No real Langfuse host was contacted.

Docker is not installed on this host, so local Grafana browser execution is
unavailable. Existing browser evidence on the exact audited base is successful
[CI run 46053854084](https://github.com/lihor-hub/langfuse-grafana-datasource/actions/runs/46053854084):
Grafana 12.3.11, 12.4.16, 13.0.14, 13.2.7, 13.3.2, and nightly all passed.
That run predates this PR and does **not** verify the new Explore test. The PR's
own matrix must pass before treating that new browser criterion as verified.

This audit does not certify a real server version, future upstream capability
changes, signing, publication, or Grafana-managed alerting. No backend, mutation,
release metadata, protection, or authentication behavior changes are included.
Issues remain open until a maintainer merges the PR.
