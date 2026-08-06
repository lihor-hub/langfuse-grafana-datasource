# Security policy

## Supported versions

Before the first release, no version is supported for production use. After
release, security fixes will target the latest published version. Older
versions may be asked to upgrade before a report is investigated.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

After this repository becomes public, use
[GitHub private vulnerability reporting](https://github.com/lihor-hub/langfuse-grafana-datasource/security/advisories/new)
from the repository's **Security** tab. If that private form is unavailable,
do not disclose the details publicly; open a content-free issue asking the
maintainer to enable a private reporting channel.

Include:

- the affected version or commit;
- the impact and conditions required to reproduce it;
- minimal reproduction steps using synthetic data;
- any mitigation already tested; and
- whether the issue is known to be actively exploited.

Never include a Langfuse secret key, Grafana token, Grafana Access Policy token,
authorization header, session cookie, private hostname, personal data, or
customer observability data. Replace secrets with unmistakably fake values and
describe their shape separately when relevant.

The maintainer will acknowledge reports and communicate next steps through the
private advisory. Response and remediation times depend on severity,
reproducibility, and maintainer availability; this project does not promise a
fixed service-level agreement.

## Security boundary

The project intends to keep Langfuse credentials in Grafana's secure data-source
configuration and to expose only read operations in plugin-owned code. Grafana's
generic data proxy is not a complete upstream authorization boundary. Deployers
with strict requirements should also use independently restricted Langfuse
credentials and network policy.
