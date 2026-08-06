# Public Pre-release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a safely governed, documentation-only GitHub pre-release with
reproducible Ubuntu validation, without producing a plugin artifact.

**Architecture:** A locked Node 22 tooling package runs a repository-specific
validator plus Markdown and link tools locally and in GitHub Actions. A
read-only Ubuntu workflow supplies the `Repository readiness` status context;
after it passes on `main`, GitHub metadata, public visibility, security
settings, and the prepared branch ruleset are activated in that order.

**Tech Stack:** Node.js 22, npm lockfile, ECMAScript modules, `yaml`,
markdownlint-cli2, markdown-link-check, GitHub Actions Ubuntu 24.04, GitHub
CLI, GitHub REST API, and `jq`.

## Global Constraints

- The result is a public pre-release repository, not a plugin release.
- Do not create a version tag, GitHub release, plugin ZIP, signature, or Grafana
  catalog submission.
- Keep the README explicit that no supported plugin artifact exists.
- Keep Wiki and Discussions disabled and Homepage unset.
- Keep automatic deletion of merged head branches enabled.
- Use Node.js 22 and a locked npm dependency graph.
- Pin every GitHub Action to an official full commit SHA.
- Workflow permissions are `contents: read`; it receives no secrets or write
  permission.
- The workflow job/status-check name is exactly `Repository readiness`.
- Require the `Repository readiness` check on `main` after publication.
- Block direct, force, non-linear, and merge-commit changes to `main`.
- Permit repository administrators to bypass approval only through a pull
  request; do not permit a direct-push bypass.
- Stop publication if audits or validation fail.
- Never print a candidate secret discovered in the current tree or history.

---

### Task 1: Build deterministic local repository validation

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `.nvmrc`
- Create: `scripts/validate-repository.mjs`
- Create: `scripts/check-repository-history.mjs`
- Modify: `.markdown-link-check.json`

**Interfaces:**

- `npm run check:repository` runs file, license, Issue Form, ruleset, claim,
  current-tree secret, and history checks; it writes only diagnostics without
  candidate secret values.
- `npm run check:markdown` invokes markdownlint-cli2 for all Markdown except
  historical Superpowers specifications and plans.
- `npm run check:links` invokes markdown-link-check with the repository config.
- `npm run check` runs all three scripts in sequence.

- [ ] **Step 1: Establish the red local-tooling check**

  Run:

  ```bash
  test -f package.json && npm run check
  ```

  Expected: exit 1 because the Node tooling package and checks do not exist.

- [ ] **Step 2: Create the locked Node 22 tooling package**

  Add `package.json` with `private: true`, version `0.0.0`,
  `engines.node: ">=22 <23"`, and exact devDependencies
  `markdown-link-check@3.15.0`, `markdownlint-cli2@0.23.2`, and `yaml@2.9.0`.
  Define these scripts exactly:

  ```json
  {
    "check:repository": "node scripts/validate-repository.mjs",
    "check:markdown": "markdownlint-cli2 '**/*.md' '#node_modules/**' '#docs/superpowers/plans/**' '#docs/superpowers/specs/**'",
    "check:links": "markdown-link-check --config .markdown-link-check.json README.md CONTRIBUTING.md SECURITY.md SUPPORT.md CODE_OF_CONDUCT.md CHANGELOG.md AGENTS.md docs/agents/domain.md docs/agents/issue-tracker.md docs/agents/triage-labels.md docs/agents/repository-rules.md docs/maintainers/github-settings.md docs/maintainers/releasing.md docs/maintainers/grafana-catalog-launch.md",
    "check": "npm run check:repository && npm run check:markdown && npm run check:links"
  }
  ```

  Set `.nvmrc` to `22`, run `npm install --package-lock-only`, and commit the
  resulting lockfile without installing a `node_modules` directory into Git.

- [ ] **Step 3: Write the repository validator**

  `scripts/validate-repository.mjs` must use `node:assert/strict`,
  `node:child_process`, `node:crypto`, `node:fs/promises`, `node:path`, and
  `yaml`. It must:

  - assert all required files exist and are non-empty;
  - compare the SHA-256 of `LICENSE` to the committed Apache-2.0 digest;
  - parse `bug_report.yml`, `feature_request.yml`, and `config.yml`, asserting
    top-level names/descriptions, unique IDs, supported types, two required
    `needs-triage` labels, redaction confirmations, `blank_issues_enabled:
    false`, and three contact links;
  - parse `.github/rulesets/main.json`, asserting the `main` target,
    `~DEFAULT_BRANCH`, administrator `pull_request` bypass, deletion,
    non-fast-forward, linear history, required status check, and pull-request
    requirements;
  - scan designated public files for `TBD`, `TODO`, and `PLACEHOLDER`;
  - scan tracked current-tree text files using credential regular expressions;
    and
  - invoke `scripts/check-repository-history.mjs`.

  Diagnostics must name a file, rule, blob, or commit but must not include a
  matched line or match content.

- [ ] **Step 4: Write the history scanner and validate its red/green behavior**

  Implement `scripts/check-repository-history.mjs` with `git rev-list --objects
  --all`, `git cat-file --batch`, UTF-8 binary detection, and the same
  credential regular expressions. It emits only object ID and path for a match.
  Use a temporary untracked text file containing a test value constructed from
  the `sk-lf-` prefix and sixteen test characters to show that the current-tree
  scanner fails without printing the value; delete the temporary file; then run `npm run
  check:repository` and expect exit 0.

- [ ] **Step 5: Remove only the private URL link-check exceptions after public
  visibility**

  Keep the current private Issues/Security/comparison exclusions during private
  CI. Add a documented `npm run check:links:public` script that runs the same
  files with `.markdown-link-check.public.json`, which has no ignore patterns.
  Do not remove the private configuration until a public workflow run has
  validated the live links.

- [ ] **Step 6: Verify and commit the tooling**

  Run:

  ```bash
  npm ci
  npm run check
  git diff --check
  ```

  Expected: every command exits 0. Commit with:

  ```bash
  git add package.json package-lock.json .nvmrc scripts .markdown-link-check.json .markdown-link-check.public.json
  git commit -m "ci: add repository readiness checks"
  ```

### Task 2: Add Ubuntu CI and complete the protected-branch payload

**Files:**

- Create: `.github/workflows/repository-readiness.yml`
- Modify: `.github/rulesets/main.json`
- Modify: `docs/maintainers/github-settings.md`
- Modify: `docs/maintainers/releasing.md`
- Modify: `README.md`

**Interfaces:**

- The workflow's job `name: Repository readiness` creates the exact status
  context consumed by `.github/rulesets/main.json`.
- The ruleset API request contains a `required_status_checks` rule that requires
  this context and a repository-administrator `pull_request` bypass actor.

- [ ] **Step 1: Establish the red workflow/ruleset consistency check**

  Run:

  ```bash
  test -f .github/workflows/repository-readiness.yml && node scripts/validate-repository.mjs
  ```

  Expected: failure because the workflow is missing.

- [ ] **Step 2: Create the locked read-only workflow**

  Create `.github/workflows/repository-readiness.yml` with workflow name
  `Repository readiness`, events `push`, `pull_request`, and
  `workflow_dispatch`, top-level `permissions: { contents: read }`, and one
  `ubuntu-24.04` job named `Repository readiness`.

  The job uses these verified official action commits:

  ```yaml
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
    with:
      fetch-depth: 0
      persist-credentials: false
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
    with:
      node-version-file: .nvmrc
      cache: npm
  ```

  Then run `npm ci` and `npm run check`. No secrets, token interpolation, or
  write-capable permission may be present.

- [ ] **Step 3: Update ruleset and docs**

  Confirm that `.github/rulesets/main.json` contains the status-check and
  bypass entries added in Task 1:

  ```json
  {
    "actor_id": 5,
    "actor_type": "RepositoryRole",
    "bypass_mode": "pull_request"
  }
  ```

  as its only bypass actor. Add the required status-check rule:

  ```json
  {
    "type": "required_status_checks",
    "parameters": {
      "do_not_enforce_on_create": false,
      "required_status_checks": [{ "context": "Repository readiness" }],
      "strict_required_status_checks_policy": true
    }
  }
  ```

  Confirm against the current GitHub REST response schema before publication;
  if GitHub requires a different parameter key, update the template and
  validator together. Document why `pull_request` bypass preserves the
  no-direct-push rule and that the required check name is stable. Add the CI
  pre-release badge to README only after the workflow has passed on `main`.

- [ ] **Step 4: Verify workflow and ruleset semantics**

  Run:

  ```bash
  ruby -e 'require "yaml"; data = YAML.safe_load(File.read(".github/workflows/repository-readiness.yml"), aliases: false); raise unless data.is_a?(Hash)'
  node scripts/validate-repository.mjs
  npm run check
  git diff --check
  ```

  Expected: all commands exit 0.

- [ ] **Step 5: Commit CI and protection preparation**

  ```bash
  git add .github/workflows/repository-readiness.yml .github/rulesets/main.json docs/maintainers/github-settings.md docs/maintainers/releasing.md README.md scripts/validate-repository.mjs
  git commit -m "ci: validate public pre-release readiness"
  ```

### Task 3: Prove the private branch and integrate it to `main`

**Files:**

- No source-file changes unless a failed local or Ubuntu check identifies a
  defect; make each repair in a focused follow-up commit.

**Interfaces:**

- Remote workflow run for `codex/oss-release-readiness` provides the evidence
  required to open a maintainer integration pull request.
- The workflow run on the merged `main` SHA provides the required status-check
  history before the ruleset is activated.

- [ ] **Step 1: Verify the local commit set before push**

  Run:

  ```bash
  npm run check
  git diff --check
  test -z "$(git status --short)"
  git log --oneline main..HEAD
  ```

  Expected: checks pass, the worktree is clean, and the displayed commits are
  only approved OSS-readiness and pre-release infrastructure changes.

- [ ] **Step 2: Push the private branch and wait for Ubuntu validation**

  Run:

  ```bash
  git push -u origin codex/oss-release-readiness
  gh run watch --repo lihor-hub/langfuse-grafana-datasource --exit-status
  ```

  Expected: the `Repository readiness` run for the branch succeeds. Stop if it
  fails, is cancelled, or receives permissions beyond `contents: read`.

- [ ] **Step 3: Create the maintainer integration pull request**

  Create a pull request from `codex/oss-release-readiness` to `main` with a
  title `chore: prepare public pre-release` and body that states: documentation
  pre-release only; no plugin artifact; Ubuntu check passed; public visibility
  will be changed only after merge and an exposure audit. Do not publish or tag
  anything in this step.

- [ ] **Step 4: Merge and prove `main` privately**

  Merge the maintainer pull request using a permitted linear method. Fetch
  `origin/main`, verify it contains the approved merge SHA, then wait for the
  exact `Repository readiness` run on `main` to succeed:

  ```bash
  git fetch origin main
  gh run list --repo lihor-hub/langfuse-grafana-datasource --branch main --workflow repository-readiness.yml --limit 1
  ```

  Stop if the remote `main` run does not succeed.

### Task 4: Audit and publish the public pre-release

**Files:**

- Modify after public verification: `.markdown-link-check.json`
- Delete after public verification: `.markdown-link-check.public.json`

**Interfaces:**

- The public repository's active `Protect main` ruleset uses the status context
  already emitted by Task 2.
- The public link-check configuration contains no ignored private repository
  URLs.

- [ ] **Step 1: Audit every public surface before changing visibility**

  Run and inspect:

  ```bash
  node scripts/check-repository-history.mjs
  git branch -a
  git tag --list
  gh issue list --repo lihor-hub/langfuse-grafana-datasource --state all --limit 100
  gh pr list --repo lihor-hub/langfuse-grafana-datasource --state all --limit 100
  gh release list --repo lihor-hub/langfuse-grafana-datasource --limit 100
  gh run list --repo lihor-hub/langfuse-grafana-datasource --limit 100
  gh api repos/lihor-hub/langfuse-grafana-datasource --jq '{visibility,homepage,has_issues,has_wiki,has_discussions,has_pages,has_projects,security_and_analysis}'
  ```

  Expected: no secret finding, no tags/releases, no unreviewed public data, and
  settings match the approved pre-release scope. Stop and report any exception.

- [ ] **Step 2: Make the audited repository public**

  Run only after Step 1 and the private `main` workflow pass:

  ```bash
  gh repo edit lihor-hub/langfuse-grafana-datasource --visibility public
  gh repo view lihor-hub/langfuse-grafana-datasource --json visibility,url
  ```

  Expected: `visibility` equals `PUBLIC`. Do not create a tag or release.

- [ ] **Step 3: Enable security features and apply the ruleset**

  Enable private vulnerability reporting and secret scanning plus push protection
  when GitHub reports they are available. Create the ruleset:

  ```bash
  gh api --method POST repos/lihor-hub/langfuse-grafana-datasource/rulesets --input .github/rulesets/main.json
  ```

  Capture the returned ID, retrieve the ruleset, and assert its target,
  enforcement, bypass mode, required status context, deletion, non-fast-forward,
  linear-history, and pull-request rules. Stop and report immediately if
  creation fails; do not weaken the policy as a fallback.

- [ ] **Step 4: Verify anonymous public content and protection state**

  Use unauthenticated `curl -I` requests for the repository root, `README.md`,
  `LICENSE`, issue chooser, and Security page. Dispatch `Repository readiness`
  on `main` and require success. Confirm the public README says `Pre-release`
  and contains no installation command or release artifact.

- [ ] **Step 5: Remove private-link exceptions through a protected PR**

  Replace `.markdown-link-check.json` with the no-ignore public configuration,
  remove `.markdown-link-check.public.json`, run `npm run check`, open a
  maintainer pull request, and merge it using the administrator's
  pull-request-only bypass. Confirm GitHub automatically deletes that merged
  head branch.

- [ ] **Step 6: Final verification and handoff**

  Run:

  ```bash
  npm run check
  gh repo view lihor-hub/langfuse-grafana-datasource --json visibility,description,homepageUrl,hasIssuesEnabled,hasWikiEnabled,hasDiscussionsEnabled,deleteBranchOnMerge,repositoryTopics
  gh api repos/lihor-hub/langfuse-grafana-datasource/rulesets
  gh run list --repo lihor-hub/langfuse-grafana-datasource --branch main --workflow repository-readiness.yml --limit 1
  ```

  Expected: all checks pass; visibility is `PUBLIC`; the active ruleset requires
  `Repository readiness`; automatic merged-branch deletion is enabled; main CI
  succeeds; Wiki and Discussions remain disabled; Homepage stays empty; and no
  tag, GitHub release, plugin archive, signature, or catalog submission exists.
