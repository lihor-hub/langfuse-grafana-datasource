# Repository rules

These rules apply to every repository change, including changes made by
automated agents.

## Product boundary

- Preserve the approved frontend-only, read-only data-source design.
- Plugin-owned code may expose only the approved Langfuse read operations. Do
  not add a generic HTTP entry point or a mutation operation.
- Treat behavior outside the approved specification as a new product decision.
  Update the specification or add an ADR before implementing it.

## Secrets and data

- Never commit, quote, log, or paste a Langfuse secret key, a public key paired
  with a secret, a Grafana token, a Grafana Access Policy token, an authorization
  header, a session cookie, a private hostname, or captured customer data.
- Use synthetic fixture data and unmistakably fake credentials.
- Redact secrets from command output, screenshots, issues, pull requests,
  release notes, and test artifacts.
- Keep the Langfuse secret key in Grafana secure JSON data. It must not enter a
  query model, dashboard, browser log, or committed provisioning file.

## Evidence and compatibility

- Do not describe planned behavior as implemented or supported.
- Tie public compatibility and security claims to fresh verification evidence
  from the exact release candidate.
- Treat dependency floors, plugin metadata, Grafana compatibility, Langfuse API
  compatibility, and packaged output as deliberate release-facing changes.
- Record an architectural decision when the implementation crosses an approved
  boundary or selects a documented fallback.

## Change quality

- Follow repository-native formatting, linting, type, unit, build, validator,
  and relevant end-to-end checks once they exist.
- Add or update tests before changing behavior. Preserve cancellation,
  pagination, redaction, and partial-error coverage for affected query paths.
- Update user documentation and `CHANGELOG.md` with user-visible changes.
- Keep commits focused and avoid unrelated refactoring.

## Issues and contributions

- Follow `docs/agents/issue-tracker.md` and keep exactly one workflow label from
  `docs/agents/triage-labels.md` on an issue.
- Accept issues during the pre-release phase. Pull requests remain paused until
  the maintainer verifies and publishes the first release.
- Never put credentials, private infrastructure details, or customer data in an
  issue or comment.

## Privileged actions

Do not perform any of the following without explicit maintainer authorization
for that exact action:

- change repository visibility;
- create or push a release tag;
- publish or replace a GitHub release or plugin archive;
- sign a plugin or modify release credentials;
- submit or update a Grafana catalog listing;
- enable an external service or install an application; or
- apply, weaken, or bypass repository protection rules.

Preparation and read-only verification do not authorize publication.
