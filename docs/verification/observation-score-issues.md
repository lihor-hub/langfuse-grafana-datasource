# Observation and score issue acceptance evidence

## Scope and disposition

Audited `origin/main` at `b333f94e5a58dfb9bd8f763be233ff90f43a7ee3`
against the bodies, comments and labels of issues #3, #9, #10 and #11.
All four were open, `ready-for-agent`, with no comments when read.
The implementation already exists; this change adds regression evidence,
not duplicate functionality or a new compatibility claim.

- **#3: satisfied**, with the synthetic table/query/editor/browser coverage below.
- **#11: satisfied**, with the synthetic score coverage below.
- **#9: not fully satisfied**. The valid empty-continuation-page case is
  blocked by the product decision in
  [#65](https://github.com/lihor-hub/langfuse-grafana-datasource/issues/65).
  This change does not select a request budget or alter the guard.
- **#10: implemented behavior, incomplete acceptance evidence**. Unit,
  component and integration coverage verifies the logs contract, fallbacks,
  labels and UI links. Explore E2E covers output-body display, name fallback
  for null status messages and unrequested output, and format switching, but
  does not assert labels or usable Langfuse data links in the browser. Do not treat that narrower browser test
  as full coverage of the final criterion. Its declared #9 dependency also
  remains open. This PR intentionally does not close #10.

A closing PR is not a direct issue closure. Only #3 and #11 should receive
closing references; #9, #10 and #65 remain open. No real credentials, hosts,
customer data, merges, releases, tags or protection changes are involved.

## #3: bounded observation tables

| Acceptance criterion                                                            | Implementation and durable evidence                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard observations default to table                                         | `observationFormat` in `src/queries/observations.ts`; context tests in `src/editors/ObservationQueryEditor.test.tsx` and populated dashboard/Explore dispatch in `src/mixedQueries.integration.test.ts`. The overall new dashboard query remains metrics; this criterion applies after choosing observations. |
| Current range becomes `fromStartTime` / `toStartTime`; no persisted fixed times | `buildObservationRequest` injects both URL bounds and structured AND bounds. Runner tests overwrite legacy times. New integration regression refreshes the range and asserts the original canonical target remains unchanged. Editor removes legacy times on guided edits.                                    |
| All ten specified v4 observation types                                          | Parameterized runner acceptance for SPAN, GENERATION, EVENT, AGENT, TOOL, CHAIN, RETRIEVER, EVALUATOR, EMBEDDING, GUARDRAIL in `src/queries/observations.test.ts`. This is not a claim about future upstream types.                                                                                           |
| Stable typed basic columns                                                      | `src/transformers/observations.ts` explicit column definitions; transformer tests compare populated and empty schemas; new core-only and each-group runner tests pin the eight core columns.                                                                                                                  |
| Successful empty table schema                                                   | Default empty runner test and transformer schema equality tests; dashboard empty scenario in `tests/e2e/observations.spec.ts`.                                                                                                                                                                                |
| Hidden targets and invalid interpolated values never dispatch                   | Hidden/cancelled and invalid-definition runner cases; mixed-query integration tests reject invalid scalar multi-value interpolation before dispatch while preserving peers.                                                                                                                                   |
| Unit/component/E2E coverage for populated and empty behavior                    | Query and transformer tests, context/editor component tests, populated mixed-query integration and both dashboard scenarios in `tests/e2e/observations.spec.ts`. See verification boundaries below.                                                                                                           |

## #9: detailed observation queries (still blocked)

| Acceptance criterion                                                               | Evidence / remaining limit                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guided type, name, level, environment, version, root, parent, trace, user, session | Controls in `src/editors/ObservationQueryEditor.tsx`; runner parameter matrix retains scope and selected time bounds in the AND filter array.                                                                                                                                          |
| Advanced filters round-trip; no arbitrary method/endpoint                          | Editor canonical JSON tests and scoped-variable preservation; allowlisted parsing rejects unsupported properties before dispatch.                                                                                                                                                      |
| Nine field groups, core always present                                             | New runner matrix independently selects each of basic, time, io, metadata, model, usage, prompt, metrics, trace_context; verifies `fields=core,<selected>` and core column order. A separate empty-selection regression verifies core-only output.                                     |
| Payloads only when selected                                                        | Same matrix proves input/output/metadata columns match selection; runner default and log-body tests prove a body choice does not implicitly request io.                                                                                                                                |
| Sequential pages, at most 1,000 rows each                                          | Runner 5,000-row test tracks active requests and expects five 1,000-row pages.                                                                                                                                                                                                         |
| Ceiling 1–5,000; default 1,000                                                     | Default request, invalid bound tests, maximum-budget test and new one-row core-only regression.                                                                                                                                                                                        |
| Stop conditions and visible truncation                                             | Existing repeated-cursor, cancellation, error, final-empty-page and ceiling coverage. **Not complete:** `guardPage` still rejects valid empty pages with a continuation cursor. Upstream allows these; #65 requires a finite request budget and exhaustion policy before that changes. |
| Regression coverage                                                                | `src/queries/observations.test.ts`, transformer/component tests and browser table scenarios cover the listed implemented cases, but cannot discharge #65.                                                                                                                              |

## #10: observation logs and links (not closed here)

| Acceptance criterion                                                | Evidence / remaining limit                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explore logs / dashboard table defaults                             | Context component tests and new populated mixed-query dispatch regression in both contexts.                                                                                                                                                                        |
| Timestamp, body, severity, ID, labels, metadata                     | Explicit typed transformer tests assert `timestamp/body/severity/id/labels`, normalized severity and `log-lines` / preferred logs metadata.                                                                                                                        |
| Four body choices and fallback                                      | Transformer tests cover absent status, selected output, unselected input, structured input and unnamed fallback; new integration regression covers output selection without io falling back to name.                                                               |
| Selected low-cardinality labels; no IDs                             | Transformer tests pin the complete allowlist (type, environment, model, trace name, release, prompt); user/session/trace IDs remain excluded.                                                                                                                      |
| Configured UI URL, never proxy                                      | Encoded project-scoped trace/observation links and invalid/proxy roots tested in transformer suite; new mixed-query regression verifies DataSource passes the configured UI root all the way to populated output.                                                  |
| Format switch preserves canonical definition                        | Context component tests preserve filters; existing Explore browser scenario inspects advanced JSON after switching to table.                                                                                                                                       |
| Component, transformer and Explore E2E fallback/label/link coverage | Component/transformer/integration evidence exists. **Remaining gap:** browser assertions for selected labels and usable data links. E2E now also asserts name fallback for null status messages and unrequested output without enabling io. #9 is also still open. |

## #11: typed individual score tables

| Acceptance criterion                                                                      | Implementation and durable evidence                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, source, environment, config, queue, author, trace, observation, session, experiment | `SCORE_STRING_FILTERS`, parser and `buildScoreRequest` in `src/queries/scores.ts`; all-filter request test plus valid subject-family cases. `ScoreQueryEditor` exposes these and its component tests preserve subject filters across modes.                                                                                                             |
| Exact/numeric rules; subject exclusivity; observation requires trace                      | Parameterized valid/invalid query tests for all five types, finite numbers, bound order, BOOLEAN exact values, unsupported TEXT/CORRECTION exact filters and conflicting subjects. Invalid requests never dispatch.                                                                                                                                     |
| Selectable details/subject/annotation                                                     | Editor canonical round-trip tests; transformer tests pin selected columns and exclude unrequested metadata/subject columns.                                                                                                                                                                                                                             |
| Pages ≤100, ceiling 1–5,000, default 500                                                  | Existing default five-page and shrinking-last-page tests; new maximum-budget regression verifies exactly 50 sequential pages, 5,000 unique rows, opaque cursor preservation, identical filters/range and the same AbortSignal on every page.                                                                                                            |
| Native number/boolean/string                                                              | Five-type transformer cases preserve `3.5`, `false`, categorical/text strings and empty correction strings in separate typed value columns. Invalid response types are rejected.                                                                                                                                                                        |
| Flatten documented boundaries, structured metadata                                        | Transformer tests pin `subject.kind/id/traceId` and retain nested metadata as `FieldType.other`, without dynamic metadata columns.                                                                                                                                                                                                                      |
| All types/filters/groups/cursors/cancellation/empty/truncation covered                    | Runner tests cover repeated cursors, before/between-page aborts, final empty pages, default/maximum ceilings, malformed values and no retry. Transformers cover every empty schema and native type. Editor tests cover filters/groups/validation. `tests/e2e/scores-table.spec.ts` defines all five native-type table checks through the Grafana proxy. |

Scores also retain their pre-existing empty-continuation-page rejection. This
synthetic acceptance audit is not an independent review of the upstream Scores
v3 contract and does not generalize #65's observation-specific finding into an
unsupported Scores compatibility claim.

## Verification and limits

Fresh local checks on this regression change, Node 24.18.0:

- `npm ci --no-audit --no-fund`: passed.
- `npm test -- --runInBand`: 27 suites / 426 tests passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: passed.
- `npm run build`: passed.
- `npm run test:fixtures`: 9 tests passed.
- `npm run test:secrets`: passed.
- `npm run e2e -- --list observations.spec.ts scores-table.spec.ts`: passed
  discovery only, **not browser execution**.

Docker is not installed on this worker host; no local Grafana/browser proxy
run was executed and no external service was installed. The existing baseline
[CI run 46053854084](https://github.com/lihor-hub/langfuse-grafana-datasource/actions/runs/46053854084)
passed on the exact audited main SHA, including Playwright against Grafana
12.3.11, 12.4.16, 13.0.14, 13.2.7, 13.3.2 and nightly. That is existing
baseline evidence, not a fresh browser run of this PR. PR CI remains the
fresh branch browser gate. No live Langfuse smoke or publication was performed.

No runtime behavior, persisted query shape, support floor or user-visible
feature changed, so no feature changelog entry is warranted. Read-only client
boundaries, secure credential handling, cancellation, redaction and partial
peer-result behavior are unchanged and remain covered by the full suite.
