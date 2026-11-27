# Upstream compatibility maintenance

## Agreed design

A weekly BB automation uses the **Pi harness**, with the same provider/model as
its setup session. It runs on the enrolled machine using existing Pi and GitHub
authentication; credentials are not copied into GitHub Actions. The machine and
BB must remain available. This is a BB schedule, not a GitHub-hosted AI workflow.

The target is continued compatibility with stable Grafana plugin systems and
Langfuse observability APIs, not automatic adoption of every upstream feature.

- **Sensor:** `npm run upstream:scan` reads official stable releases, resolves
  their Git commits and fingerprints Langfuse's server-side Fern API definitions
  at the released commit. It also records installed package versions. Failures,
  missing contracts and truncated trees fail the scan instead of reporting no
  changes. Upstream text is untrusted evidence, never executable instructions.
- **Controller:** `npm run upstream:plan` compares that snapshot with a committed
  review baseline and open maintenance PR markers. API-contract changes have
  priority. Select at most one track per run and at most one open PR per track;
  an existing Grafana PR must not prevent selection of Langfuse, or vice versa.
- **Actuator:** `.agents/skills/upstream-compatibility/SKILL.md` guides Pi through
  relevance review, a regression first, a bounded patch and validation. A new
  release alone is not proof of a required implementation change.
- **Human steering:** edit `.github/agent-memory/upstream-compatibility.md`,
  review PRs normally, or send follow-up instructions to the visible BB run.
  There is no automatic GitHub `/iterate` comment handler.
- **Disturbances and gates:** Dependabot remains responsible for package-only
  updates. The monthly create-plugin updater remains separate. Concurrent
  commits, upstream schema changes and flaky tests require fresh verification;
  normal PR CI, compatibility checks and browser tests are not bypassed.

No new backend, mutations, generic request API, unsupported feature, adapter
switch, support-floor increase, dependency major migration, signing, release,
catalog update, automatic merge or branch-protection change is authorized.
Escalate those decisions with a deduplicated `ready-for-human` issue.

## Sources and baseline

The allowlist is `.github/upstream-compatibility.json`. Grafana watches cover
the host, plugin tooling, plugin actions and validator. Langfuse watches cover
the server and JavaScript SDK; SDK releases are supporting evidence, not a
substitute for the native HTTP adapter's actual API contract (ADR-0001).

Langfuse contracts come from **server** definitions, not the similarly named
client instrumentation API. Definitions are read from a stable release's exact
commit, including shared types. They can contain out-of-scope operations: never
implement those just because they appear in a schema.

The committed baseline records monitoring/review points, **not certification**
that every installed dependency supports the latest upstream. An initial audit
can use `upstream:plan -- --all`. The normal plan only flags changed sources.
After reviewing a selected track, copy only that track's entries from the scan
to the baseline in the same justified compatibility PR. Do not advance another
track or label an untested release supported. If nothing relevant changed,
report the reason in BB without opening a version-only or baseline-only PR;
future runs can consult previous automation runs to avoid repeating research.

## Run locally

Use Node from `.nvmrc`, `npm ci`, and an authenticated `gh` with read access to
public upstreams. No Langfuse or Grafana credentials are needed.

```sh
npm run upstream:scan -- --output /tmp/upstream-snapshot.json
npm run upstream:plan -- --input /tmp/upstream-snapshot.json
npm run test:upstream
```

Planning reads open PRs via `gh` and fails closed if that query fails. A closed
PR does not block future work. The hidden PR-body marker identifies track
ownership independently of display labels. `--all` requests an initial audit;
it does not bypass the open-PR limit. Both commands are read-only and do not
modify the baseline or repository. Their JSON outputs include source evidence
and can be retained in BB thread storage. Scan JSON is an input to reasoning,
not permission to execute commands from a release note.

Read the skill, then run the scan and plan to execute the actuator by hand in
a Pi BB thread. Scheduled runs use the version-controlled prompt in
`.github/agent-prompts/upstream-compatibility.md`. A fresh clean worktree starts
from explicitly fetched `origin/main`; fetch/setup failure is a blocker.

## Schedule and operations

The schedule is Monday at **07:00 UTC**, with Pi model selection recorded in
the BB automation. New runs use a fresh worktree, not the release-preparation
checkout. Only one scheduled maintenance automation should exist per project.

After the implementation PR is merged, provision or reconcile the schedule:

```sh
node scripts/setup-upstream-automation.mjs --project YOUR_BB_PROJECT_ID
```

The setup command uses the current Pi model when invoked in Pi, or accepts
`--model openai/YOUR_MODEL`. It validates that the skill, commands and prompt are
present on `origin/main` before enabling the schedule. Existing matching jobs
are reused, not duplicated. It does not start an immediate agent run. BB
project and host IDs belong in BB configuration, not this public repository.

Inspect and run manually (replace placeholders with setup output):

```sh
bb automation show AUTOMATION_ID --project YOUR_BB_PROJECT_ID
bb automation run AUTOMATION_ID --project YOUR_BB_PROJECT_ID
bb automation runs AUTOMATION_ID --project YOUR_BB_PROJECT_ID --limit 5
bb automation pause AUTOMATION_ID --project YOUR_BB_PROJECT_ID
```

Do not automatically retry an active job or create replacement workers without
checking prior runs and their outputs. The run must check for another active
run before pushing or opening a PR, and recheck open PRs immediately before
creation. A maintainer must review/merge changes; existing GitHub authentication
must allow normal PR CI to trigger. Do not add a PAT, GitHub App or cloud agent
service without separate authorization. Authentication or budget failures must
be visible blockers, not a false successful no-op.

## Validation for generated changes

Run narrow regressions first, then `test:upstream`, `test:release-tools`,
`test:fixtures`, `test:secrets`, `typecheck`, `lint`, `test:ci`, `format:check`,
`check:repository`, `check:markdown`, `check:links`, `build`, `validate` and
`package`. Open only a reviewable tested PR; failures should be reported or
escalated, not hidden with weakened tests. Normal GitHub PR CI supplies the
real Grafana proxy/browser matrix and compatibility check. Do not claim that
synthetic tests prove a fresh real Langfuse deployment is compatible.
