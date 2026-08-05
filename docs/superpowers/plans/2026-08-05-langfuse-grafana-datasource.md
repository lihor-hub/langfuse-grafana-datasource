# Langfuse Grafana Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only, frontend-only Grafana data source that turns
Langfuse v4 metrics, observations, and scores into dashboard- and
Explore-ready data frames.

**Architecture:** A Grafana `DataSourceApi` implementation sends typed read
queries through Grafana's server-side data proxy to Langfuse. A narrow
`LangfuseObservabilityClient` isolates the selected generated Langfuse API
client from query translation, pagination, error handling, and Grafana frame
transformers; a Grafana-native HTTP adapter is the measured fallback.

**Tech Stack:** TypeScript, React, Grafana 12.3+, Grafana frontend packages
13.1.x, `@grafana/create-plugin` 7.9.1, Node.js 22, `@langfuse/core` 5.10.0,
Jest/Testing Library, Playwright-based Grafana E2E, Docker Compose.

## Global Constraints

- Support Grafana 12.3.0 or newer and Langfuse server v4 only.
- Lock `@grafana/create-plugin` at 7.9.1, Grafana frontend packages at 13.1.x,
  Node.js at 22, and `@langfuse/core` at 5.10.0 for the initial build.
- Use plugin ID `lihorhub-langfuse-datasource`, display name `Langfuse`, initial
  version `0.1.0`, and repository URL
  `https://github.com/lihor-hub/langfuse-grafana-datasource`.
- Implement a frontend-only data source; do not add a Go backend.
- The plugin-owned client exposes only `checkConnection`, `queryMetrics`,
  `listObservations`, and `listScores`.
- Implement Metrics API v2, Observations API v2, and Scores API v3 only; never
  call legacy, ingestion, prompt, dataset, experiment, model, comment, or admin
  APIs.
- Store the Langfuse secret key only in Grafana secure JSON data. Never put a
  secret in a query model, browser log, fixture, issue, dashboard, or committed
  provisioning file.
- Grafana's selected time range overrides stored timestamps immediately before
  dispatch.
- Metrics row limit is 1-1,000. Observation and score result ceilings are
  1-5,000, defaulting to 1,000 and 500 respectively.
- Observation pages contain at most 1,000 rows; score pages contain at most 100.
- Cap active target requests at four, make pagination sequential per target,
  and perform zero automatic retries.
- Variable discovery supports lookbacks of 1h, 6h, 24h, 7d, and 30d, defaults
  to 24h, and caches identical browser-local results for 60 seconds.
- Do not advertise Grafana-managed alerting, annotations, streaming, recorded
  queries, or externally shared dashboards.
- Every feature is test-first and every task ends with a focused, reviewable
  commit.

## Planned File Structure

The scaffold is intentionally split by responsibility:

- `src/module.ts` registers the data source, query editor, and config editor.
- `src/plugin.json` declares Grafana compatibility and metrics/logs metadata.
- `src/types.ts` owns persisted Grafana settings and the discriminated query
  union.
- `src/datasource.ts` owns target orchestration and Grafana API integration.
- `src/client/` owns the read-only Langfuse boundary, generated-client adapter,
  HTTP fallback, pagination, and error translation.
- `src/queries/` owns defaults, capabilities, validation, interpolation, and
  Langfuse request translation for each query kind.
- `src/editors/` owns config, common query controls, and one editor per kind.
- `src/transformers/` owns one pure response-to-frame transformer per output.
- `src/variables/` owns variable-query models, discovery, caching, and metric
  find results.
- `src/**/*.test.ts(x)` keeps unit/component tests beside the owned behavior.
- `tests/e2e/` owns browser-level Grafana behavior.
- `tests/mock-langfuse/` owns the deterministic read-only v4 HTTP fixture.
- `provisioning/` owns secret-free development data-source and dashboard setup.
- `.github/workflows/` owns pull-request and release gates.
- `docs/` owns user, development, compatibility, and release documentation.

---

### Task 1: Connect and validate a Langfuse v4 data source

**Files:**

- Create scaffold files: `package.json`, `package-lock.json`, `tsconfig.json`,
  `.config/`, `docker-compose.yaml`, `src/module.ts`, `src/plugin.json`
- Create: `src/types.ts`
- Create: `src/client/types.ts`
- Create: `src/client/createClient.ts`
- Create: `src/client/langfuseCoreClient.ts`
- Create: `src/client/grafanaHttpClient.ts`
- Create: `src/client/errors.ts`
- Create: `src/editors/ConfigEditor.tsx`
- Create: `src/editors/ConfigEditor.test.tsx`
- Create: `src/datasource.ts`
- Create: `src/datasource.test.ts`
- Create: `docs/adr/0001-langfuse-client-adapter.md`
- Create: `tests/e2e/configuration.spec.ts`
- Create: `tests/mock-langfuse/server.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface LangfuseObservabilityClient {
    checkConnection(signal?: AbortSignal): Promise<ConnectionResult>;
    queryMetrics(
      request: MetricsRequest,
      signal?: AbortSignal,
    ): Promise<MetricsResponse>;
    listObservations(
      request: ObservationRequest,
      signal?: AbortSignal,
    ): Promise<ObservationPage>;
    listScores(request: ScoreRequest, signal?: AbortSignal): Promise<ScorePage>;
  }

  export type ConnectionResult = {
    projectId: string;
    apiVersion: "v4";
  };
  ```

- Produces `LangfuseDataSourceOptions` with `url`, `basicAuthUser`,
  `basicAuth`, `timeout`, and optional `langfuseUiUrl`; secure data contains
  only `basicAuthPassword`.
- Later tasks consume `createObservabilityClient(instanceSettings)` and never
  instantiate `@langfuse/core` directly.

- [ ] **Step 1: Generate and pin the frontend data-source scaffold**

  Run `npx @grafana/create-plugin@7.9.1@latest` in a temporary directory,
  select a data source named `Langfuse`, copy the generated files into this
  repository, and set `grafanaDependency` to `>=12.3.0` and Node engines to
  `>=22 <23`. Add exact `13.1.x` Grafana package versions and
  `@langfuse/core@5.10.0`; do not use caret or tilde ranges.

- [ ] **Step 2: Write failing configuration and health tests**

  Cover URL normalization, saved-secret preservation/reset, missing keys,
  invalid credentials, a missing v2 observations endpoint, successful project
  plus bounded observation probes, and redaction. The successful probe must
  assert `GET /api/public/projects` followed by
  `GET /api/public/v2/observations` with `limit=1`, `fields=core`, and
  `fromStartTime`/`toStartTime` covering the preceding hour. It must assert that
  no secret is visible in the browser-side request model.

- [ ] **Step 3: Run the focused tests and confirm the red state**

  Run `npm test -- --runInBand src/editors/ConfigEditor.test.tsx src/datasource.test.ts`.
  Expected: failures for missing client factory, editor, and health response.

- [ ] **Step 4: Implement the narrow client and config editor**

  Implement `LangfuseObservabilityClient` without a generic request method.
  First adapt exported `LangfuseAPIClient` to the Grafana proxy URL using dummy
  non-secret constructor values and zero retries. If it emits Authorization in
  the browser, cannot propagate cancellation, fails the validator, or adds an
  unreviewable bundle delta, use `getBackendSrv().fetch` in
  `grafanaHttpClient.ts`. Map public key to `basicAuthUser`, secret key to
  `secureJsonData.basicAuthPassword`, and preserve the saved password when
  `secureJsonFields.basicAuthPassword` is true.

- [ ] **Step 5: Measure and record the adapter decision**

  Run `npm run build`, `npm run lint`, `npm run typecheck`, the Grafana plugin
  validator, and a bundle analyzer before and after importing
  `@langfuse/core`. Record the actual result, bundle delta, cancellation result,
  proxy-auth behavior, and selected adapter in ADR-0001. The decision rule is
  mechanical: select the generated adapter only if the browser build and plugin
  validator have zero errors, proxy Basic Auth succeeds without a browser-side
  real credential, aborting a query closes the mock-server request before its
  delayed response, and the generated adapter adds no more than 250 KiB gzip to
  the production bundle compared with the native adapter.

- [ ] **Step 6: Add deterministic Save & Test E2E coverage**

  Make the mock server accept only the test Basic Auth value supplied through
  environment interpolation. Cover success, HTTP 401, and a server that lacks
  Observations v2. Inspect browser-visible datasource settings and request
  payloads to assert the secret string is absent.

- [ ] **Step 7: Run verification and commit**

  Run `npm run lint && npm run typecheck && npm test -- --runInBand && npm run build && npm run e2e -- configuration.spec.ts`.
  Expected: all commands exit 0. Commit with
  `feat: connect a Langfuse v4 data source`.

### Task 2: Chart one Langfuse observation metric over time

**Files:**

- Modify: `src/types.ts`
- Modify: `src/datasource.ts`
- Create: `src/queries/metrics.ts`
- Create: `src/queries/metrics.test.ts`
- Create: `src/transformers/metrics.ts`
- Create: `src/transformers/metrics.test.ts`
- Create: `src/editors/QueryEditor.tsx`
- Create: `src/editors/MetricsQueryEditor.tsx`
- Create: `src/editors/MetricsQueryEditor.test.tsx`
- Create: `tests/e2e/metrics-time-series.spec.ts`

**Interfaces:**

- Consumes `LangfuseObservabilityClient.queryMetrics` from Task 1.
- Produces:

  ```ts
  export type MetricsQuery = DataQuery & {
    kind: "metrics";
    view: "observations";
    measures: [{ measure: "count"; aggregation: "count" }];
    timeDimension: {
      granularity: "auto" | "minute" | "hour" | "day" | "week" | "month";
    };
    filters: LangfuseFilter[];
    limit: number;
  };

  export function buildMetricsRequest(
    query: MetricsQuery,
    range: TimeRange,
  ): MetricsRequest;

  export function metricsToFrames(
    response: MetricsResponse,
    query: MetricsQuery,
  ): DataFrame[];
  ```

- [ ] **Step 1: Write failing default, request, and frame tests**

  Assert the default query is `observations/count/count/auto/limit=1000`,
  Grafana's range becomes ISO `fromTimestamp` and `toTimestamp`, and rows such
  as `{time_dimension: '2026-08-05T10:00:00Z', count_count: 7}` become a frame
  with a time field and a numeric `Count` field using Grafana's short unit.
  Cover a valid empty frame with the same schema.

- [ ] **Step 2: Run the tests and confirm the red state**

  Run `npm test -- --runInBand src/queries/metrics.test.ts src/transformers/metrics.test.ts`.
  Expected: failures for undefined defaults, builder, and transformer.

- [ ] **Step 3: Implement the minimal metrics path**

  Add the discriminated query, one guided measure, automatic time granularity,
  range injection, API dispatch, deterministic frame schema, and loading/error
  behavior. Do not add dimensions, advanced JSON, or histograms in this task.

- [ ] **Step 4: Add the Grafana editor and E2E chart**

  Make a new dashboard target default to the metric query and render a Grafana
  time-series panel against the mock response. Assert the outgoing URL is
  `/api/public/v2/metrics` and the query contains the dashboard range.

- [ ] **Step 5: Verify and commit**

  Run `npm test -- --runInBand src/queries/metrics.test.ts src/transformers/metrics.test.ts src/editors/MetricsQueryEditor.test.tsx && npm run e2e -- metrics-time-series.spec.ts`.
  Expected: exit 0. Commit with `feat: chart Langfuse metrics over time`.

### Task 3: Build grouped multi-metric time series and tables

**Files:**

- Modify: `src/queries/metrics.ts`
- Modify: `src/queries/metrics.test.ts`
- Modify: `src/transformers/metrics.ts`
- Modify: `src/transformers/metrics.test.ts`
- Modify: `src/editors/MetricsQueryEditor.tsx`
- Modify: `src/editors/MetricsQueryEditor.test.tsx`
- Create: `src/queries/metricCapabilities.ts`
- Create: `src/queries/metricCapabilities.test.ts`
- Create: `tests/e2e/metrics-grouped.spec.ts`

**Interfaces:**

- Extends `MetricsQuery.view` to `observations`, `scores-numeric`, or
  `scores-categorical`; boolean scores are part of `scores-numeric` and use the
  `dataType` dimension/filter.
- Produces `getMetricCapabilities(view): MetricCapabilities`, which is the only
  source of valid measures, aggregations, dimensions, order fields, and units.
- Extends `metricsToFrames` to label series by dimension combinations and emit
  deterministic tables when `timeDimension` is absent.

- [ ] **Step 1: Write the view-matrix tests**

  Encode every measure/aggregation/dimension combination listed by Metrics v2.
  Assert trace, observation, user, and session identifiers can be filtered but
  are absent from grouping dimensions. Assert invalid selections are rejected
  when a view changes.

- [ ] **Step 2: Write grouped-frame and table tests**

  Assert multiple aliases remain separate numeric fields, dimension values
  become labels on time-series fields, and table columns are ordered as
  dimensions, time, metrics, then unknown response columns. Assert cost uses
  USD, latency/TTFT use milliseconds, tokens/counts use short units,
  tokens-per-second uses throughput, and boolean averages use percentunit.

- [ ] **Step 3: Run the focused tests and confirm failure**

  Run `npm test -- --runInBand src/queries/metricCapabilities.test.ts src/transformers/metrics.test.ts`.
  Expected: new view and grouped-output cases fail.

- [ ] **Step 4: Implement capabilities, editor controls, and transforms**

  Drive all select options from `getMetricCapabilities`; never duplicate the
  matrix inside the React editor. Preserve valid selections when the view
  changes and remove only values invalid for the new view. Add multi-measure,
  dimension, order, granularity, and 1-1,000 limit controls.

- [ ] **Step 5: Verify and commit**

  Run `npm test -- --runInBand src/queries/metricCapabilities.test.ts src/queries/metrics.test.ts src/transformers/metrics.test.ts src/editors/MetricsQueryEditor.test.tsx && npm run e2e -- metrics-grouped.spec.ts`.
  Expected: exit 0. Commit with `feat: add grouped Langfuse metric queries`.

### Task 4: Filter and edit Metrics v2 queries safely

**Files:**

- Modify: `src/queries/metrics.ts`
- Modify: `src/queries/metrics.test.ts`
- Create: `src/queries/filters.ts`
- Create: `src/queries/filters.test.ts`
- Create: `src/editors/FilterEditor.tsx`
- Create: `src/editors/AdvancedQueryEditor.tsx`
- Create: `src/editors/AdvancedQueryEditor.test.tsx`
- Modify: `src/editors/MetricsQueryEditor.tsx`
- Create: `tests/e2e/metrics-filters.spec.ts`

**Interfaces:**

- Produces `parseAdvancedMetricsQuery(text): Result<MetricsQuery, QueryIssue[]>`.
- Produces `interpolateFilters(filters, scopedVars, templateSrv): LangfuseFilter[]`.
- The advanced editor can edit only the Metrics v2 query object; the builder
  always overwrites timestamps and enforces the row limit.

- [ ] **Step 1: Write failing filter and JSON round-trip tests**

  Cover string, string-array, number, boolean, datetime, null, and object-key
  filters; valid builder-to-advanced-to-builder round trips; malformed JSON;
  schema-invalid JSON; multi-value variable expansion; numeric validation after
  interpolation; forced replacement of advanced timestamps; bounded serialized
  query size; and actionable HTTP 414 translation.

- [ ] **Step 2: Run tests and confirm failure**

  Run `npm test -- --runInBand src/queries/filters.test.ts src/queries/metrics.test.ts src/editors/AdvancedQueryEditor.test.tsx`.
  Expected: filter typing and invalid-JSON retention cases fail.

- [ ] **Step 3: Implement one canonical query model**

  Make guided and advanced modes serialize the same `MetricsQuery`. Keep invalid
  text in editor-local state, display its exact validation issues, and leave
  the last valid query unchanged. Disable execution by returning query errors
  to Grafana until the JSON validates.

- [ ] **Step 4: Add an E2E filtered query**

  Provision an environment variable, choose it in a guided filter, switch to
  advanced mode and back, then assert the mock receives the same typed filter
  and the current Grafana range.

- [ ] **Step 5: Verify and commit**

  Run `npm test -- --runInBand src/queries/filters.test.ts src/queries/metrics.test.ts src/editors/AdvancedQueryEditor.test.tsx && npm run e2e -- metrics-filters.spec.ts`.
  Expected: exit 0. Commit with `feat: add safe Metrics v2 filtering`.

### Task 5: Render Langfuse metric histograms

**Files:**

- Modify: `src/queries/metrics.ts`
- Modify: `src/queries/metrics.test.ts`
- Create: `src/transformers/histogram.ts`
- Create: `src/transformers/histogram.test.ts`
- Modify: `src/editors/MetricsQueryEditor.tsx`
- Create: `tests/e2e/metrics-histogram.spec.ts`

**Interfaces:**

- Produces `histogramToFrames(response, query): DataFrame[]`.
- Returns a heatmap-compatible frame only when timestamps and defensible bucket
  boundaries are present; otherwise returns a deterministic table containing
  every tuple.

- [ ] **Step 1: Write failing heatmap and fallback tests**

  Cover complete time/bucket/count tuples, empty results, unordered tuples,
  missing bounds, and missing time. Assert the fallback never invents a bucket
  edge or timestamp and never discards a tuple.

- [ ] **Step 2: Run tests and confirm failure**

  Run `npm test -- --runInBand src/transformers/histogram.test.ts`.
  Expected: transformer is undefined.

- [ ] **Step 3: Implement histogram validation, transform, and editor control**

  Validate bin count as a positive supported integer, select heatmap or table
  strictly from response information, and expose Grafana field metadata needed
  for the preferred heatmap visualization.

- [ ] **Step 4: Verify and commit**

  Run `npm test -- --runInBand src/transformers/histogram.test.ts src/queries/metrics.test.ts && npm run e2e -- metrics-histogram.spec.ts`.
  Expected: exit 0. Commit with `feat: render Langfuse metric histograms`.

### Task 6: Explore bounded Langfuse observations as tables

**Files:**

- Modify: `src/types.ts`
- Modify: `src/datasource.ts`
- Create: `src/queries/observations.ts`
- Create: `src/queries/observations.test.ts`
- Create: `src/client/paginate.ts`
- Create: `src/client/paginate.test.ts`
- Create: `src/transformers/observations.ts`
- Create: `src/transformers/observations.test.ts`
- Create: `src/editors/ObservationsQueryEditor.tsx`
- Create: `src/editors/ObservationsQueryEditor.test.tsx`
- Create: `tests/e2e/observations-table.spec.ts`

**Interfaces:**

- Produces `ObservationQuery`, `buildObservationRequest`,
  `collectObservations`, and `observationsToTable`.
- `collectObservations(client, request, ceiling, signal)` returns
  `{items, truncated}` and requests pages sequentially with `limit <= 1000`.

- [ ] **Step 1: Write failing query and pagination tests**

  Cover all documented simple filters and field groups, core fields always
  included, every v4 observation type (`SPAN`, `GENERATION`, `EVENT`, `AGENT`,
  `TOOL`, `CHAIN`, `RETRIEVER`, `EVALUATOR`, `EMBEDDING`, `GUARDRAIL`),
  dashboard-range injection, default ceiling 1,000, 1-5,000 validation, cursor
  traversal, repeated-cursor rejection, cancellation between pages, early cursor
  end, exact-ceiling trimming, and a truncation flag.

- [ ] **Step 2: Write failing table-frame tests**

  Assert stable typed columns beginning with time, name, type, level, IDs,
  trace context, model, usage/cost, metrics, then selected payload fields.
  Assert omitted field groups do not fetch or display input/output/metadata and
  empty results retain a valid schema.

- [ ] **Step 3: Run tests and confirm failure**

  Run `npm test -- --runInBand src/queries/observations.test.ts src/client/paginate.test.ts src/transformers/observations.test.ts`.
  Expected: query, paginator, and transformer cases fail.

- [ ] **Step 4: Implement the observation table path**

  Add the guided filters, structured advanced filters, field-group selection,
  ceiling, pagination, truncation notice, and table transformer. Use the
  Observations v2 endpoint only and retain time bounds for trace-specific
  lookups when Grafana supplies a range.

- [ ] **Step 5: Verify and commit**

  Run `npm test -- --runInBand src/queries/observations.test.ts src/client/paginate.test.ts src/transformers/observations.test.ts src/editors/ObservationsQueryEditor.test.tsx && npm run e2e -- observations-table.spec.ts`.
  Expected: exit 0. Commit with `feat: explore Langfuse observation tables`.

### Task 7: Explore observations as Grafana logs with Langfuse links

**Files:**

- Modify: `src/types.ts`
- Modify: `src/queries/observations.ts`
- Modify: `src/transformers/observations.ts`
- Modify: `src/transformers/observations.test.ts`
- Modify: `src/editors/ObservationsQueryEditor.tsx`
- Modify: `src/editors/ObservationsQueryEditor.test.tsx`
- Create: `tests/e2e/observations-logs.spec.ts`

**Interfaces:**

- Extends `ObservationQuery.format` with `table | logs` and `logBody` with
  `name | statusMessage | input | output`.
- Produces `observationsToLogs(items, query, langfuseUiUrl): DataFrame` using
  Grafana's logs frame contract.

- [ ] **Step 1: Write failing log-contract and link tests**

  Assert timestamp, body fallback, severity, ID, selected low-cardinality
  labels, log-lines frame metadata, preferred logs visualization, and links for
  trace/observation IDs. Assert links use the configured Langfuse UI URL and
  never the Grafana proxy URL.

- [ ] **Step 2: Write failing context-default tests**

  Assert a new Explore observation query defaults to logs and a new dashboard
  observation query defaults to table, while either context can switch format.

- [ ] **Step 3: Run tests and confirm failure**

  Run `npm test -- --runInBand src/transformers/observations.test.ts src/editors/ObservationsQueryEditor.test.tsx`.
  Expected: log schema, links, and context defaults fail.

- [ ] **Step 4: Implement logs and E2E Explore coverage**

  Map only observation type, environment, model, trace name, release, and
  prompt into labels when present. Render logs in Explore and verify clicking a
  data link targets the configured Langfuse UI origin.

- [ ] **Step 5: Verify and commit**

  Run `npm test -- --runInBand src/transformers/observations.test.ts src/editors/ObservationsQueryEditor.test.tsx && npm run e2e -- observations-logs.spec.ts`.
  Expected: exit 0. Commit with `feat: explore Langfuse observations as logs`.

### Task 8: Explore typed Langfuse scores as tables

**Files:**

- Modify: `src/types.ts`
- Modify: `src/datasource.ts`
- Create: `src/queries/scores.ts`
- Create: `src/queries/scores.test.ts`
- Create: `src/transformers/scores.ts`
- Create: `src/transformers/scores.test.ts`
- Create: `src/editors/ScoresQueryEditor.tsx`
- Create: `src/editors/ScoresQueryEditor.test.tsx`
- Create: `tests/e2e/scores-table.spec.ts`

**Interfaces:**

- Produces `ScoreQuery`, `buildScoreRequest`, `collectScores`, and
  `scoresToTable`.
- `collectScores` reuses the generic cursor algorithm with a fixed maximum page
  size of 100 and returns `{items, truncated}`.

- [ ] **Step 1: Write failing query and validation tests**

  Cover numeric, boolean, categorical, text, and correction data types; every
  documented simple filter; exact/lower/upper value rules; optional details,
  subject, and annotation fields; mutually exclusive subject filters;
  observation ID requiring trace ID; default ceiling 500; and 1-5,000 bounds.

- [ ] **Step 2: Write failing pagination and frame tests**

  Cover multi-page results at 100 rows, cancellation, truncation, native number
  and boolean values, string values, documented object flattening, structured
  metadata, deterministic columns, and empty schemas.

- [ ] **Step 3: Run tests and confirm failure**

  Run `npm test -- --runInBand src/queries/scores.test.ts src/transformers/scores.test.ts`.
  Expected: score query and frame cases fail.

- [ ] **Step 4: Implement the Scores v3 table path**

  Add the editor, request translation, sequential pagination, visible
  truncation, typed table frame, and E2E fixtures for all five score data types.
  Do not aggregate scores client-side; aggregated charts remain Metrics v2.

- [ ] **Step 5: Verify and commit**

  Run `npm test -- --runInBand src/queries/scores.test.ts src/transformers/scores.test.ts src/editors/ScoresQueryEditor.test.tsx && npm run e2e -- scores-table.spec.ts`.
  Expected: exit 0. Commit with `feat: explore Langfuse score tables`.

### Task 9: Drive dashboard filters with Langfuse variables

**Files:**

- Modify: `src/types.ts`
- Modify: `src/datasource.ts`
- Create: `src/variables/types.ts`
- Create: `src/variables/discovery.ts`
- Create: `src/variables/discovery.test.ts`
- Create: `src/variables/cache.ts`
- Create: `src/variables/cache.test.ts`
- Create: `src/editors/VariableQueryEditor.tsx`
- Create: `src/editors/VariableQueryEditor.test.tsx`
- Create: `tests/e2e/variables.spec.ts`

**Interfaces:**

- Produces `VariableQuery` with dimension and lookback, and
  `executeDiscovery(query, rangeNow): Promise<MetricFindValue[]>`.
- Produces a cache keyed by datasource UID, normalized base URL, project,
  dimension, lookback, and filters; fulfilled entries expire after 60 seconds
  and identical in-flight requests share one promise.

- [ ] **Step 1: Write failing discovery request tests**

  Cover environments, observation names/types, provided model names, tags,
  releases, prompt names/versions, and score names/types/sources. Assert each
  uses one Metrics v2 dimension-plus-count request, requires one of the five
  lookbacks, defaults to 24h, and never scans raw observations or discovers
  trace/observation/user/session IDs.

- [ ] **Step 2: Write failing cache and result tests**

  Use fake timers to assert in-flight de-duplication, reuse before 60 seconds,
  refresh at 60 seconds, no caching of rejection, unique sorted text/value
  results, and independent keys for differing projects or filters.

- [ ] **Step 3: Run tests and confirm failure**

  Run `npm test -- --runInBand src/variables/discovery.test.ts src/variables/cache.test.ts`.
  Expected: discovery and cache implementations are absent.

- [ ] **Step 4: Implement variable support and interpolation E2E**

  Implement Grafana's variable-query editor and `metricFindQuery`, then use the
  selected multi-value variable in one metrics query and one observation query.
  Assert operators receive arrays rather than a comma-concatenated string.

- [ ] **Step 5: Verify and commit**

  Run `npm test -- --runInBand src/variables/discovery.test.ts src/variables/cache.test.ts src/editors/VariableQueryEditor.test.tsx && npm run e2e -- variables.spec.ts`.
  Expected: exit 0. Commit with `feat: add Langfuse dashboard variables`.

### Task 10: Make multi-target querying resilient and cancellable

**Files:**

- Modify: `src/datasource.ts`
- Modify: `src/datasource.test.ts`
- Modify: `src/client/errors.ts`
- Create: `src/client/errors.test.ts`
- Create: `src/queryRunner.ts`
- Create: `src/queryRunner.test.ts`
- Create: `tests/e2e/reliability.spec.ts`

**Interfaces:**

- Produces `runQueries(targets, context, client): Promise<DataQueryResponse>`.
- Produces `translateLangfuseError(error): DataQueryError` with stable
  configuration, authentication, authorization, v4-unavailable, invalid-query,
  rate-limit, timeout/cancellation, server, proxy/network, and malformed-response
  categories.

- [ ] **Step 1: Write failing orchestration tests**

  Assert hidden targets never dispatch, no more than four targets run at once,
  cancellation reaches active HTTP calls and stops later pages, successful
  targets survive peer failure, partial failures become query notices, every
  failure produces one concise aggregate error, and no automatic retry occurs.

- [ ] **Step 2: Write failing error and redaction tests**

  Cover HTTP 400, 401, 403, 404 v2 probe, 414, 429 with and without
  `Retry-After`, timeout, abort, 5xx, proxy/network failure, and malformed
  responses. Feed the translator Authorization values, public/secret keys, and
  large input/output strings; assert none appear in user messages or logs.

- [ ] **Step 3: Run tests and confirm failure**

  Run `npm test -- --runInBand src/queryRunner.test.ts src/client/errors.test.ts src/datasource.test.ts`.
  Expected: concurrency, partial-result, and error-category cases fail.

- [ ] **Step 4: Implement orchestration and E2E reliability behavior**

  Use an explicit four-worker queue, one abort signal per Grafana request, and
  `Promise.allSettled`-style result collection. Honor and display `Retry-After`
  without scheduling a retry. Add mock scenarios for empty results, one failed
  target, ceiling truncation, abort, and rate limiting.

- [ ] **Step 5: Verify and commit**

  Run `npm test -- --runInBand src/queryRunner.test.ts src/client/errors.test.ts src/datasource.test.ts && npm run e2e -- reliability.spec.ts`.
  Expected: exit 0. Commit with `feat: harden Langfuse query execution`.

### Task 11: Ship examples, documentation, and real-host smoke testing

**Files:**

- Create: `README.md`
- Create: `docs/development.md`
- Create: `docs/configuration.md`
- Create: `docs/queries.md`
- Create: `docs/compatibility.md`
- Create: `docs/security.md`
- Create: `provisioning/datasources/langfuse.yaml`
- Create: `provisioning/dashboards/langfuse-observability.json`
- Create: `tests/e2e/sample-dashboard.spec.ts`
- Create: `tests/smoke/real-langfuse.spec.ts`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**

- The opt-in smoke suite consumes only `LANGFUSE_BASE_URL`,
  `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY` from the process environment.
- The provisioned sample consumes environment placeholders and contains no
  credential literals.

- [ ] **Step 1: Add a secret scanner test before examples**

  Add a repository test that fails on `pk-lf-`, `sk-lf-`, Authorization header
  literals, or non-placeholder secure JSON values under docs, provisioning,
  tests, and dashboard JSON. Verify it fails against a temporary seeded fixture,
  then remove the fixture.

- [ ] **Step 2: Build the provisioned observability dashboard**

  Add panels for volume, latency, cost, input/output/total tokens, model grouping,
  error observations, and score trends. Drive environment, model, observation
  name, and score name filters with plugin variable queries. Keep panel queries
  compatible with Grafana 12.3.

- [ ] **Step 3: Write installation and query documentation**

  Document Cloud region and self-hosted URLs, secure UI/provisioning setup,
  Langfuse v4-only compatibility, Metrics v2/Observations v2/Scores v3 examples,
  variables, Explore logs, result ceilings, rate-limit behavior, and the honest
  read-only proxy boundary. Explicitly list no alerting, no writes, no v3, and no
  prompts/datasets/experiments.

- [ ] **Step 4: Add local-only real-host smoke coverage**

  Skip the test unless all three environment values are present. When present,
  validate connection, request one bounded observation page in the last hour,
  request one observation-count metric, and assert returned shapes without
  snapshotting user data. Ensure test output logs counts and types only.

- [ ] **Step 5: Verify and commit**

  Run `npm run test:secrets && npm run e2e -- sample-dashboard.spec.ts && npm run build`.
  Expected: exit 0 without real credentials. Commit with
  `docs: add Langfuse data source examples`.

### Task 12: Add compatibility, validation, and release gates

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/dependabot.yml`
- Create: `docs/releasing.md`
- Modify: `package.json`
- Modify: `src/plugin.json`
- Create: `tests/e2e/compatibility.spec.ts`

**Interfaces:**

- Pull requests produce test reports, Grafana validator output, and a bundle
  comparison; releases produce an unsigned versioned plugin archive unless a
  maintainer supplies the signing secret.

- [ ] **Step 1: Add the minimum/current Grafana matrix**

  Run the deterministic E2E suite against Grafana 12.3 and the current supported
  Grafana image used by the pinned scaffold. Fail the matrix when plugin metadata
  advertises alerting, annotations, streaming, or a dependency floor below
  12.3.0.

- [ ] **Step 2: Add all pull-request gates**

  Configure formatting, lint, typecheck, unit/component tests, production build,
  E2E matrix, plugin validator, dependency review, secret scanning, and bundle
  comparison. Cache only package-manager and browser dependencies, not plugin
  query results.

- [ ] **Step 3: Add archive and signing preparation**

  Package the `dist/` directory under the plugin ID into a versioned zip and
  attach checksums. Document the maintainer-controlled Grafana access-policy
  token, signing command, tag format, rollback, and the fact that public catalog
  submission is not part of this plan.

- [ ] **Step 4: Run the full release-equivalent verification**

  Run `npm ci && npm run format:check && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build && npm run e2e && npm run validate && npm run package`.
  Expected: every command exits 0 and the versioned archive plus checksum exist.

- [ ] **Step 5: Commit**

  Commit with `ci: add Grafana plugin release gates`.

## First Live Validation Checkpoint

After Tasks 1 and 2 are merged, validate against the user's Langfuse v4 host
before widening the query surface. The user should export credentials locally
or add them to an approved secret store; they should not paste keys into chat.
Run the opt-in smoke steps manually until Task 11 formalizes them:

1. Mount the built plugin into the user's Grafana development instance.
2. Configure base URL, public key, and secret key through Grafana secure data.
3. Run Save & Test and confirm the v4 observation probe succeeds.
4. Query a one-hour observation count through Metrics v2.
5. Query one bounded Observations v2 page with `limit=1`.
6. Inspect browser network/settings state and plugin logs for secret leakage.
7. Record only status codes, response shapes, plugin version, Grafana version,
   and Langfuse version; do not record observation content or credentials.

## Plan Self-Review

- Spec coverage: all goals are covered by Tasks 1-12; every non-goal stays out
  of the file map and acceptance steps.
- Client substitution: Task 1 measures and records the generated-client decision
  without changing the public read-only interface.
- API coverage: Metrics v2 is Tasks 2-5 and 9; Observations v2 is Tasks 1, 6, and
  7; Scores v3 is Task 8.
- Grafana coverage: dashboards, Explore, variables, frames, cancellation,
  compatibility, provisioning, and packaging each have explicit tests.
- Security coverage: secure JSON data, redaction, proxy-boundary documentation,
  secret scanning, and environment-only live smoke inputs are explicit.
- Placeholder scan: public catalog submission, license selection, signing, and
  backend features are explicitly excluded from the implementation plan. A
  maintainer must select a repository license before a public release.
- Type consistency: later tasks consume the four-method client, discriminated
  query union, cursor result shape, and transformer names defined earlier.
