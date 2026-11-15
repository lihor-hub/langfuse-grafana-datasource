# Query reliability

The production read-only client continues to use Grafana `BackendSrv` through
its data-source proxy. Langfuse authentication remains server-side. The four
client methods and the Langfuse SDK request/response type aliases are unchanged.
No direct browser-to-Langfuse request or browser Authorization header is added.

## Safe errors

Use `queryErrorMessage(error)` from `src/client/errors.ts` for query notices and
aggregate errors, **never** `error.message`, response bodies, or request objects.
It uses fixed messages and a validated Retry-After value rather than upstream
text, including JSON-parser excerpts. The adapter does not log error payloads,
attach raw causes, or preserve request headers in normalized errors.

`LangfuseClientError.kind` distinguishes:

| Kind                 | Meaning                                                       |
| -------------------- | ------------------------------------------------------------- |
| `configuration`      | Missing or invalid proxy URL                                  |
| `unauthorized`       | HTTP 401 or Grafana's specific proxy-auth HTTP 400            |
| `forbidden`          | HTTP 403; project permissions, not invalid credentials        |
| `v4-required`        | Observations v2 HTTP 404 after a successful project probe     |
| `invalid-query`      | HTTP 400, 413, or 422                                         |
| `url-too-long`       | HTTP 414; shorten filters or multi-value selections           |
| `rate-limit`         | HTTP 429; manual retry only                                   |
| `timeout`            | HTTP 408/504 or a transport TimeoutError                      |
| `cancelled`          | Aborted signal, AbortError, or Grafana cancellation           |
| `server`             | HTTP 5xx except 502/504                                       |
| `network`            | Network/proxy errors, including 502 and ordinary endpoint 404 |
| `malformed-response` | Invalid JSON or incompatible envelope/row fields              |
| `unexpected`         | Safe fallback for unclassified failures                       |

An isolated observation-listing 404 does not establish Langfuse version.
`connectionErrorMessage` preserves the existing Save & Test credential/v4
messages and generic fallback, and adds configuration/permission guidance.

## Retries and Retry-After

Every request explicitly sets `retry: 0`. The plugin has no retry operator,
retry timer, background retry, or shared-result query cache. Each call subscribes
once. A dashboard refresh or explicit user retry is a new request.

When the transport supplies response headers with HTTP 429, the client displays
Retry-After as nonnegative integer seconds or a validated HTTP-date. Invalid or
missing values are not echoed. The fallback explicitly says that retry timing
is unavailable from the Grafana proxy; it does not invent a quota or delay.

**Host-runtime limitation:** Grafana's standard `BackendSrv` currently strips
response headers while converting an HTTP error into `FetchError` (see
[Grafana 13.1 handleStreamResponse](https://github.com/grafana/grafana/blob/v13.1.0/public/app/core/services/backend_srv.ts)).
Therefore Retry-After display remains **unresolved on header-dropping hosts**,
even if Langfuse sent it. Header-preserving transport tests are not evidence of
real Grafana proxy header availability.

Grafana also owns session-401 reauthentication, separate from plugin-owned
Langfuse query retries. Native handling is retained. No plugin retries a 429 or
other upstream failure. A plain browser-fetch replacement was not adopted:
although it can preserve cookies and headers, equivalence for Grafana org,
URL-login JWT, device-bound sessions, token rotation, and logout was not proven.
Do not bypass those authentication behaviors or patch global browser transports
to recover Retry-After. Real-host request counts still need integration proof.

## Response boundary and cancellation

Before returning data to transformers, the adapter checks:

- Projects: nonempty object rows containing string project IDs.
- Metrics: a `data` array of object rows; dynamic columns and histogram values
  remain untouched for the query-aware transformer to validate.
- Observations: object rows, required core identifiers/type/start time, typed
  present optional fields, and `meta.cursor` when supplied. Optional field groups
  may be absent. Observation types remain extensible, as in the SDK.
- Scores: SDK core fields, a native discriminated NUMERIC/BOOLEAN/string value,
  typed optional groups, and `meta.limit` from 1 through 100 plus an optional
  string cursor. An observation subject's trace ID is optional in the SDK.
- Observation/score pages cannot exceed their endpoint maxima (1,000/100).

Empty query pages remain valid. Arbitrary requested observation input/output
and metadata are not serialized into diagnostics. These guards are structural;
query-specific metric aliases/histogram interpretation belong to transformers.

The adapter rejects pre-aborted calls without starting HTTP. Active signals are
passed to Grafana and also end the observable subscription. Errors never echo
`signal.reason`. Subscription cleanup removes abort listeners. The caller must
pass the same signal to every sequential page and stop before requesting a new
page after cancellation.

## Parent integration checklist for issue #13

This worker does not change `DataSource`, dispatch, pagination, or shared E2E
fixtures. The integration layer must:

1. Import `queryErrorMessage` for failed-target notices and the concise all-failed
   aggregate. Never expose raw thrown messages, headers, URLs, or response bodies.
2. Keep successful metrics/observation/log/score frames when a peer fails; attach
   a visible notice carrying the failed target's `refId` without fake points.
3. Cap target execution at four; exclude hidden targets. Pagination stays
   sequential inside each target and receives one shared request AbortSignal.
4. Stop queued targets and further pages on cancellation. Confirm real proxy
   cancellation reaches the upstream mock rather than merely hiding results.
5. Add orchestration unit tests: four held-open targets block a fifth; hidden
   targets never call the client; mixed successes survive one failure; every
   target failing produces one safe aggregate; cancellation reaches all active
   targets and stops both observation and score pagination.
6. Add real Grafana/proxy E2E tests for partial/all failure, 429 with an upstream
   request count of one, explicit unavailable timing on header-dropping hosts,
   timeout, malformed JSON/envelopes, and cancellation/upstream close. Check
   browser messages and diagnostic output for synthetic secret/payload sentinels.
7. Update README/CHANGELOG centrally and keep Retry-After acceptance pending on
   affected hosts rather than declaring issue #13 fully complete.

Focused client tests live in `src/client/errors.test.ts` and
`src/client/grafanaHttpClient.test.ts`. They include synthetic failures,
header-preserving and header-dropping transports, zero retries, native score
values, malformed rows, empty results, page bounds, and cancellation cleanup.
They do not replace the integrated browser/proxy acceptance tests.
