# Install and explore Langfuse safely

## Release status

The plugin implements Metrics v2, Observations v2, Scores v3, discovery
variables, guided/JSON editors and histogram rendering. An unsigned review
candidate is not a catalog installation promise; use the verification evidence
attached to the exact release, not these instructions alone.

The sample dashboard uses aggregate Metrics v2 and demonstrates observation
volume, generation latency/cost/tokens, model grouping, error observations and
numeric score trends. See [the dashboard guide](platform-observability-dashboard.md).
Use Explore to test individual observations/logs and score queries.

## Requirements and installation

- Langfuse **server v4**; v3 and legacy endpoints are not supported.
- Grafana **12.3 or newer**. Use the exact minimum/current images verified by the
  release candidate's CI matrix, not an untested interpretation of the floor.
- Development: Node 24.15.0 or newer within 24.x (see `.nvmrc`), npm,
  Docker Compose, and `zip` for packaging.

For a development installation, unpack the validated archive into Grafana's
plugin directory. The archive has one root, `lihorhub-langfuse-datasource`.
Restart Grafana. Unsigned builds require explicitly allowing this plugin ID
in your **development** Grafana configuration; do not weaken production
signature policy as an installation workaround. For a signed/catalog build,
follow the maintainer's published installation instructions for that artifact.

Add a **Langfuse** data source. Set the URL to the Langfuse origin, not an
`/api/public` endpoint or Grafana proxy path:

| Deployment        | Example base URL                |
| ----------------- | ------------------------------- |
| Langfuse Cloud EU | `https://cloud.langfuse.com`    |
| Langfuse Cloud US | `https://us.cloud.langfuse.com` |
| Self-hosted v4    | `https://langfuse.example.com`  |

Use the region assigned to your project; region/account availability must be
checked with Langfuse. Enter the public key as the Basic Auth username and the
secret key as its password through Grafana secure settings. **Save & Test**
checks the project and a bounded Observations v2 read. Saved secrets should
remain configured without being returned to the browser; reset only to replace
one. Do not put credentials in URLs, filters, dashboards, screenshots or issues.

## Provision without committing credentials

Supply the following values in the Grafana process/container environment using
a local, untracked environment file or CI secrets. This example is a template;
never replace its environment expressions with credentials in source control.
Grafana's `$VARIABLE` form avoids a second interpolation of dollar signs in
secret values. Do not pass secrets on a command line or print `docker compose
config` output; use `docker compose config -q`.

```yaml
apiVersion: 1
datasources:
  - name: Langfuse
    type: lihorhub-langfuse-datasource
    uid: langfuse
    access: proxy
    url: $LANGFUSE_BASE_URL
    basicAuth: true
    basicAuthUser: $LANGFUSE_PUBLIC_KEY
    jsonData:
      timeout: 30
    secureJsonData:
      basicAuthPassword: $LANGFUSE_SECRET_KEY
```

For a private certificate authority, configure Grafana's TLS settings; do not
silence certificate validation. Never share an exported secure settings file.

## Deterministic local development

```bash
npm ci
npm run test:fixtures
npm run test:release-tools
npm run test:secrets
npm run build
# Set synthetic-only LANGFUSE_E2E_PUBLIC_KEY and LANGFUSE_E2E_SECRET locally.
npm run server
```

The existing Compose configuration provisions `langfuse-e2e` against the mock,
and the Platform AI Observability dashboard into the **Langfuse** folder. It
requires no real Langfuse host or project. Follow the repository's development
login instructions, open that dashboard and run Save & Test. Run `npm run e2e`
against the containerized environment; a successful direct mock test is **not**
evidence that the real Grafana proxy or browser UI passed.

Use [the fixture contract](mock-langfuse.md) for pagination, logs, histograms,
errors, discovery and cancellation scenarios. Never point the mock credentials
at a real project. No production Minikube changes are part of this workflow.

## Query workflow and integration checklist

Grafana's range always wins over saved timestamps. Start with a short interval,
small result ceiling and only the field groups needed for the investigation.
The canonical definitions are `metricsQuery`, `observationsQuery` and
`scoresQuery` JSON strings, selected by `kind`. Do not edit an endpoint/method.

| Goal                             | Query/visualization                              | Important rule                                                                                                        |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Counts, cost, tokens and latency | Metrics `observations`, time series              | Use server-side aggregates; group by low-cardinality model/type/environment.                                          |
| Whole-window groups              | Metrics without `timeDimension`, table           | Preserve returned dimensions; counts are not unique users or requests.                                                |
| Distribution                     | Metrics histogram, heatmap or table              | Tuples contain lower/upper/count. Missing time or defensible bounds means a lossless table, never fabricated buckets. |
| Individual events                | Observations, table                              | All ten v4 observation types; sequential pagination, ceiling 1–5,000, default 1,000.                                  |
| Incident investigation           | Observations in Explore, logs                    | Timestamp/body/severity/ID; choose name/status/input/output, falling back to name. Fetch IO only when needed.         |
| Individual evaluations           | Scores, table                                    | Numeric, boolean, categorical, text and correction retain native values. Default ceiling 500, maximum 5,000.          |
| Quality trends                   | Metrics `scores-numeric` or `scores-categorical` | Boolean aggregates use the numeric view; never aggregate raw paginated scores in the browser.                         |
| Dashboard selectors              | Discovery via Metrics v2                         | Low-cardinality dimensions, bounded lookback and 60-second instance-local cache; no raw-ID scanning.                  |

Guided and advanced editing share one canonical definition. Invalid JSON stays
editable and cannot run. Multi-value variables expand into supported typed
filter arrays, not concatenated JSON. For exact examples, see the
[metrics](metrics-queries.md), [observations](observation-queries.md),
[scores](score-queries.md) and [variables](dashboard-variables.md) guides.

The baseline dashboard uses a data-source selector and literal filters; it does
not yet demonstrate the discovery-variable or raw observation/score UI. Do not
mistake its aggregate error table for individual error log output. A truncation
notice means results may be incomplete; narrow the range or filters. Empty
results are not proof of zero failures or perfect score quality.

## Real-host smoke, explicitly opt-in

Use only local environment or CI secret injection for `LANGFUSE_BASE_URL`,
`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, then run `npm run smoke:real`.
Without all three values the suite skips. It makes project, one-row bounded
observation and bounded metrics reads; it never snapshots payloads, prints IDs,
outputs, headers or keys, or follows redirects with credentials. The smoke test
checks API shapes only; it does not verify Grafana proxy/UI behavior. Do not
attach real API responses, network exports or private screenshots as evidence.

## Product/security limits

- Frontend-only, read-only plugin. No backend, managed alerting, recorded
  queries, writes, streaming, live tailing or Langfuse v3 fallback.
- No prompt/dataset/administration browsing. Fetching observation prompt
  context is not a prompt-management API.
- Grafana's generic proxy is **not a complete HTTP-method firewall**. Require
  independently restricted upstream authorization for a hard security boundary.
- Secrets belong in Grafana secure JSON data. IO and metadata may still contain
  sensitive business content; limit access and request those groups deliberately.
- Results are not cached except bounded discovery; refresh consumes upstream
  quota. No silent retries; rate limits differ by plan and should show retry timing.
- Signing, publisher organization/account setup, license decisions and catalog
  submission remain maintainer-controlled gates. This work does not authorize them.
