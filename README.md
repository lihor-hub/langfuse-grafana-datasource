# Langfuse data source for Grafana

A frontend-only, read-only Grafana data source for Langfuse v4 observability
data. Langfuse API credentials are stored by Grafana and attached server-side
by the Grafana data proxy; the browser plugin receives only the proxy URL.

> [!IMPORTANT]
> **Pre-release:** the plugin is not yet published to the Grafana catalog.
> Development and verification continue before the first supported release.

## Requirements

- Grafana 12.3.0 or newer
- Langfuse v4
- Node.js 22 for development

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

- Grafana's server-side data proxy will hold and apply Langfuse Basic Auth
  credentials.
- The Langfuse secret key must not appear in dashboard queries, browser logs,
  fixtures, screenshots, issues, or committed provisioning files.
- Plugin-owned interfaces will expose only the required Langfuse read
  operations and no generic request or mutation method.

Grafana's generic data proxy is not a complete HTTP-method firewall. Operators
that require hard upstream write prevention should also use credentials whose
Langfuse authorization is independently restricted. Report potential security
problems through the private process in
[Security](https://github.com/lihor-hub/langfuse-grafana-datasource/blob/main/SECURITY.md).

## Planned compatibility

| Component | Planned baseline |
| --- | --- |
| Grafana | 12.3.0 or newer |
| Langfuse | Server v4 |
| Node.js for development | 22 |

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
