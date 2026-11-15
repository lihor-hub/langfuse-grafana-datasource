# Langfuse data source for Grafana

A frontend-only, read-only Grafana data source for Langfuse v4 observability
data. Langfuse API credentials are stored by Grafana and attached server-side
by the Grafana data proxy; the browser plugin receives only the proxy URL.

> [!IMPORTANT]
> **Pre-release:** the plugin is not yet published to the Grafana catalog.
> Development and verification continue before the first supported release.

## Requirements

- Grafana 12.3.0 or newer
- Langfuse v4 with the Metrics v2, Observations v2 and Scores v3 read APIs
- Node.js 22.22.2 or newer within the 22.x release line for development

## Platform observability dashboard

The [example dashboard](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/provisioning/dashboards/platform-observability.json)
shows observation volume, generation count, model latency, cost, tokens,
model mix, error counts and numeric evaluation trends. Operator explanations
are included inside Grafana. The development stack provisions it with synthetic
data in the **Langfuse** folder.

Read the [dashboard guide](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/docs/platform-observability-dashboard.md)
for import instructions, interpretation, query examples and limitations.

## Query modes

- **Aggregate metrics:** guided and advanced JSON editing for observation and
  score views, typed filters, grouping, ordering, units and time-series/table
  output. Valid histogram results become heatmap cells; unsupported shapes
  remain lossless tables with an explanatory notice. Maximum 1,000 result rows.
- **Observations:** all ten observation types, tables or Explore logs, selective
  fields and optional project-scoped Langfuse links. Input/output and metadata
  payloads are opt-in.
- **Scores:** tables for NUMERIC, BOOLEAN, CATEGORICAL, TEXT and CORRECTION,
  preserving native values and optional details, subject and annotation groups.
- **Dashboard variables:** bounded dimension discovery with instance-local
  caching and parsed-value interpolation. Multi-values expand only through
  documented membership operators or Scores v3 CSV filters.

Observation and score pages run sequentially with a configurable 1–5,000-row
ceiling. Mixed queries share a four-target concurrency limit, cancellation,
safe errors and partial-failure notices. New dashboard queries default to
metrics; new Explore queries default to observation logs. Switching query kinds
preserves inactive JSON drafts and saved variable references.

See the [query and installation guides](https://github.com/lihor-hub/langfuse-grafana-datasource/tree/main/docs)
for capabilities, examples, field groups, limits and development installation.
Managed alerting, streaming, annotations and write operations are not supported.
The plugin never retries queries automatically. Retry-After is displayed only
when Grafana exposes the header; otherwise the error states that timing is
unavailable. Integrated browser compatibility and catalog review remain release
gates, not implied by the implemented feature list.

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
```

To run the Grafana end-to-end environment, supply runtime-only credentials and
start the generated Compose stack:

```bash
export LANGFUSE_E2E_PUBLIC_KEY=pk-e2e
export LANGFUSE_E2E_SECRET="$(openssl rand -hex 32)"
npm run server
npm run e2e
```

Do not commit those values or place them in provisioning files.

## Project status

The plugin implementation is in pre-release verification. There is currently
no catalog listing, supported upgrade path, or compatibility guarantee.

Issues are welcome for design feedback, use cases, and defects found while the
project is being prepared. Pull requests are paused until the maintainer has
verified and published the first release. See
[Contributing](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/CONTRIBUTING.md).

## Security model

The plugin is designed to be frontend-only and read-only:

- Grafana's server-side data proxy holds and applies Langfuse Basic Auth
  credentials.
- The Langfuse secret key must not appear in dashboard queries, browser logs,
  fixtures, screenshots, issues, or committed provisioning files.
- Plugin-owned interfaces expose only the required Langfuse read
  operations and no generic request or mutation method.

Grafana's generic data proxy is not a complete HTTP-method firewall. Operators
that require hard upstream write prevention should also use credentials whose
Langfuse authorization is independently restricted. Report potential security
problems through the private process in
[Security](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/SECURITY.md).

## Planned compatibility

| Component               | Planned baseline             |
| ----------------------- | ---------------------------- |
| Grafana                 | 12.3.0 or newer              |
| Langfuse                | Server v4                    |
| Node.js for development | 22.22.2 or newer within 22.x |

The release documentation will replace planned compatibility with tested
compatibility evidence before publication.

## Getting help and sharing feedback

- Review [Support](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/SUPPORT.md)
  to choose the right support channel.
- Use the [issue forms](https://github.com/lihor-hub/langfuse-grafana-datasource/issues/new/choose)
  for reproducible defects and focused feature requests.
- Do not put credentials, private hostnames, or customer observability data in
  an issue.

## Maintainers

Privileged publication work is separated from ordinary contributor guidance:

- [Release runbook](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/docs/maintainers/releasing.md)
- [Grafana catalog launch](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/docs/maintainers/grafana-catalog-launch.md)
- [GitHub repository settings](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/docs/maintainers/github-settings.md)

These documents prepare future actions; they do not authorize a release,
visibility change, ruleset activation, signing operation, or catalog submission.

## License and trademarks

Licensed under the
[Apache License 2.0](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/LICENSE).

Grafana is a trademark of Grafana Labs. Langfuse is a trademark of its
respective owner. This independent community project is not affiliated with,
endorsed by, or sponsored by Grafana Labs or Langfuse.
