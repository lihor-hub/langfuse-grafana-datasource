# Langfuse Grafana Data Source Design

**Status:** Approved in conversation on 2026-08-05

## Purpose

Build a read-only Grafana data source plugin for exploring and visualizing
observability data from Langfuse v4. The plugin supports Grafana dashboards and
Explore without requiring a Go backend.

The first release covers Langfuse metrics, observations, and scores. Prompts,
datasets, experiments, models, comments, administration, ingestion, evaluation
changes, and every other non-observability resource are outside this release.

## Goals

- Connect Grafana to Langfuse Cloud or a self-hosted Langfuse v4 instance.
- Keep Langfuse credentials out of browser-side plugin code and query models.
- Retrieve aggregate metrics through Metrics API v2.
- Retrieve spans, generations, events, and trace-related context through
  Observations API v2.
- Retrieve individual scores through Scores API v3.
- Produce idiomatic Grafana time-series, table, heatmap, and log data frames.
- Support dashboard variables and Grafana's scoped variable interpolation.
- Give dashboard and Explore users guided query builders without preventing
  advanced Langfuse filters.
- Keep every request issued by the plugin and every plugin-owned interface
  read-only.
- Test against the minimum supported Grafana release and the current Grafana
  release matrix.

## Non-goals

- Langfuse v3 or legacy API compatibility.
- Grafana-managed alerting, recorded queries, query caching, streaming, or
  externally shared dashboards.
- A Grafana plugin backend or Go binary.
- Langfuse ingestion or mutation of any Langfuse resource.
- Prompt, dataset, experiment, model, comment, organization,
  project-administration, or configuration browsing.
- Recreating the full Langfuse application inside Grafana.
- Client-side aggregation of raw observations when Metrics API v2 can perform
  the aggregation.
- Treating Grafana's generic data proxy as a strict HTTP-method firewall; hard
  server-side enforcement would require a plugin backend or separately
  restricted upstream credentials.
- Public plugin catalog submission in the initial implementation. Packaging will
  be ready for signing, but signing and submission remain maintainer-controlled
  release work.

## Compatibility baseline

The researched dependency snapshot on 2026-08-05 is:

- `@grafana/create-plugin` 7.9.1.
- Grafana frontend packages 13.1.x.
- Grafana 12.3.0 or newer, matching the current scaffold's `grafanaDependency`
  floor.
- Node.js 22 for development and CI, matching the current scaffold.
- `@langfuse/core` 5.10.0.
- Langfuse server v4 only.

Exact dependency versions will be locked. Updating them will be an intentional
maintenance operation with type checking, unit tests, end-to-end tests, plugin
validation, and bundle comparison.

Langfuse v4 is required because the default `api.observations` and `api.metrics`
resources use v2 endpoints that are unavailable on self-hosted v3. The plugin
will not call `api.legacy.*`. See the
[Langfuse compatibility matrix](https://langfuse.com/docs/compatibility) and
[v3-to-v4 migration guide](https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4).

## Considered architectures

### 1. Generated Langfuse API client behind the Grafana data proxy

Use the exported `LangfuseAPIClient` from `@langfuse/core` and point its base
URL at the configured Grafana data-proxy URL. Wrap it in a plugin-owned
read-only interface.

This is the selected design. It provides Langfuse-owned request and response
types without importing the higher-level tracing and experiment behavior from
`@langfuse/client`. It also leaves authentication to Grafana, where the secret
is available.

### 2. Full `@langfuse/client`

The higher-level package is universal JavaScript and exposes the same public API
through its `api` property. It also brings tracing, prompt, dataset, and
experiment managers that the data source does not need, and its constructor
assumes that it owns Langfuse credentials. This would increase coupling and
likely bundle size without adding required behavior.

### 3. Grafana-native HTTP adapter

Call the three Langfuse REST endpoints through `getBackendSrv()` and maintain
plugin-local request and response types. This has the smallest potential bundle
and the most direct integration with Grafana cancellation and error handling,
but it makes this repository responsible for tracking Langfuse API schema
changes.

This is the fallback if a measured integration spike shows that the generated
client does not work reliably through the data proxy, fails plugin validation,
or causes an unreasonable bundle increase. The plugin-owned read-only interface
ensures this substitution does not change query models or data-frame
transformers.

### Backend data source

A Go backend would enable Grafana-managed alerting, server-side caching,
recorded queries, and other backend-only features. Those are out of scope. The
frontend query and configuration models must remain separable so a future
backend can reuse them if those requirements change.

## Architecture

```text
Grafana dashboard or Explore
  -> query editor and typed query model
  -> DataSource orchestration
  -> read-only LangfuseObservabilityClient
  -> Grafana data proxy with server-side Basic Auth
  -> Langfuse v4 read API
  -> response transformer
  -> Grafana data frames
```

The implementation is divided into focused units:

- **Configuration editor:** collects the Langfuse base URL, public key, secret
  key, TLS, timeout, and proxy options. It owns secret reset behavior but never
  performs observability queries.
- **Data source orchestrator:** filters hidden queries, interpolates variables,
  propagates cancellation, limits concurrency, dispatches by query kind, and
  assembles partial results.
- **Read-only client:** exposes connection validation, metrics reads,
  observation reads, and score reads. It has no generic method and no mutation
  methods.
- **Query definitions:** contain discriminated query models, defaults, static
  API capabilities, validation, and builder-to-request translation for each
  query kind.
- **Editors:** provide one guided editor for each query kind plus advanced
  structured JSON editing where needed.
- **Transformers:** independently convert metrics, observations, scores, and
  histograms into Grafana data frames.
- **Variable support:** interpolates variables in ordinary queries and executes
  bounded low-cardinality discovery queries.
- **Error translation:** turns client and HTTP failures into stable user-facing
  error categories without leaking sensitive data.

Each unit is usable through a typed interface and testable without rendering the
whole plugin.

## Authentication and configuration

Langfuse's public API uses HTTP Basic Auth: the public key is the username and
the secret key is the password. Grafana stores the password as encrypted secure
data and adds the Basic Auth header in its server-side data proxy. The frontend
receives only the Grafana proxy URL and does not receive the stored secret after
configuration is saved.

The configuration UI will label the fields in Langfuse terminology while mapping
them to Grafana's standard HTTP data-source settings:

- Langfuse base URL -> data-source URL.
- Langfuse public key -> Basic Auth user.
- Langfuse secret key -> secure Basic Auth password.
- TLS, CA certificate, client certificate, timeout, and permitted cookies ->
  Grafana HTTP settings where supported by the scaffolded component.

Save & Test performs a minimal authenticated project read and a bounded
Observations API v2 probe. The project read verifies credentials. The
observation probe verifies that the configured server exposes the v4 read API. A
v3 endpoint response or missing v2 endpoint reports that Langfuse v4 is
required.

The generated Langfuse API client is created without real credentials and is
pointed at the Grafana proxy base URL. Grafana overwrites the outbound
authorization header with the configured Basic Auth values before contacting
Langfuse. If the generated client cannot be configured without creating a
conflicting browser-side authorization header, the implementation switches to
the Grafana-native HTTP adapter.

## Read-only boundary

The public client interface contains only:

- `checkConnection`.
- `queryMetrics`.
- `listObservations`.
- `listScores`.

There is no generic path, method, or body entry point. Query editors cannot
select an HTTP endpoint or method. Advanced mode edits only the documented
query/filter object for the selected read operation. Plugin-owned code must not
call Langfuse write endpoints.

This boundary guarantees the behavior of the data-source plugin, not every
request that a Grafana user might craft directly against Grafana's generic
data-proxy HTTP endpoint. Grafana's frontend data proxy does not provide a
complete per-plugin HTTP-method firewall for unmatched routes. If hard
server-side write prevention becomes a requirement, the design must add a
backend or use upstream credentials whose authorization policy is independently
read-only.

## Query model

The top-level query is a discriminated union with `kind` equal to `metrics`,
`observations`, or `scores`. Each query also retains Grafana's `refId` and
standard hide behavior. Defaults produce a valid, useful request without
requiring every control to be touched.

Grafana's selected time range is authoritative. It is injected immediately
before request dispatch and is not stored as fixed timestamps in the dashboard
query model. String filter values support scoped variable interpolation. Time
and numeric fields are validated after interpolation.

The guided builder and advanced representation edit the same canonical typed
query model. Switching modes does not silently discard supported fields. Invalid
advanced JSON remains in the editor with an inline validation error and is never
dispatched.

### Metrics queries

Metrics queries use `GET /api/public/v2/metrics`. The editor supports every
stable v2 view:

- `observations`.
- `scores-numeric`.
- `scores-boolean`.
- `scores-categorical`.

The editor exposes:

- One or more measures and valid aggregations for the selected view.
- Zero or more supported dimensions.
- Typed filters, including object-key filters.
- Optional time dimension with `auto`, `minute`, `hour`, `day`, `week`, or
  `month` granularity.
- Ordering by dimension, `time_dimension`, or generated metric alias.
- Histogram bin count.
- Row limit from 1 through Langfuse's v2 maximum of 1,000.

View-specific options prevent invalid measure, dimension, and aggregation
combinations. High-cardinality fields such as trace, user, and session IDs
remain available for filtering but are not offered as grouping dimensions.

Advanced mode exposes the documented Metrics v2 query object. The plugin
overwrites `fromTimestamp` and `toTimestamp` with Grafana's current range and
enforces the row limit before dispatch.

### Observation queries

Observation queries use `GET /api/public/v2/observations`. They support:

- Type, name, level, environment, version, logical-root status, parent, trace,
  user, and session filters.
- Advanced structured filters supported by the endpoint.
- Field groups `basic`, `time`, `io`, `metadata`, `model`, `usage`, `prompt`,
  `metrics`, and `trace_context`; the core fields are always present.
- Table or log output.
- A configurable log body chosen from observation name, status message, input,
  or output, with safe fallback to the observation name.
- A total result ceiling configurable from 1 through 5,000, defaulting to 1,000.

General listing queries always set `fromStartTime` and `toStartTime` from
Grafana's range. A specific trace lookup also keeps the range when available
because Langfuse recommends bounded reads for performance.

Pages use the endpoint maximum of 1,000 rows. Cursor pagination stops when there
is no cursor, the query is cancelled, an error occurs, or the configured total
result ceiling is reached. Reaching the ceiling returns the collected rows with
a visible truncation notice.

### Score queries

Score queries use `GET /api/public/v3/scores`. They support:

- Numeric, boolean, categorical, text, and correction data types.
- Name, source, environment, configuration, annotation queue, author, trace,
  observation, session, and experiment-subject filters.
- Exact value, numeric lower bound, and numeric upper bound subject to the API's
  type rules.
- Optional `details`, `subject`, and `annotation` field groups.
- A total result ceiling configurable from 1 through 5,000, defaulting to 500.

The editor prevents mutually exclusive subject filters and requires a trace ID
when an observation ID is used. Pages use the endpoint maximum of 100 rows and
follow the same cursor, cancellation, and ceiling rules as observations.

Individual scores are returned as tables. Aggregate score charts use Metrics API
v2 rather than client-side aggregation.

## Data-frame mapping

### Metrics

When `timeDimension` is present, the transformer emits time-series frames.
`time_dimension` becomes a Grafana time field. Each metric alias becomes a
numeric field. Dimension combinations become field labels so Grafana legends,
transformations, and overrides work normally.

When no time dimension is present, the transformer emits a table preserving
dimensions and metric aliases as columns. Dynamic Langfuse response columns are
ordered deterministically: dimensions, time, metrics, then remaining fields.

Metric fields include Grafana unit metadata where the measure has stable
semantics:

- Cost -> USD currency.
- Latency, streaming latency, and time to first token -> milliseconds.
- Tokens and counts -> short numeric units.
- Tokens per second -> throughput.
- Boolean-score average -> percentage represented according to the returned
  zero-to-one value.

Histogram tuples are converted into heatmap-compatible frames when the selected
query has enough bucket information. If the API response cannot be represented
without inventing bounds or timestamps, the same values are returned as a
deterministic table instead of being discarded.

### Observations

Table output uses explicit field types and a stable column order beginning with
time, name, type, level, identifiers, trace context, model, usage/cost, metrics,
and optional large payload fields.

Log output uses Grafana's log-frame contract:

- `timestamp` -> observation start time.
- `body` -> configured body field with observation-name fallback.
- `severity` -> Langfuse level.
- `id` -> observation ID.
- `labels` -> selected low-cardinality context such as observation type,
  environment, model, trace name, release, and prompt.
- Frame metadata -> log-lines type and preferred logs visualization.

Trace and observation identifier fields include data links to the configured
Langfuse instance. Links use the configured Langfuse UI base URL, not the
Grafana proxy URL.

### Scores

Scores are returned as tables. The typed `value` field preserves numbers and
booleans as native Grafana values and strings as strings. Optional subject,
detail, and annotation properties are flattened only at documented object
boundaries; metadata remains a structured field rather than producing unbounded
dynamic columns.

### Empty and partial results

An empty successful API response produces a valid empty frame with the expected
schema. When multiple Grafana targets run together, successful targets return
even if another target fails. If every target fails, the data source throws one
concise aggregated error. Partial failures are attached as visible query notices
without inserting fake data points.

## Dashboard and Explore behavior

The standard editor is used in dashboards and Explore. Explore defaults to
observation log output when a new observation query is created; dashboards
default to table output. Users can change the format in either context.

The plugin metadata advertises metrics and logs support. It does not advertise
alerting, annotations, or streaming in the first release.

## Variables

Ordinary query filters interpolate Grafana scoped variables immediately before
validation and dispatch. Multi-value variables are converted according to the
selected Langfuse filter operator rather than concatenated into an arbitrary
string.

Variable queries provide bounded discovery of low-cardinality dimensions through
Metrics API v2, including:

- Environments.
- Observation names and types.
- Provided model names.
- Tags and releases.
- Prompt names and versions.
- Score names, types, and sources.

The variable query executes a dimension plus count metric over a required
relative lookback, returns unique text/value pairs, and uses a browser-local
cache. The supported lookbacks are 1 hour, 6 hours, 24 hours, 7 days, and 30
days; the default is 24 hours. Cache entries expire after 60 seconds.
High-cardinality trace, observation, user, and session identifiers are not
discovered by scanning raw observations. They can still be supplied by custom,
constant, or external Grafana variables and used as filters.

## Reliability and performance

- Hidden targets are not dispatched.
- Duplicate discovery requests share a 60-second browser-local cache.
- Main dashboard and Explore results are not cached by the plugin.
- Active request cancellation is passed to the generated client or Grafana HTTP
  request.
- Target concurrency is capped at four active requests to prevent unbounded
  browser and Langfuse request bursts.
- Metrics and variable queries make one API request per target.
- Observation and score pagination is sequential per target and stops at the
  configured ceiling.
- The adapter sets automatic retries to zero for all user queries. Grafana
  refresh or an explicit user retry starts a new request. HTTP 429 honors and
  displays `Retry-After` without silently spending more quota.
- Large input, output, and metadata fields are fetched only when their field
  groups are selected.

Langfuse Cloud rate limits vary by plan, while self-hosted instances have no
Langfuse-enforced hard limit. The editor and error messages must therefore avoid
implying one universal quota. See the
[Langfuse API limits](https://langfuse.com/faq/all/api-limits).

## Error handling

The error translator distinguishes:

- Invalid configuration or URL.
- Authentication failure.
- Insufficient Langfuse authorization.
- Langfuse v4 endpoint unavailable.
- Invalid query or filter.
- Rate limit with retry timing when supplied.
- Request timeout or cancellation.
- Langfuse server failure.
- Network or proxy failure.
- Malformed or incompatible response.

User-facing messages state what the user can change. Technical details may be
logged for diagnosis, but authorization headers, secret values, and unrequested
input/output/metadata are never logged.

## Testing strategy

### Unit tests

- Query defaults, validation, builder-to-request translation, and advanced-mode
  round trips.
- View-specific metric capabilities and invalid combinations.
- Scoped and multi-value variable interpolation.
- Observation and score pagination, ceilings, cancellation, and truncation.
- Metrics time-series, metrics table, histogram, observation table, observation
  log, and score table transformations.
- Empty, partial, malformed, and unexpected responses.
- Error translation and redaction.
- Discovery cache keys and expiry.

### Component tests

- Configuration URL and credentials, saved-secret state, and secret reset.
- Metrics, observation, and score editors.
- Guided and advanced editing synchronization.
- Validation messages and disabled execution for invalid queries.
- Context-specific dashboard and Explore defaults.

### End-to-end tests

A deterministic mock Langfuse v4 HTTP service will run with the Grafana
development environment. Provisioned data-source configuration will use
environment interpolation for credentials and will not commit secrets.

End-to-end coverage includes:

- Save & Test success, invalid credentials, and non-v4 server response.
- Metric time series, grouped series, tables, and histograms.
- Observation tables and Explore log view.
- Score tables for every data type.
- Variable discovery and variable interpolation.
- Empty results, partial target failure, pagination ceiling, cancellation, and
  rate-limit messaging.
- Verification that browser-visible settings and query payloads do not contain
  the secret key.

The generated Grafana E2E matrix will cover the declared minimum and supported
current releases. A separate opt-in smoke suite can target a real Langfuse v4
host using `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY`
supplied through the local shell or CI secrets. Credentials must never be pasted
into issue bodies, committed files, or chat.

## CI and release gates

Every pull request runs formatting checks, linting, type checking, unit tests,
component tests, a production build, Grafana E2E tests, plugin metadata
validation, dependency review, and bundle-size comparison.

The first implementation slice records whether `@langfuse/core`:

- Builds in the Grafana browser plugin environment.
- Works through the data proxy without real browser-side credentials.
- Supports request cancellation.
- Passes Grafana plugin validation.
- Produces an acceptable, reviewable bundle delta.

If any of these fail, the slice selects the Grafana-native HTTP adapter and
records the reason in an architecture decision. This is an internal
substitution, not a change to the approved product behavior.

Release automation produces a versioned plugin archive. Signing requires a
maintainer-controlled Grafana access-policy token. Catalog submission is
considered only after the observability feature set, documentation,
compatibility tests, and validator are stable.

## Documentation deliverables

- Installation and local-development instructions.
- Langfuse v4 compatibility requirement.
- Cloud-region and self-hosted URL examples.
- Secure credential and provisioning examples using environment variables.
- Query guides for metrics, observations, scores, variables, and Explore.
- Known limitations, especially no Grafana-managed alerting, no write
  operations, and no Langfuse v3 support.
- A sample dashboard demonstrating volume, latency, cost, token usage, model
  grouping, error observations, and score trends.
- Release and signing instructions for maintainers.

## Future extensions

The following require a new design decision and are not implied by this
specification:

- Go backend for Grafana-managed alerting, recorded queries, or server-side
  caching.
- Grafana annotation queries derived from observations or scores.
- Streaming or live tailing.
- Prompt, dataset, experiment, model, comment, or administrative resource
  browsing.
- Langfuse mutations or feedback submission.
- Langfuse v3 compatibility.

## Authoritative references

- [Grafana: Build a data source plugin](https://grafana.com/developers/plugin-tools/tutorials/build-a-data-source-plugin)
- [Grafana: Fetch frontend data through the data proxy](https://grafana.com/developers/plugin-tools/how-to-guides/data-source-plugins/fetch-data-from-frontend)
- [Grafana: Data-source authentication](https://grafana.com/developers/plugin-tools/how-to-guides/data-source-plugins/add-authentication-for-data-source-plugins)
- [Grafana: Frontend versus backend data sources](https://grafana.com/developers/plugin-tools/how-to-guides/data-source-plugins/convert-a-frontend-datasource-to-backend)
- [Grafana: Data frames](https://grafana.com/developers/plugin-tools/key-concepts/data-frames)
- [Grafana: Logs data-source contract](https://grafana.com/developers/plugin-tools/tutorials/build-a-logs-data-source-plugin)
- [Grafana: Variables](https://grafana.com/developers/plugin-tools/how-to-guides/data-source-plugins/add-support-for-variables)
- [Grafana: Plugin E2E testing](https://grafana.com/developers/plugin-tools/e2e-test-a-plugin)
- [Grafana: Publishing best practices](https://grafana.com/developers/plugin-tools/publish-a-plugin/publishing-best-practices)
- [Langfuse: Public API](https://langfuse.com/docs/api-and-data-platform/features/public-api)
- [Langfuse: Metrics API v2](https://langfuse.com/docs/metrics/features/metrics-api)
- [Langfuse: Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api)
- [Langfuse: Scores API v3](https://langfuse.com/docs/api-and-data-platform/features/scores-api)
- [Langfuse: Versions and compatibility](https://langfuse.com/docs/compatibility)
- [Langfuse: API limits](https://langfuse.com/faq/all/api-limits)
- [Langfuse: Migrate self-hosted v3 to v4](https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4)
