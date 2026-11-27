# Langfuse data source for Grafana

A frontend-only, read-only Grafana data source for Langfuse v4 observability
data. Langfuse API credentials are stored by Grafana and attached server-side
by the Grafana data proxy; the browser plugin receives only the proxy URL.

## Requirements

- Grafana 12.3.0 or newer
- Langfuse v4 with the Metrics v2, Observations v2 and Scores v3 read APIs

## Platform observability dashboard

The [example dashboard](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/provisioning/dashboards/platform-observability.json)
shows observation volume, generation count, model latency, cost, tokens,
model mix, error counts and numeric evaluation trends. Operator explanations
are included inside Grafana.

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
for setup instructions, capabilities, examples, field groups and limits.
Managed alerting, streaming, annotations and write operations are not supported.
The plugin never retries queries automatically. Retry-After is displayed only
when Grafana exposes the header; otherwise the error states that timing is
unavailable.

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

## Getting help and sharing feedback

- Review [Support](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/SUPPORT.md)
  to choose the right support channel.
- Use the [issue forms](https://github.com/lihor-hub/langfuse-grafana-datasource/issues/new/choose)
  for reproducible defects and focused feature requests.
- Do not put credentials, private hostnames, or customer observability data in
  an issue.

## License and trademarks

Licensed under the
[Apache License 2.0](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/LICENSE).

Grafana is a trademark of Grafana Labs. Langfuse is a trademark of its
respective owner. This independent community project is not affiliated with,
endorsed by, or sponsored by Grafana Labs or Langfuse.
