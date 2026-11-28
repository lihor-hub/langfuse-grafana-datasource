# Delivery issue verification: variables, onboarding and packaging

## Scope and evidence baseline

Audited issues [#12](https://github.com/lihor-hub/langfuse-grafana-datasource/issues/12),
[#14](https://github.com/lihor-hub/langfuse-grafana-datasource/issues/14) and
[#15](https://github.com/lihor-hub/langfuse-grafana-datasource/issues/15), including
bodies, comments (none at audit time) and labels (`enhancement`,
`ready-for-agent`). The implementation baseline is `origin/main` commit
`b333f94e5a58dfb9bd8f763be233ff90f43a7ee3`. This audit changes only a regression
test and this evidence record; it adds no runtime feature or release authority.

The approved product specification and implementation plan (Tasks 9–12), OSS
and pre-release specifications/plans, repository rules, and ADR-0001/0002 were
reviewed. The native Grafana HTTP adapter remains selected. No backend, write
API, generic request interface, signing or publication is introduced. Historical
plan checkboxes are not treated as evidence of current implementation.

## Exact-baseline container/browser evidence

[CI run 46053854084](https://github.com/lihor-hub/langfuse-grafana-datasource/actions/runs/46053854084)
passed at the baseline commit. Its job/step results were retrieved during this
audit. The build job passed formatting, lint, types, unit tests, fixture/release
tooling/secret checks, production build, local validation/packaging and the
upstream **metadata** analyzer. Compose configuration, Grafana startup and
Playwright execution passed on Grafana **12.3.11, 12.4.16, 13.0.14, 13.2.7,
13.3.2 and nightly**. The minimum-version browser log reports 18 passed tests.
These are previously executed CI results, not fresh local browser results.
Nightly is additional coverage, not a pinned supported-version claim. CI resolves
its matrix dynamically; these exact versions describe this run only.

Docker is not installed in this audit environment. No Docker, Grafana service,
real-host smoke or upstream validator was run locally. Require the PR's own CI
before merge; this record does not substitute for candidate-specific release
validation or a full source-enabled upstream validator.

## #12: bounded dashboard variables — satisfied

| Acceptance criterion                        | Implementation and regression evidence                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All approved low-cardinality dimensions     | `src/variables/types.ts` lists environment, observation name/type, provided model name, tags, release, prompt name/version and numeric/categorical score name/type/source. `discovery.test.ts` now independently pins that complete surface, so accidentally deleting an option cannot make the coverage silently shrink.             |
| One Metrics v2 dimension/count request      | `src/variables/discovery.ts` issues one `queryMetrics` request with dimension, count/count, ascending ordering and a 1,000-row ceiling; `discovery.test.ts` asserts the request. No observation listing is used.                                                                                                                      |
| Required bounded lookback/default           | Only 1h, 6h, 24h, 7d and 30d validate; omitted lookback normalizes to 24h. Request tests verify all durations and reject unsupported values.                                                                                                                                                                                          |
| Unique deterministic pairs                  | Discovery deduplicates and sorts strings, flattens tags, preserves numeric prompt versions, rejects malformed responses and returns text/value pairs. Tests cover these cases.                                                                                                                                                        |
| Shared work and 60-second fulfilled cache   | `cache.test.ts` checks in-flight sharing, expiry starting at fulfillment, the exact 60-second boundary, uncached rejection, isolated instances and subscriber cancellation. Cache ownership is per data-source instance/client; no cross-project global cache exists.                                                                 |
| No raw ID scanning                          | The dimension allowlist and request validation reject trace, observation, user and session IDs before dispatch.                                                                                                                                                                                                                       |
| Scoped interpolation before validation      | `src/datasource.ts` interpolates each target immediately before request building; `src/variables/interpolate.ts` works on parsed values. `interpolate.test.ts`, `scores.test.ts` and `src/mixedQueries.integration.test.ts` cover scoped/multi-values, typed membership operators and rejection of unsupported multi-value operators. |
| Browser discovery filters a dashboard query | `tests/e2e/variables.spec.ts` creates a discovery variable through real Grafana, asserts one bounded count request and the selected value in the panel's typed membership filter, then verifies rendered data. Included in the baseline passing browser suite.                                                                        |

The new test is durable verification of existing behavior, not a duplicated
feature. Existing negative tests already protect the high-cardinality boundary.

## #14: secret-safe onboarding — satisfied

| Acceptance criterion                   | Implementation and verification evidence                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installation, development, v4 and URLs | `docs/onboarding.md` documents unsigned development installation, Node/Compose setup, Langfuse v4, EU/US Cloud origins and a reserved example self-hosted origin. It does not claim a published catalog artifact.                                                                                                                                                                                      |
| Credential-free provisioning           | The onboarding template and `provisioning/datasources/datasources.yml` use environment expressions, including secure Basic Auth password storage. Compose receives synthetic credentials from the environment.                                                                                                                                                                                         |
| Query guides                           | `docs/metrics-queries.md`, `observation-queries.md`, `score-queries.md`, `dashboard-variables.md` and `platform-observability-dashboard.md` cover metrics, observations, scores, variables, tables, heatmap/fallback and Explore logs.                                                                                                                                                                 |
| Honest product boundary                | README and onboarding explicitly state frontend-only/read-only, no managed alerting, no v3 and the generic proxy's non-firewall boundary.                                                                                                                                                                                                                                                              |
| Useful sample dashboard                | `provisioning/dashboards/platform-observability.json` includes volume, generation latency/cost/tokens, model grouping, error observations and numeric score trends; `src/dashboard.test.ts` compiles every panel against the current request/frame implementation.                                                                                                                                     |
| Clean mock provisioning                | Compose mounts the provisioning directory; `src/dashboard.test.ts` checks that wiring. `tests/e2e/dashboard.spec.ts` exercises the provisioned dashboard in real Grafana against the deterministic mock; baseline matrix passed.                                                                                                                                                                       |
| Secret scanning                        | `scripts/secret-scan.mjs` scans docs, provisioning, fixtures/tests and dashboard JSON. `scripts/release-tools.test.mjs` rejects seeded key/password values and accepts environment placeholders. Fresh local scan passed.                                                                                                                                                                              |
| Real-host safety                       | `tests/smoke/real-langfuse.test.mjs` reads only `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` from process environment, skips without them, rejects credential-bearing URLs and redirects, withholds transport details and never snapshots responses. Synthetic fixture tests exercise the smoke contract and malformed-URL redaction. No real credentials were requested or used. |

The sample uses aggregate metrics and a data-source selector, not raw observation
logs or discovery dropdowns. The onboarding guide explicitly states that limit;
separate browser tests exercise discovery, raw observations and score tables.
No additional sample features are needed to satisfy this issue's criteria.

## #15: archive capability exists; retain the issue open

| Acceptance criterion                                               | Evidence and remaining limit                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum/current deterministic browser matrix                       | Baseline CI passed 12.3.11 and 13.3.2 plus the other images above. Fresh candidate evidence must be retained at release time.                                                                                                                                                                                             |
| Complete release-equivalent checks, lockfile and bundle comparison | Local quality checks below passed. The lockfile is unchanged by this PR. `npm audit --json` currently reports **30 findings: 26 moderate, 4 low, zero high/critical**; this is not a clean security or license review. No fresh candidate bundle comparison or full release-equivalent dependency assessment is claimed.  |
| Versioned deterministic archive/checksum                           | `scripts/package-plugin.mjs` sorts files, fixes timestamps/permissions and writes SHA1/SHA256. Release tooling tests compare independently generated archive bytes. The unsigned release workflow invokes these tools without signing credentials or publication rights.                                                  |
| Compiled assets/docs, no credential fixtures                       | `scripts/validate-plugin.mjs` enforces package allowlists, metadata, referenced assets and secret checks. Local 0.2.1 archive validation passed for 20 files, including module/source map, metadata, license/notice, guides, images and the synthetic dashboard. No tests or credential-bearing provisioning is included. |
| Opt-in environment-only smoke                                      | Implemented as described for #14; not run against a real host.                                                                                                                                                                                                                                                            |
| Versioning, validation, signing, rollback, submission guidance     | `docs/maintainers/releasing.md` and `grafana-catalog-launch.md` define explicit stop/go gates.                                                                                                                                                                                                                            |
| Maintainer-controlled license/signing/catalog gates                | Apache-2.0 selection already exists; it was preserved, not reselected. Workflow tests prohibit signing credentials/signing in ordinary CI and unsigned automation. All signing, publisher setup, tags, releases and catalog submission still require separate approval.                                                   |

Do **not** close #15 based on packaging alone: its complete verification and
bundle-comparison criterion is not established by this audit. The upstream
metadata-only CI pass is not a full validator/source scan. Follow the release
runbook to gather exact-candidate evidence and review remaining findings before
closing the delivery gate. No archive was uploaded or published in this work.

## Fresh local checks

Toolchain: Node **24.18.0**, locked dependencies installed with `npm ci`.

- `npm run format:check`, `npm run lint`, `npm run typecheck`.
- `npm test -- --runInBand`: **27 suites, 414 tests passed**, no snapshots.
- `npm run test:fixtures`: **9 tests passed** (synthetic HTTP only).
- `npm run test:release-tools`: **8 tests passed**, including deterministic
  archives, secret rejection, and unsigned workflow controls.
- `npm run test:secrets`: passed; `npm run build`: passed.
- `npm run validate`: **20 packaged files validated** by local checks.
- `npm run package`: local unsigned versioned archive plus SHA1/SHA256;
  reproducibility is separately asserted by the release-tool test.
- `git diff --check` and Markdown lint for this evidence record.

No changelog update is necessary: this PR changes verification only, with no
user-visible behavior, compatibility, dependency or release-status change.
