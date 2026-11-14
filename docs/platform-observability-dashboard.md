# Platform AI observability dashboard

Use Langfuse to understand the **instrumented AI workload** of your platform:
what it runs, how long model work takes, what it costs, and how recorded
quality scores change. Use infrastructure metrics and logs alongside it;
Langfuse observations alone do not establish platform availability.

## Open the example

Dashboard JSON: [Platform AI Observability](../provisioning/dashboards/platform-observability.json).

1. Build and install this repository's `lihorhub-langfuse-datasource` plugin in
   a development Grafana instance. It is not yet available in the catalog.
   Restart Grafana after installing/updating the build so its dashboard metadata
   is registered.
2. Configure its Langfuse URL and project public/secret keys using **Save & Test**.
   Grafana stores the secret and applies Basic Auth server-side.
3. In Grafana, choose **Dashboards → New → Import**, upload the JSON, and select
   the configured **Langfuse datasource** from the dashboard selector.
4. Start with **Last 7 days**, then narrow the time window around an incident.

The dashboard and this guide are included in the built plugin archive. The
plugin metadata also lists the example for Grafana's datasource dashboard
import UI.

The repository's Compose development environment automatically provisions the
same dashboard in the **Langfuse** folder with synthetic data. Follow the
[development instructions](../README.md#development); the supplied credentials
must exist only in your runtime environment.

AIM's built-in `radcom-aim-langfuse-datasource` is a **different plugin**. Its
proxy can validate API connectivity, but its dashboard query method does not
implement this query model. Selecting it or merely importing this dashboard
will not make these panels work. Install this standalone plugin separately;
do not replace AIM's existing datasource or copy its credentials into JSON.

## Read the dashboard

The dashboard includes these explanations as text panels, descriptions and
panel help, not just in this document.

| Question | Panel | How to use it |
| --- | --- | --- |
| What is the instrumented workload? | Recorded observations; volume by type | Separate generations from spans/tools/agents. One request may produce many observations. |
| How much model work runs? | LLM generations | Count GENERATION observations; do not call this distinct users or platform requests. |
| What does it cost? | Recorded generation cost; cost over time | Compare cost with traffic, tokens and model mix. Missing usage/pricing makes totals incomplete. |
| Are model calls slow? | Median and p95 model latency | Read generation duration in milliseconds. This is not full request latency. Do not average bucket percentiles. |
| Are prompts or responses growing? | Input vs output tokens | Compare token trends with call volume. Larger prompts, longer responses or changed workloads are hypotheses to investigate. |
| Which models drive usage? | Model mix table | Compare recorded cost, tokens and calls by model name; the table is capped at 20 models. |
| Where are failures recorded? | Error observations by operation | Find operation names marked ERROR, then inspect individual traces in Langfuse. This is not a failed-request rate. |
| Is measured quality changing? | Numeric evaluation scores by name | Interpret each evaluator's own scale, direction, coverage and sample size. The chart is an average, not a pass rate. |

Cost, token and model-latency panels filter to `GENERATION` observations. This
avoids adding parent/child aggregate usage together, but excludes other charged
work such as embeddings. Treat these as recorded generation totals, not a
complete provider invoice.

**No data is not zero.** Empty error or score results are shown without
manufacturing values. An empty score chart does not mean perfect quality.
Langfuse's API may itself return a numeric zero for a valid count; the plugin
preserves that value.

## A practical investigation

1. Select the incident window and compare observation types and generation
   volume. Check whether instrumentation or workflow structure changed.
2. If latency increased, compare token usage and model mix. Inspect the slow
   generations and parent traces in Langfuse; an aggregate chart is not proof
   of the root cause.
3. If cost increased, distinguish more calls from larger contexts or more
   expensive models. Check pricing and usage reporting before optimizing.
4. If errors increased, start with the operation table and correlate the same
   window with your platform's existing infrastructure/log dashboards.
5. If a quality score changed, inspect the evaluator definition and sampling.
   Different score names are not necessarily comparable.

There are no hard-coded private URLs, real trace IDs, prompts, outputs or
credentials in the dashboard. It does not automatically join Langfuse traces
with other Grafana datasources.

## Adapt a panel

The first query editor supports **Metrics v2 JSON**. Duplicate a panel and edit
its JSON rather than building a request URL. For example:

```json
{
  "view": "observations",
  "metrics": [{ "measure": "latency", "aggregation": "p95" }],
  "dimensions": [{ "field": "providedModelName" }],
  "filters": [
    { "type": "string", "column": "type", "operator": "=", "value": "GENERATION" },
    { "type": "string", "column": "environment", "operator": "=", "value": "production" }
  ],
  "timeDimension": { "granularity": "auto" },
  "config": { "row_limit": 1000 }
}
```

Grafana's selected range always replaces any saved `fromTimestamp` and
`toTimestamp`. `auto` chooses a supported bucket from Grafana's query interval.
Omit `timeDimension` for a whole-range total or grouped table. Use `metrics`,
not `measures`; the API row limit belongs in `config.row_limit`.

Supported views are `observations`, `scores-numeric`, and `scores-categorical`.
Metrics, aggregations, low-cardinality dimensions, filters and limits are
validated before dispatch. The editor preserves invalid JSON and shows an
error instead of sending it upstream. Available server fields may vary with
the installed Langfuse version; an HTTP 400 is reported without echoing the
upstream response.

## Current limits and safety

- Requires Langfuse v4 and Grafana 12.3 or newer; verify the release candidate's
  supported version matrix before production use.
- Aggregate queries only in this slice: no individual observation/score table,
  logs, histogram output, guided builder, or trace-link drill-down yet.
- The dashboard has a datasource selector, not automatic environment/model
  discovery variables. Add a literal environment filter in a panel as above.
- At most 1,000 rows per target and four concurrent targets per query request.
  A visible row-limit notice means the result may be incomplete; narrow the
  range or reduce grouping. Grouped time series share this ceiling.
- Partial target failures appear as notices while successful frames remain.
  If every target fails, the query fails instead of presenting a healthy empty
  result. Unsubscribing aborts in-flight reads.
- No plugin result cache and no background polling beyond Grafana refresh;
  the example refresh interval is five minutes.
- Frontend-only: no Grafana-managed alerting, recorded queries, writes or
  Langfuse v3 fallback. Grafana's generic proxy is not a complete HTTP-method
  firewall; require independently restricted upstream authorization if needed.
- Store credentials only in Grafana secure settings or runtime provisioning
  environment variables. Do not put them in filters, dashboard JSON or issues.

## Verification

Every example panel query was exercised through an existing Grafana proxy to a
real Langfuse 4.18.0 instance. All eleven queries returned HTTP 200; error and
numeric-score queries returned empty arrays for that selected window. No real
payloads were retained as fixtures.

Unit tests cover query compilation, frames and dashboard integrity. The
synthetic HTTP service provides numeric fields and bounded timestamps for the
same queries. The browser suite provisions the dashboard and checks its panels
through Grafana; its result must be checked in CI before claiming verified UI
rendering or release readiness.

Primary references:

- [Langfuse Metrics v2 examples](https://langfuse.com/guides/cookbook/example_metrics_api_v2)
- [Langfuse Metrics API](https://langfuse.com/docs/metrics/features/metrics-api)
- [Grafana data frames](https://grafana.com/developers/plugin-tools/key-concepts/data-frames)
