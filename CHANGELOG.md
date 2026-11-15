# Changelog

<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.0 (2026-11-15)

### Added

- Platform AI observability dashboard with eleven aggregate data panels,
  operator guidance, datasource selection and synthetic development provisioning.
- Metrics v2 guided/JSON editors, view-specific capabilities, typed filters,
  grouping, ordering, units and bounded time-series/table frames.
- Histogram heatmap cells with a lossless table fallback when bounds or time
  intervals cannot be represented reliably.
- Bounded Observations v2 tables and Explore logs, all ten observation types,
  selective payload groups and verified project-scoped Langfuse links.
- Scores v3 tables for all five native value types, documented CSV filters,
  optional field groups and bounded sequential pagination.
- Dashboard variable editor, bounded dimension discovery, instance-local cache,
  shared-request cancellation and safe scoped-value interpolation.
- Mixed-query dispatch with a shared four-target concurrency limit, stable
  empty schemas, safe partial-failure notices and cancellation.
- Runtime response guards, classified safe errors, no plugin-owned retries and
  conditional Retry-After display with an explicit unavailable-timing fallback.
- Synthetic API fixtures and feature browser scenarios, opt-in real-host smoke
  checks, onboarding guides, deterministic unsigned ZIP/checksums and local
  release/secret validation.
- Dashboard interpretation/import guide, query/frame/component tests and a
  provisioned-dashboard browser test.

### Changed

- Updated Grafana lint tooling using its public configuration entrypoint and
  retained ESLint 9 for React plugin compatibility.
- Raised the development Node.js minimum to 22.22.2 for updated lint tooling.
- Ordinary CI and release-candidate automation remain unsigned and cannot
  publish a GitHub release or submit to the catalog merely because a signing
  token exists.

### Fixed

- Preserve malformed advanced query members as editable JSON instead of
  rendering unsafe guided controls and crashing the metrics or score editor.
- Limit Playwright discovery to browser specs so Node fixture and real-host
  smoke suites run only through their explicit commands.
- Reject metric responses exceeding the requested row limit instead of
  trusting the upstream server to enforce the plugin's result bounds.

### Security

- Update compatible toolchain dependencies and harden FTP control-host pinning
  with a narrowly scoped dependency override and loopback compatibility tests.
  Remaining moderate/low dependency findings are documented and not waived.

## 0.1.1 (2026-08-06)

### Added

- Open-source project policies, community health files, repository governance,
  and maintainer release documentation.

### Changed

- Prepared the repository for the first public pre-release verification.
