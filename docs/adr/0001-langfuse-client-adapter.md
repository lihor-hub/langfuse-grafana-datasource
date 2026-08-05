# ADR-0001: Use Grafana's HTTP client for Langfuse reads

- Status: Accepted
- Date: 2026-08-05

## Context

The frontend data source must call Langfuse v4 through Grafana's server-side
data proxy. The browser must not receive a Langfuse secret or construct a
Langfuse Authorization header. All later query work depends only on
`createObservabilityClient(instanceSettings)` and the four-method
`LangfuseObservabilityClient` interface.

Two adapters were implemented and measured against the same interface:

1. the generated `LangfuseAPIClient` exported by `@langfuse/core` 5.10.0;
2. Grafana's `getBackendSrv().fetch` API with plugin-owned request and response
   types.

The generated adapter could be selected only if every gate passed: browser
build and validator with zero errors, real proxy Basic Auth without a
browser-side Langfuse credential, real Grafana proxy cancellation closing the
upstream request, and no more than 250 KiB gzip growth over the native adapter.

## Decision

Select the Grafana HTTP adapter in `createObservabilityClient`.

The generated adapter remains isolated and tested so the decision can be
revisited, but it is not reachable from the production entrypoint. The real
Grafana proxy-auth and proxy-cancellation gates could not be executed because
the local Docker daemon was unavailable. Since the rule permits the generated
adapter only after every gate passes, an unavailable mandatory gate does not
qualify it for selection.

## Measurements

Both variants were built from the same source tree and exact dependency lock
under Node 22.22.3. Gzip size is `gzip -9 -c dist/module.js | wc -c`. Webpack's
`--profile --json` output was used for module and asset analysis.

| Production adapter |        `module.js` raw |     `module.js` gzip | Webpack errors | Webpack warnings | Validator errors |
| ------------------ | ---------------------: | -------------------: | -------------: | ---------------: | ---------------: |
| Grafana HTTP       |                7,923 B |              2,714 B |              0 |                0 |                0 |
| `@langfuse/core`   |              263,250 B |             21,622 B |              0 |  3 size warnings |                0 |
| Generated delta    | 255,327 B (249.34 KiB) | 18,908 B (18.46 KiB) |              — |                — |                — |

The generated gzip delta is below the 250 KiB limit. The analyzer reports the
retained `@langfuse/core/dist/index.mjs` input module as 668,796 bytes before
minification. Its three webpack warnings are the standard 244 KiB asset,
entrypoint, and performance recommendations; they are not build errors.

`@grafana/plugin-validator@latest -jsonOutput` exited 0 for both packaged
`lihorhub-langfuse-datasource` variants. It reported no errors. The remaining
warnings are expected for the initial non-catalog release: unsigned plugin,
unregistered `lihorhub` Grafana Cloud account, and no catalog screenshot; the
sponsorship link is a recommendation.

## Authentication and cancellation evidence

- Generated-client unit coverage records the browser `fetch` inputs for the
  project and bounded Observations v2 probes. No Authorization header, real
  key, or credential-like value from instance settings is present.
- The generated client is constructed with only
  `environment: "https://unused.invalid"` and Grafana's proxy `baseUrl`.
  Username and password are omitted. Every call uses `maxRetries: 0`.
- Generated-client unit coverage verifies that aborting the supplied signal
  aborts the signal received by browser `fetch`.
- Native-adapter unit coverage verifies the same bounded probes use
  `BackendSrv.fetch`, pass the supplied `AbortSignal`, and set no Authorization
  header.
- The standalone mock server accepted only an environment-supplied Basic Auth
  pair, returned 401 for another pair, returned 404 in `no-v2` mode, and marked
  a locally aborted delayed metrics request as `aborted: true`.
- `docker compose config -q` passed with runtime-only placeholder environment
  values. `docker info --format '{{.ServerVersion}}'` failed with:
  `Cannot connect to the Docker daemon at unix:///Users/ioachimlihor/.docker/run/docker.sock. Is the docker daemon running?`
  Docker Desktop was awaiting macOS administrator approval, so no claim is made
  that Grafana attached Basic Auth server-side or propagated a browser close to
  the upstream mock in this environment.

## Consequences

- Production adds about 2.7 KiB gzip and follows Grafana's documented frontend
  data-proxy path.
- Langfuse API schema changes are represented in plugin-owned types and must be
  reviewed when dependencies or the Langfuse server version change.
- The public client remains read-only: `checkConnection`, `queryMetrics`,
  `listObservations`, and `listScores`. It has no generic request method.
- The real Compose E2E suite is mandatory once Docker is available; a browser
  route stub is not an acceptable substitute.
