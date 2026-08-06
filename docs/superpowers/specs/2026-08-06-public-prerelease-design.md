# Public Pre-release Design

**Status:** Approved in conversation on 2026-08-06

## Context

The repository has an approved product design and implementation plan plus a
local OSS-readiness branch. It does not have a plugin implementation, package,
build artifact, Docker test environment, tag, or release. The next milestone is
therefore a public **pre-release repository**, not the first plugin release.

The user has explicitly authorized making
`lihor-hub/langfuse-grafana-datasource` public after the readiness gate in this
design passes. Publication must stop if any gate fails.

## Goals

- Validate the repository in an Ubuntu environment independent from the local
  macOS checkout.
- Make repository-readiness checks reproducible locally and in GitHub Actions.
- Merge and push the existing OSS policies, repository rules, and release
  runbooks before publication.
- Audit everything that becomes public, including reachable Git history and
  existing GitHub Actions logs.
- Make the repository public while keeping its status explicitly pre-release.
- Enable the public-repository security features available on the current plan.
- Activate `main` protection with a required readiness check, fast-forward-only
  updates, linear history, deletion protection, and pull-request-only changes.
- Let the sole repository administrator bypass the approval count only through
  a pull request, without allowing direct pushes to `main`.
- Verify the public experience without creating a plugin tag or release.

## Non-goals

- Implementing the Grafana plugin.
- Providing a runnable Grafana or Langfuse Docker environment.
- Publishing `0.1.0`, a GitHub release, plugin ZIP, signature, or Grafana
  catalog submission.
- Claiming that the plugin builds, installs, connects, or supports a production
  environment.
- Opening external pull requests before the first verified plugin release.
- Adding a Dev Container solely for documentation validation.
- Changing the repository Homepage or enabling Discussions or Wiki.

## Considered approaches

### Gated public pre-release

Add locked repository-validation tooling and a read-only Ubuntu workflow, prove
it on the branch and `main`, audit public exposure, publish, enable security and
protection, and verify anonymously. This is the selected approach because it
provides cross-environment evidence without pretending a plugin exists.

### Publish before hardening

Make the repository public and add automation afterward. This is faster but
briefly exposes an unvalidated, unprotected repository and makes private Actions
history public before it has been reviewed.

### Add a Dev Container

Provide a local container as well as CI. This is unnecessary for platform-neutral
Markdown, YAML, JSON, license, link, and history checks. A developer container
belongs with the future plugin implementation and its Grafana environment.

## Validation tooling

The repository will add a minimal Node.js tooling package before the plugin
scaffold exists:

- `package.json` is private, uses version `0.0.0`, requires Node.js 22, and
  exposes focused repository-check scripts. It must not be publishable to npm.
- `package-lock.json` locks validation dependencies and their integrity hashes.
- `.nvmrc` contains Node.js major version `22`.
- `scripts/validate-repository.mjs` performs repository-specific structural and
  policy checks without mutating files or GitHub state.

The plugin scaffold will later extend this package rather than create a second
tooling root.

The validator checks:

- required OSS, GitHub, agent, and maintainer files exist and are non-empty;
- `LICENSE` is the unmodified Apache License 2.0 text using a committed expected
  digest;
- Issue Forms and their configuration parse as YAML and contain the required
  fields, types, unique IDs, labels, redaction confirmation, and security link;
- the prepared ruleset has the exact target, protections, merge methods,
  required status check, and administrator pull-request-only bypass;
- Markdown files contain no unfinished placeholders or false release claims;
- the current tree contains no recognized credential pattern;
- every reachable text blob in Git history is scanned for credential patterns;
  a finding prints only its rule, commit or blob identifier, and path, never the
  candidate secret; and
- files have no trailing whitespace or malformed local references covered by
  the repository-specific checks.

Markdown style and HTTP/local link validation remain separate locked commands
so their output is easy to diagnose. The narrow link-check exceptions for this
private repository's Issues, Security, and comparison pages stay in place only
until visibility changes.

## Ubuntu GitHub Actions workflow

`.github/workflows/repository-readiness.yml` will:

- run on pushes, pull requests, and manual dispatch;
- use a unique workflow and job name, `Repository readiness`, which becomes the
  ruleset's required status-check context;
- run on a fixed supported Ubuntu runner rather than a moving local
  environment;
- set top-level permissions to `contents: read`;
- check out complete history with credentials persistence disabled;
- set up Node.js 22 with npm caching;
- install only the lockfile with `npm ci`; and
- run the structural validator, Markdown lint, and link checks.

Every referenced GitHub Action must be pinned to a full commit SHA verified as
belonging to the official action repository. A release tag may be included only
as a human-readable comment. No workflow step receives a repository secret,
write permission, pull-request write permission, or publishing credential.

The workflow's full-history checkout is intentional because a private commit
that remains reachable will become public with the repository.

## Ruleset design

`.github/rulesets/main.json` remains an auditable API request body. Before
publication it will be extended with:

- a `required_status_checks` rule requiring the exact `Repository readiness`
  context with the branch required to be current;
- a `RepositoryRole` administrator bypass actor using `pull_request` mode; and
- the existing deletion, non-fast-forward, linear-history, pull-request,
  code-owner, last-push approval, stale-review, conversation-resolution,
  squash, and rebase rules.

Administrator bypass is limited to pull requests. It prevents a sole-maintainer
approval deadlock but does not permit the administrator to push directly to
`main`, force-push, or bypass the workflow by skipping a pull request.

The implementation must verify the current GitHub REST schema and repository
role identifier from official GitHub documentation before applying the request.
The JSON template must pass local semantic checks before visibility changes.

Automatic deletion of merged head branches remains enabled as a separate
repository setting.

## Integration sequence

### 1. Prove the branch privately

1. Implement and run every check locally.
2. Audit the branch diff and commit it.
3. Push `codex/oss-release-readiness` to the private remote.
4. Run the Ubuntu workflow on that branch and require a successful conclusion.
5. Create a maintainer pull request to `main`, recording the pre-release scope
   and verification evidence.

The repository's temporary external-contribution pause does not prohibit a
maintainer integration pull request.

### 2. Prove `main` privately

1. Merge the maintainer pull request without changing repository visibility.
2. Wait for the `Repository readiness` workflow on the resulting `main` commit.
3. Confirm the remote `main` SHA equals the reviewed merge result.
4. Stop if the workflow is absent, cancelled, skipped, or unsuccessful.

### 3. Audit public exposure

Before changing visibility, review:

- all reachable commits, trees, and text blobs for credentials, private hosts,
  personal information, and customer data;
- every local and remote branch and tag;
- open and closed issues and pull requests, including comments and attachments;
- GitHub releases, packages, deployments, environments, Pages, Wiki, and
  Discussions state;
- GitHub Actions workflow runs, logs, artifacts, caches, and visible workflow
  references;
- repository description, topics, Homepage, collaborators, deploy keys,
  webhooks, and installed applications at the metadata level; and
- the anonymously visible README, license, support, security, contribution,
  and conduct content that will form the public landing experience.

Secret values are never requested or printed during this audit. A discovered
credential is rotated before any further publication work.

### 4. Publish and protect

After the private branch and `main` checks and exposure audit pass:

1. Change visibility from private to public.
2. Immediately create and verify the active `Protect main` ruleset.
3. Enable private vulnerability reporting.
4. Enable secret scanning and push protection when the public repository and
   current account expose those controls.
5. Confirm Issues and automatic merged-branch deletion remain enabled, while
   Wiki, Discussions, and Homepage remain disabled or empty.

If ruleset creation fails after publication, stop other changes, report the
unprotected state immediately, and use the closest safe GitHub-supported
protection only with explicit maintainer approval. Do not silently weaken the
rules.

### 5. Verify publicly

1. Dispatch `Repository readiness` on the public default branch and require a
   successful conclusion.
2. Open the repository, README, `LICENSE`, issue chooser, and Security page
   without authentication.
3. Confirm the repository visibly says `Pre-release` and exposes no plugin
   installation or release artifact.
4. Remove the temporary private-link exceptions through a protected maintainer
   pull request, rerun the link check, and merge through the administrator
   pull-request-only bypass.
5. Verify the merged branch is deleted automatically.
6. Confirm ruleset insights or a test pull request show that direct pushes,
   force pushes, branch deletion, merge commits, and failing readiness checks
   are blocked.

No destructive protection test will be performed against `main`; enforcement
is verified through effective-rule APIs, ruleset insights, and recoverable test
pull-request behavior.

## Failure handling

- A local or Ubuntu validation failure keeps the repository private.
- A history, issue, log, or artifact concern keeps the repository private until
  it is removed or redacted and any exposed credential is rotated.
- A failed private `main` run blocks publication even when the branch run
  passed.
- A visibility API failure leaves the repository private and is reported.
- A security-feature setting unavailable on the current plan is recorded
  accurately; unavailable optional controls do not justify false claims.
- A protection failure after publication is an urgent incomplete state and
  stops all non-protection work.
- Published history, tags, and artifacts are never rewritten or deleted without
  a separate explicit destructive-action decision.

## Success criteria

The public pre-release is complete only when:

- the locked local repository checks pass;
- Ubuntu `Repository readiness` passes on the integration branch and private
  `main`;
- the public-exposure audit finds no unresolved sensitive content;
- the GitHub repository reports `PUBLIC` visibility;
- anonymous users can read the README and license and open the issue chooser;
- the README clearly says that no supported plugin artifact exists;
- private vulnerability reporting is available;
- secret scanning and push protection are enabled when supported;
- `Protect main` is active with the readiness status check, administrator
  pull-request-only bypass, non-fast-forward protection, linear history,
  deletion protection, and pull-request requirements;
- automatic deletion of merged head branches remains enabled;
- the public default-branch workflow passes; and
- no tag, GitHub release, plugin archive, signature, or catalog submission was
  created.
