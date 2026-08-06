# OSS Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the private repository for a trustworthy future open-source
release without publishing it, accepting pull requests prematurely, or making
unverified plugin claims.

**Architecture:** Public project files at the repository root form the user and
community entry point; focused files under `.github/` encode issue intake,
ownership, pull-request expectations, and a deferred GitHub ruleset; maintainer
runbooks under `docs/maintainers/` keep privileged release and Grafana catalog
operations separate from contributor guidance. `AGENTS.md` links durable
repository rules for automated workers without duplicating the domain docs.

**Tech Stack:** Markdown, GitHub Issue Forms YAML, GitHub repository-ruleset
JSON, GitHub CLI, Ruby/Psych YAML validation, `jq`, markdownlint-cli2, and
markdown-link-check.

## Global Constraints

- Keep `lihor-hub/langfuse-grafana-datasource` private.
- Retain Apache License 2.0.
- Welcome issues but state that pull requests are deferred until after the
  first verified release.
- Do not claim that the plugin currently builds, installs, or works.
- Do not publish a tag, GitHub release, package, signed artifact, catalog
  submission, or public repository.
- Do not add unavailable install commands, fake badges, fabricated screenshots,
  real credentials, private hosts, or customer observability data.
- Keep Issues enabled, Wiki and Discussions disabled, and Homepage unset.
- Apply only the approved description and topics to live GitHub metadata.
- Prepare the `main` ruleset as an unapplied template because GitHub currently
  rejects rulesets for this private repository on its plan.
- Do not add dependency automation until a package manifest and runnable checks
  exist.

---

### Task 1: Add the public project, legal, and community foundation

**Files:**

- Create: `README.md`
- Create: `LICENSE`
- Create: `NOTICE`
- Create: `CHANGELOG.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `SUPPORT.md`
- Create: `CODE_OF_CONDUCT.md`

**Interfaces:**

- Produces the canonical public status, licensing, support, security, conduct,
  changelog, and contribution policies linked by later GitHub templates.
- `README.md` is the single source for current product status and intended
  capabilities; release and catalog docs must not contradict it.

- [ ] **Step 1: Establish the red file-presence check**

  Run:

  ```bash
  for file in README.md LICENSE NOTICE CHANGELOG.md CONTRIBUTING.md SECURITY.md SUPPORT.md CODE_OF_CONDUCT.md; do test -f "$file" || exit 1; done
  ```

  Expected: exit 1 because the public project files do not yet exist.

- [ ] **Step 2: Create the public project files**

  Write the following exact policy outcomes:

  - `README.md`: `Pre-release` status; intended Langfuse v4 metrics,
    observations, and scores scope; no install command; frontend-only and
    read-only security boundary; planned Grafana `>=12.3.0` and Langfuse v4
    compatibility; Issues link; PR pause; security link; Apache-2.0;
    non-affiliation notice.
  - `LICENSE`: the unmodified Apache License, Version 2.0, January 2004 text
    from <https://www.apache.org/licenses/LICENSE-2.0.txt>.
  - `NOTICE`: `Copyright 2026 Langfuse Grafana Data Source contributors`,
    Apache-2.0 statement, and Grafana/Langfuse third-party trademark and
    non-endorsement statement.
  - `CHANGELOG.md`: Keep a Changelog header, Semantic Versioning statement, and
    only an `Unreleased` section describing release-preparation documentation.
  - `CONTRIBUTING.md`: issues accepted, security exception routed privately,
    PRs paused until the first verified release, issue quality requirements,
    and the post-release branch/test/docs/changelog workflow marked as future.
  - `SECURITY.md`: latest release support policy, private vulnerability report
    path through GitHub Security Advisories, requested report fields, and an
    explicit prohibition on posting credentials or customer data.
  - `SUPPORT.md`: routing table for bugs, features, vulnerabilities, Grafana
    questions, and Langfuse questions; no promised response SLA.
  - `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1 with scope, enforcement,
    four enforcement levels, attribution, and private Security-tab reporting.

- [ ] **Step 3: Verify the public foundation**

  Run:

  ```bash
  for file in README.md LICENSE NOTICE CHANGELOG.md CONTRIBUTING.md SECURITY.md SUPPORT.md CODE_OF_CONDUCT.md; do test -s "$file" || exit 1; done
  rg -n 'Pre-release|pull requests|Apache License 2.0' README.md CONTRIBUTING.md LICENSE
  rg -n 'secret|credential|private' SECURITY.md
  git diff --check
  ```

  Expected: all files are non-empty, the policies are discoverable, and all
  commands exit 0.

- [ ] **Step 4: Commit the foundation**

  ```bash
  git add README.md LICENSE NOTICE CHANGELOG.md CONTRIBUTING.md SECURITY.md SUPPORT.md CODE_OF_CONDUCT.md
  git commit -m "docs: add OSS project foundation"
  ```

### Task 2: Add issue intake, ownership, repository rules, and agent guidance

**Files:**

- Modify: `AGENTS.md`
- Create: `docs/agents/repository-rules.md`
- Create: `.github/CODEOWNERS`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/rulesets/main.json`
- Create: `docs/maintainers/github-settings.md`

**Interfaces:**

- Issue forms emit reports compatible with the labels and state machine in
  `docs/agents/triage-labels.md`.
- `.github/rulesets/main.json` is an API request body for
  `POST /repos/lihor-hub/langfuse-grafana-datasource/rulesets`; it is inert in
  the repository and must be applied only by an authorized maintainer.
- `CODEOWNERS` supplies the owner used by the ruleset's code-owner requirement.

- [ ] **Step 1: Establish red structured-file checks**

  Run:

  ```bash
  ruby -e 'require "yaml"; %w[bug_report.yml feature_request.yml config.yml].each { |f| YAML.safe_load_file(".github/ISSUE_TEMPLATE/#{f}") }'
  jq -e '.target == "branch" and .enforcement == "active"' .github/rulesets/main.json
  ```

  Expected: failure because the structured GitHub files do not exist.

- [ ] **Step 2: Create issue and pull-request templates**

  The bug form must automatically apply `needs-triage` and require summary,
  versions, deployment type, reproduction steps, expected behavior, actual
  behavior, and a confirmation that logs and screenshots are redacted. The
  feature form must automatically apply `needs-triage` and require problem,
  desired outcome, alternatives, scope confirmation, and optional testing
  interest. Disable blank issues and add Security, Grafana support, and Langfuse
  support contact links. The PR template starts with the pre-`0.1.0` pause and
  includes future scope, test, documentation, changelog, secret-safety, and
  breaking-change checks.

- [ ] **Step 3: Create ownership and the deferred ruleset**

  Add `* @ioachim-hub` to `CODEOWNERS`. Create a ruleset named `Protect main`
  with `target: branch`, `enforcement: active`, an include condition of
  `~DEFAULT_BRANCH`, no bypass actors, and these rules:

  ```json
  [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["squash", "rebase"],
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": true,
        "required_approving_review_count": 1,
        "required_review_thread_resolution": true
      }
    }
  ]
  ```

  Do not call the ruleset creation API.

- [ ] **Step 4: Add repository-wide agent and maintainer rules**

  Link `docs/agents/repository-rules.md` from `AGENTS.md`. Define the approved
  read-only boundary, secrets and synthetic-data policy, evidence-based public
  claims, compatibility/dependency discipline, docs/changelog requirements,
  issue workflow, contribution pause, and privileged-action authorization.
  Document the live and desired GitHub settings, why the ruleset is deferred,
  the exact read/apply/verify commands, the need to review emergency access,
  and the later required-check categories in
  `docs/maintainers/github-settings.md`.

- [ ] **Step 5: Validate structured files and internal ownership**

  Run:

  ```bash
  ruby -e 'require "yaml"; %w[bug_report.yml feature_request.yml config.yml].each { |f| data = YAML.safe_load_file(".github/ISSUE_TEMPLATE/#{f}"); raise f unless data.is_a?(Hash) }'
  jq -e '.name == "Protect main" and .conditions.ref_name.include[0] == "~DEFAULT_BRANCH" and ([.rules[].type] | index("pull_request") != null)' .github/rulesets/main.json
  rg -n '@ioachim-hub' .github/CODEOWNERS
  git diff --check
  ```

  Expected: every command exits 0.

- [ ] **Step 6: Commit repository rules**

  ```bash
  git add AGENTS.md docs/agents/repository-rules.md .github docs/maintainers/github-settings.md
  git commit -m "chore: add repository governance rules"
  ```

### Task 3: Add release and Grafana catalog launch runbooks

**Files:**

- Create: `docs/maintainers/releasing.md`
- Create: `docs/maintainers/grafana-catalog-launch.md`
- Modify: `README.md`

**Interfaces:**

- The release runbook consumes future repository-native commands but marks each
  command name as discover-before-use until the implementation exists.
- The catalog runbook consumes the future `plugin.json`, release ZIP,
  checksums, provenance, test environment, sample dashboard, and screenshots.
- README links to both documents without suggesting that a release exists.

- [ ] **Step 1: Establish the red documentation-link check**

  Run:

  ```bash
  test -s docs/maintainers/releasing.md && test -s docs/maintainers/grafana-catalog-launch.md
  ```

  Expected: exit 1 because the runbooks do not yet exist.

- [ ] **Step 2: Write the release runbook**

  Add explicit stop/go gates for scope, clean source, version consistency,
  native lint/type/unit/build/validator/E2E commands, supported-version matrix,
  dependency and license review, secret scan, package-content inspection,
  versioned ZIP plus SHA1/SHA256, provenance, clean-environment installation,
  draft release review, visibility decision, security/rules activation, release
  publication, catalog submission, rollback, and post-`0.1.0` contribution
  opening. Mark tag push, visibility, release publication, signing credential,
  and catalog submission as explicit human-authorization operations.

- [ ] **Step 3: Write the Grafana catalog strategy**

  Include the catalog positioning statement, `plugin.json` description and
  keyword brief, logo constraints, a five-shot synthetic screenshot plan,
  README/changelog requirements, package and test-environment checklist,
  current My Plugins submission fields, first-submission signing caveat,
  review-response policy, post-approval catalog-link update, Grafana Community
  Forum launch outline, maintenance cadence, and privacy-preserving success
  measures. Link only current official Grafana Plugin Tools documentation.

- [ ] **Step 4: Link maintainer documentation from README**

  Add a `Maintainers` section that identifies both runbooks as preparation
  material and keeps release execution separate from ordinary contribution.

- [ ] **Step 5: Validate Markdown style and links**

  Run:

  ```bash
  npx --yes markdownlint-cli2@0.18.1 '**/*.md' '#docs/superpowers/plans/**' '#docs/superpowers/specs/**'
  npx --yes markdown-link-check@3.13.7 README.md docs/maintainers/releasing.md docs/maintainers/grafana-catalog-launch.md
  git diff --check
  ```

  Expected: all commands exit 0. If an external official URL is temporarily
  unavailable but confirmed correct, record that fact rather than weakening the
  link check globally.

- [ ] **Step 6: Commit maintainer runbooks**

  ```bash
  git add README.md docs/maintainers/releasing.md docs/maintainers/grafana-catalog-launch.md
  git commit -m "docs: add release and Grafana catalog playbooks"
  ```

### Task 4: Apply safe GitHub metadata and verify release readiness

**Files:**

- Modify only if verification finds defects in files created by Tasks 1-3.

**Interfaces:**

- Produces live GitHub description and topics matching
  `docs/maintainers/github-settings.md` while preserving private visibility and
  existing feature settings.

- [ ] **Step 1: Capture live settings before mutation**

  Run:

  ```bash
  gh repo view lihor-hub/langfuse-grafana-datasource --json description,visibility,homepageUrl,repositoryTopics,hasIssuesEnabled,hasWikiEnabled,hasDiscussionsEnabled
  ```

  Expected: visibility is `PRIVATE`; record the remaining values in command
  output for comparison.

- [ ] **Step 2: Apply only approved metadata**

  Run:

  ```bash
  gh repo edit lihor-hub/langfuse-grafana-datasource \
    --description "Grafana data source plugin for exploring Langfuse observability data."
  gh repo edit lihor-hub/langfuse-grafana-datasource \
    --add-topic grafana \
    --add-topic grafana-datasource \
    --add-topic grafana-plugin \
    --add-topic langfuse \
    --add-topic observability \
    --add-topic monitoring \
    --add-topic typescript
  ```

  Do not pass `--visibility`, `--homepage`, or any feature toggle.

- [ ] **Step 3: Verify live settings and ruleset deferral**

  Run:

  ```bash
  gh repo view lihor-hub/langfuse-grafana-datasource --json description,visibility,homepageUrl,repositoryTopics,hasIssuesEnabled,hasWikiEnabled,hasDiscussionsEnabled
  gh api repos/lihor-hub/langfuse-grafana-datasource/rulesets
  ```

  Expected: description and seven topics match, visibility remains `PRIVATE`,
  homepage remains empty, Issues remain enabled, Wiki and Discussions remain
  disabled, and rulesets still return the documented plan-related HTTP 403.

- [ ] **Step 4: Run the complete local verification suite**

  Run:

  ```bash
  ruby -e 'require "yaml"; Dir[".github/ISSUE_TEMPLATE/*.yml"].each { |f| YAML.safe_load_file(f) }'
  jq empty .github/rulesets/main.json
  npx --yes markdownlint-cli2@0.18.1 '**/*.md' '#docs/superpowers/plans/**' '#docs/superpowers/specs/**'
  npx --yes markdown-link-check@3.13.7 README.md CONTRIBUTING.md SECURITY.md SUPPORT.md docs/maintainers/github-settings.md docs/maintainers/releasing.md docs/maintainers/grafana-catalog-launch.md
  rg -n -i '(sk-[a-z0-9_-]{16,}|pk-lf-[a-z0-9_-]{8,}|sk-lf-[a-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{20,})' --glob '!docs/superpowers/**' . && exit 1 || true
  git diff --check
  git status --short
  ```

  Expected: structured files parse, Markdown and links pass, no secret-like
  value is found, no whitespace error exists, and the worktree is clean after
  the task commits.

- [ ] **Step 5: Review commit history and final scope**

  Run:

  ```bash
  git log --oneline -5
  git diff HEAD~3..HEAD --stat
  ```

  Expected: three focused implementation commits after the design and plan
  commits, containing only OSS-readiness files and the approved metadata having
  been applied externally.

