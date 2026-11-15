# Release-track verification and remaining gates

This is evidence for the isolated release/onboarding track, not a claim that
all concurrent feature implementations or a release candidate have passed.

## Dependency reachability review

Before considering dependency changes, `npm audit --json` reported **52 findings:
20 high, 26 moderate, 6 low** under the existing lockfile. No dependency or
lockfile change was made. This is not a clean audit claim.

Production webpack stats from `npm run build -- --profile --json <external-path>`
reported zero errors/warnings and only `grafana-public-path.js` from
`node_modules` in the compiled module graph. The baseline `module.js` is
18,226 bytes raw / 5,635 bytes gzip (level 9). Grafana frontend packages and
React are runtime externals supplied by Grafana; the generated Langfuse client
and `@langfuse/core` implementation are not reachable in the production bundle.
This matches ADR-0001's native HTTP adapter selection.

Consequently the audit's DOMPurify, moment, router and related Grafana dependency
findings are not copies embedded by this plugin. Their exploitability and fixes
in the **running Grafana host** still need supported-host security review.
Build/test/release-tool findings (including signing, Markdown/link parsers,
URI/proxy utilities and test tooling) remain a supply-chain and CI input risk;
absence from the browser bundle is not a justification to call them safe.
Do not feed arbitrary untrusted content into privileged build tooling. A tested,
reviewed toolchain refresh is separate work; `npm audit fix --force` or changing
Grafana dependency floors without compatibility evidence is not an appropriate
release-track shortcut.

Rerun the audit and graph inspection after integration. Capture advisory URLs,
paths and fix availability in private build evidence, review the exact lockfile
diff if a fix is selected, and test the exact candidate again. The numbers above
are time-specific, not a future release waiver. Parent decides whether the
remaining findings block promotion.

## Subsequent bounded security remediation

The 52-finding audit and 18,226-byte bundle above describe the initial isolated
release track only. A separately authorized follow-up starts from integrated
commit `b522af7`: compatible transitive updates, the approved Markdown-lint
0.24.1 direct dev-tool update, and the supported react-use 17.6.1 caller patch
reduce npm audit to **36 findings: 7 high, 23 moderate, 6 low**. No overrides,
Grafana/React/SDK direct version changes, Node-floor changes or forced FTP major
were applied. See [dependency remediation](dependency-remediation.md) for exact
versions, root chains, API usage, checks and remaining source-scan gates.

All remaining npm high chains lead to basic-ftp 5 through signing/link-check
proxy tooling. Latest get-uri still requires FTP 5; forcing FTP 6 would cross
the caller's declared range. Parent must rerun the exact-source official
validator; a skipped source scan or wrong default-branch archive is not a pass.
The follow-up does **not** waive the remaining high findings or declare the
candidate safe to release. Integrated bundle before/after is 85,816 bytes raw,
22,018 gzip, with only grafana-public-path.js from node_modules reachable.

### Subsequent explicitly approved FTP exception

The parent subsequently approved `get-uri → basic-ftp: 6.2.6` as a scoped exact
npm override after reviewing the upstream FTP-bounce hardening release notes.
Real loopback-only get-uri tests demonstrate ordinary FTP retrieval still works
and a distinct advertised transfer host receives no connection/read by default.
No transfer-host opt-out is enabled. This supersedes the prior unresolved FTP
blocker, not the earlier evidence itself. Current npm audit is **29 findings:
zero high, 23 moderate, 6 low**. The source-enabled official validator rerun
remains parent-owned and must not be inferred from npm results. The detailed
[remediation record](dependency-remediation.md) documents compatibility behavior,
primary-source evidence and the override removal condition.

## Confirmed signing-gate fix

Ordinary CI previously inherited `GRAFANA_ACCESS_POLICY_TOKEN` and signed a
build whenever that repository secret existed. Adding publisher credentials
would therefore implicitly sign unrelated CI output. CI no longer receives a
signing token or invokes signing. The release workflow also produces **unsigned
Actions artifacts only**, with checksums and no publication rights. Tests
assert neither workflow refers to a signing secret.

A maintainer must separately authorize signing of an exact validated artifact.
If signing automation is later added, isolate it behind an explicitly approved
release action/environment, scope the token to that job, and never expose it to
pull-request builds. Do not confuse publisher/account setup with authorization
to use its credential.

## Catalog assets

`src/img/platform-observability-{overview,trends,details}.png` were copied
unchanged from the parent thread's **prior synthetic CI screenshots**, each
1280×720. Metadata captions identify them as synthetic. They show the baseline
aggregate dashboard, not evidence of the concurrent logs/score/variable UI.
No private Minikube screenshot or `minikube-dashboard-masked.jpg` was used.
Do not reuse these images to claim fresh full-feature release validation.

## Acceptance still requiring parent/maintainer evidence

- Integrated guided metrics, observations/logs, all score types, histogram
  fallback/heatmap, scoped variables and orchestration in real Grafana.
- Clean Compose provisioning plus baseline dashboard and feature E2E on pinned
  minimum/current versions (Docker daemon unavailable in this worker).
- Upstream Grafana plugin-validator evidence on the integrated archive. This
  worker's upstream run exited 1: two relative README catalog links and the
  unregistered `lihorhub` publisher organization block promotion. Archive,
  metadata and screenshots passed; unsigned status is an expected warning.
  README is parent-owned and organization setup is user-managed, so neither
  blocker was changed here. Local validation is not equivalent to that analyzer.
- Exact integrated lockfile/security review, bundle comparison and host security
  assessment; fresh artifact provenance and clean-install verification.
- README/CHANGELOG/shared dashboard wiring and claim reconciliation by parent.
- Real-host smoke only when explicitly supplied local environment/CI credentials;
  worker tests exercise the smoke suite against synthetic HTTP only.
- Publisher organization/account, licensing decision, signing authorization,
  immutable release publication, catalog submission and rollback authority are
  outside this worker's permissions. Apache-2.0 files are preserved, not reselected.
