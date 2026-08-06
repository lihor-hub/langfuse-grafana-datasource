# OSS Release Readiness Design

**Status:** Approved in conversation on 2026-08-06

## Context

The repository currently contains an approved product design and implementation
plan, but no plugin implementation or public-facing project files. The GitHub
repository is private, has Issues enabled, has no description, homepage, or
topics, and reports Apache-2.0 metadata even though the checkout has no
`LICENSE` file.

The repository must be prepared for a future public release without making it
public yet. Issues will be welcomed when the repository becomes public. Pull
requests will not be accepted until the maintainer has revalidated the plugin
and published the first release.

## Goals

- Make the repository understandable, trustworthy, and usable when it becomes
  public.
- Add repository-wide human and agent rules for security, scope, issue intake,
  changes, and releases.
- Define GitHub repository protection that can be activated when the current
  account supports rulesets for this repository.
- Add standard open-source community health files and Apache-2.0 licensing.
- Apply safe GitHub metadata while leaving visibility private.
- Provide a maintainer release runbook that prevents unverified release claims.
- Define a concrete path to an effective official Grafana plugin catalog page.
- Clearly distinguish planned capabilities from verified, released behavior.

## Non-goals

- Making the GitHub repository public.
- Claiming that the plugin currently builds or works.
- Publishing, signing, tagging, or submitting a plugin release.
- Accepting pull requests before the first verified release.
- Adding application implementation, CI jobs that cannot yet run, or fabricated
  screenshots.
- Enabling telemetry in the plugin.
- Promising Grafana catalog approval, review timing, or featured placement.

## Considered approaches

### Staged OSS readiness

Prepare the complete public surface now, mark it pre-release, accept issue
intake, defer pull requests, and document the transition that follows `0.1.0`.
This is the selected approach because it makes the repository safe to expose
without pretending the planned plugin has been verified.

### Minimal public shell

Add only a README, license, security policy, and issue templates. This is
faster, but would leave release governance, repository protection, and Grafana
catalog preparation to a later high-pressure release step.

### Full community governance immediately

Open contribution workflows, Discussions, and contributor automation before
the first release. This creates processes the maintainer is not ready to
support and invites changes before the implementation has been revalidated.

## Release phases

### Phase 1: private preparation

- Keep the repository private.
- Add all public-facing files with a prominent pre-release status.
- Keep Issues enabled and Discussions disabled.
- Apply a concise GitHub description and relevant search topics.
- Do not set a homepage until an authoritative project or catalog page exists.
- Prepare, but do not apply, the `main` ruleset while GitHub rejects rulesets
  for this private repository on its current plan.
- State that issues will be accepted but pull requests are deferred.

### Phase 2: first public release

- Complete the implementation plan and independently verify installation,
  configuration, query behavior, packaging, and supported Grafana versions.
- Run secret, dependency, license, plugin-validator, and provenance checks.
- Activate repository protection before inviting contributions.
- Make the source repository public only through an explicit maintainer action.
- Enable private vulnerability reporting and repository security features
  available to public repositories.
- Publish the first semantic version and its immutable checksummed artifact.
- Submit the plugin to Grafana for catalog review.

### Phase 3: post-`0.1.0` community contributions

- Replace the temporary pull-request pause with normal contribution guidance.
- Enable and enforce the complete protected-branch workflow.
- Keep Issues as the primary support and feature-intake surface; enable
  Discussions later only if issue traffic justifies a separate forum.

## Public repository content

### Root files

- `README.md` is the public landing page. It states that the project is under
  development, summarizes the intended data source, links to installation only
  when an artifact exists, explains the read-only security boundary, lists
  planned compatibility, and directs users to issues and security reporting.
- `LICENSE` contains the unmodified Apache License 2.0 text.
- `NOTICE` identifies the project copyright holder as the project contributors,
  states the license, and makes clear that Grafana and Langfuse are third-party
  trademarks and that the project is not their official product.
- `CHANGELOG.md` follows Keep a Changelog and Semantic Versioning. It contains
  an `Unreleased` section but no invented release entry.
- `CONTRIBUTING.md` welcomes well-formed issues while explicitly pausing pull
  requests until after the first verified release. It documents the future
  fork/branch/test/PR path so the phase transition is a small edit.
- `SECURITY.md` tells reporters not to open public vulnerability issues and to
  use GitHub private vulnerability reporting after the repository is public.
  It defines support only for the latest released version and lists the secrets
  that must never appear in reports.
- `SUPPORT.md` routes defects and feature requests to issue forms, security
  problems to the private security channel, and general product questions to
  upstream Grafana or Langfuse resources when appropriate.
- `CODE_OF_CONDUCT.md` adopts Contributor Covenant 2.1 and uses GitHub private
  reporting for enforcement reports after publication.

The documents must not include an unavailable installation command, an
unreleased package URL, a fake build badge, or language implying endorsement by
Grafana Labs or Langfuse.

### GitHub community files

- `.github/ISSUE_TEMPLATE/bug_report.yml` collects environment, Grafana and
  Langfuse versions, reproduction steps, expected and actual behavior, logs,
  and an explicit secrets-redaction confirmation.
- `.github/ISSUE_TEMPLATE/feature_request.yml` collects the problem, proposed
  outcome, alternatives, scope fit, and willingness to help test after the
  first release.
- `.github/ISSUE_TEMPLATE/config.yml` disables blank issues and links security
  reports to the repository Security tab.
- `.github/PULL_REQUEST_TEMPLATE.md` explains the temporary pull-request pause
  and contains the future correctness, testing, documentation, changelog, and
  secret-safety checklist.
- `.github/CODEOWNERS` assigns repository-wide ownership to `@ioachim-hub` so
  the future ruleset can require code-owner review.

Dependency automation is deferred until the implementation creates a package
manifest and runnable checks. A configuration that cannot operate yet would
produce noise rather than release confidence.

## Repository-wide rules

`AGENTS.md` remains the short entry point and links to focused rules under
`docs/agents/`. The repository-level rules require agents and contributors to:

- preserve the frontend-only, read-only product boundary from the approved
  design unless an approved specification changes it;
- never commit or quote Langfuse secret keys, public keys paired with secrets,
  Grafana tokens, Access Policy tokens, private hostnames, or captured customer
  observability data;
- use synthetic and clearly fake fixture data;
- keep public claims tied to verification evidence and released artifacts;
- treat compatibility and dependency changes as deliberate, tested changes;
- update user documentation and the changelog with user-visible changes;
- follow the repository's GitHub issue and triage-label conventions;
- avoid publishing, tagging, changing visibility, enabling external services,
  or modifying release credentials without explicit maintainer authorization;
- follow the pre-`0.1.0` contribution pause.

## GitHub metadata and repository settings

The following metadata is safe to apply while the repository stays private:

- Description: `Grafana data source plugin for exploring Langfuse observability data.`
- Topics: `grafana`, `grafana-datasource`, `grafana-plugin`, `langfuse`,
  `observability`, `monitoring`, and `typescript`.
- Issues: enabled.
- Wiki: disabled.
- Discussions: disabled.
- Delete head branches after merge: enabled.
- Homepage: unset until the Grafana catalog page exists.

Visibility must remain `private`. The implementation records the settings in a
maintainer document as well as applying the safe metadata through GitHub.

## Default-branch rules

GitHub currently returns HTTP 403 for repository rulesets because the private
repository's plan does not support them. The repository will therefore contain
an auditable ruleset template and activation instructions, but implementation
must not change visibility or purchase a plan.

The prepared `main` ruleset will:

- target the default branch;
- block branch deletion and non-fast-forward pushes;
- require linear history;
- require changes through pull requests;
- require one approving review;
- dismiss approvals when new commits are pushed;
- require code-owner review;
- require approval from someone other than the last pusher;
- require all review conversations to be resolved; and
- allow squash and rebase merging, but not merge commits.

The repository setting that automatically deletes a pull request's head branch
after merge is enabled separately; it is not part of the ruleset API payload.

No bypass actor is encoded in the template. A maintainer must review GitHub's
displayed rules and available emergency-access policy before activation. Status
checks are added only after CI exists and their exact stable job names are
known; the release runbook requires checks for formatting/linting, type checks,
unit tests, build, plugin validation, and the supported Grafana E2E matrix.

## Release documentation

`docs/maintainers/releasing.md` is a gate-based runbook rather than a calendar.
It covers:

1. confirming that the implementation and compatibility claims are current;
2. validating working-tree cleanliness and version consistency;
3. running lint, type, unit, build, plugin-validator, E2E, dependency, license,
   and secret checks once those commands exist;
4. reviewing the package contents for `README.md`, `CHANGELOG.md`, `LICENSE`,
   `plugin.json`, and the built module;
5. verifying that no secrets or real customer data are present;
6. generating a versioned ZIP, checksums, and build provenance;
7. creating a draft GitHub release and testing its downloaded artifact in a
   clean Grafana environment;
8. explicitly deciding whether to make the repository public;
9. activating repository/security settings;
10. publishing the GitHub release and submitting the catalog form; and
11. opening contributions only after the first release is verified.

Every gate has a stop condition. The runbook never instructs an agent to
publish, change visibility, push a tag, or submit the plugin without explicit
maintainer authorization.

## Grafana catalog launch strategy

The official Grafana catalog is the primary distribution and discovery target.
The strategy follows Grafana's current official guidance:

- [Publishing best practices](https://grafana.com/developers/plugin-tools/publish-a-plugin/publishing-best-practices)
- [Automated plugin builds](https://grafana.com/developers/plugin-tools/publish-a-plugin/build-automation)
- [Packaging](https://grafana.com/developers/plugin-tools/publish-a-plugin/package-a-plugin)
- [Signing](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin)
- [Catalog submission](https://grafana.com/developers/plugin-tools/publish-a-plugin/publish-a-plugin)
- [Test environment guidance](https://grafana.com/developers/plugin-tools/publish-a-plugin/provide-test-environment)
- [`plugin.json` metadata reference](https://grafana.com/developers/plugin-tools/reference/plugin-json)

### Catalog-page positioning

The primary promise is: connect Grafana to Langfuse v4 and explore Langfuse
metrics, observations, and scores without moving credentials into dashboard
queries or browser-side plugin code.

The future `plugin.json` catalog metadata must use:

- the short description `Explore Langfuse metrics, observations, and scores in Grafana.`;
- precise keywords covering Langfuse, observability, LLM monitoring, traces,
  metrics, scores, and data source;
- light and dark vector logos that remain legible at catalog-card size;
- three to five screenshots showing configuration, a metrics time series, an
  observations/log view, a scores table, and variable-driven filtering;
- repository, issue, license, and documentation links;
- an accurate minimum Grafana dependency; and
- a visible statement that Langfuse v4 is required.

Screenshots are captured only from the verified release candidate using
synthetic data. Each image has a short descriptive caption and no tokens,
private URLs, personal information, or customer data.

### Submission package

Before submission, the project provides:

- a public source repository under Apache-2.0;
- an immutable versioned release ZIP whose top-level directory matches the
  plugin ID;
- the SHA1 requested by Grafana plus a stronger SHA256 checksum for users;
- a complete source URL and release artifact URL;
- concise installation, configuration, and usage testing guidance;
- a Docker Compose test environment, provisioned data source, synthetic
  Langfuse-compatible fixture, and sample dashboard; and
- plugin-validator and supported-version E2E evidence.

Grafana's current documentation says a first public plugin does not need to be
signed before review; approval establishes the public signature level. The
runbook therefore follows the current submission flow and rechecks the signing
instructions immediately before release instead of assuming a stale sequence.

### Launch sequence and promotion

1. Publish a high-quality GitHub release with concise release notes and a short
   demo captured from synthetic data.
2. Submit the release through Grafana Cloud **My Plugins**, including the
   archive URL, public source URL, SHA1, testing guidance, and provisioning
   information required by the current form.
3. Respond promptly to automated validation or manual-review findings and keep
   each fix in a new patch release rather than replacing an artifact.
4. After catalog approval, set the repository homepage to the canonical Grafana
   catalog URL and add an official catalog badge/link to the README.
5. Publish a technical announcement in the Grafana Community Forum that links
   to the catalog page, documents the supported Langfuse/Grafana versions, and
   demonstrates one useful dashboard workflow. Cross-posting elsewhere is
   secondary and must point back to the catalog page.
6. Keep the catalog page fresh through meaningful screenshots, accurate
   compatibility, useful release notes, and prompt issue handling.

There is no assumed paid or guaranteed placement on Grafana's official site.
Discoverability comes from catalog acceptance, accurate metadata, strong
visuals and documentation, release quality, and community usefulness.

### Success measures

The first-release success criteria are:

- catalog acceptance without unresolved validation or licensing findings;
- a clean install from the catalog artifact on the documented minimum and
  current Grafana versions;
- successful configuration against Langfuse v4 using the published guide;
- no confirmed credential exposure or unsafe write behavior;
- issue reports contain enough version and reproduction data to triage; and
- GitHub traffic, release downloads, stars, and issue quality show whether
  catalog visitors understand the plugin's purpose.

No plugin telemetry is added for promotion measurement.

## Verification

The OSS-readiness change is complete when:

- every referenced file and internal link exists;
- Markdown formatting and links pass repository-appropriate checks;
- YAML issue forms parse and contain no unsupported placeholders;
- the ruleset template is valid JSON and remains unapplied;
- the GitHub repository remains private;
- the live description and topics match the recorded metadata;
- no secret-like values or unsupported release claims are present; and
- `git diff --check` reports no whitespace errors.
