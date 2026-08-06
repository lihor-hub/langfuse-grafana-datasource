# Contributing

Thank you for taking an interest in the Langfuse data source for Grafana.

## Current contribution phase

Issues are welcome. Pull requests are paused until the maintainer has verified
and published the first release. This keeps implementation review focused while
the plugin's behavior and compatibility are being revalidated.

Please do not open a pull request yet. A pull-request template is present so the
future workflow is explicit, but pull requests submitted before the contribution
phase opens may be closed without review.

## Before opening an issue

- Search existing issues and include related issue numbers.
- Use the appropriate issue form and answer every required question.
- Reduce defects to a reproducible example when possible.
- Include exact Grafana, Langfuse, plugin, browser, and deployment versions.
- Use synthetic data and redact tokens, keys, authorization headers, cookies,
  private hosts, personal data, and customer observability data.
- Keep requests within the read-only observability scope described in the
  [project design](docs/superpowers/specs/2026-08-05-langfuse-grafana-datasource-design.md).

Do not report vulnerabilities in a public issue. Follow
[the security policy](SECURITY.md) instead.

## After the first verified release

This section describes the workflow that will be activated when the maintainer
announces that pull requests are open:

1. Discuss non-trivial changes in an issue before implementation.
2. Fork the repository and create a focused branch from the current default
   branch.
3. Add or update tests before changing behavior.
4. Run the repository-native formatting, linting, type, unit, build, plugin
   validation, and relevant end-to-end checks.
5. Update user documentation and `CHANGELOG.md` for user-visible changes.
6. Open a small pull request that explains the problem, approach, evidence, and
   compatibility impact.

Contributions will be licensed under the project's
[Apache License 2.0](LICENSE).

## Community expectations

Participation in project spaces is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md). Support requests are routed according to
[Support](SUPPORT.md).
