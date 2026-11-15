# Grafana catalog launch

The official Grafana plugin catalog is the primary distribution and discovery
target for the Langfuse data source. Catalog approval is controlled by Grafana
Labs and cannot be promised or scheduled by this project.

This strategy prepares a useful catalog page and a low-friction review package.
It does not authorize publication or submission.

## Official references

Recheck these pages immediately before the release because fields and review
requirements can change:

- [Publishing best practices](https://grafana.com/developers/plugin-tools/publish-a-plugin/publishing-best-practices)
- [Automate plugin builds](https://grafana.com/developers/plugin-tools/publish-a-plugin/build-automation)
- [Package a plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/package-a-plugin)
- [Sign a plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin)
- [Publish or update a plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/publish-a-plugin)
- [Help Grafana test a plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/provide-test-environment)
- [`plugin.json` reference](https://grafana.com/developers/plugin-tools/reference/plugin-json)

## Positioning

### Primary promise

Connect Grafana to Langfuse v4 and explore Langfuse metrics, observations, and
scores without putting Langfuse credentials in dashboard queries or
browser-side plugin code.

### Catalog description

Use this short description in `plugin.json` after the implementation is
verified:

> Explore Langfuse metrics, observations, and scores in Grafana.

### Supporting messages

- Build Grafana dashboards from aggregate Langfuse Metrics API v2 queries.
- Investigate spans, generations, events, and trace context in tables and logs.
- Explore individual scores and chart aggregate score behavior.
- Use Grafana time ranges and dashboard variables with guided query builders.
- Keep the integration frontend-only and plugin-owned operations read-only.

Do not claim Grafana-managed alerting, a Go backend, Langfuse v3 compatibility,
write prevention by Grafana's generic proxy, or official endorsement by
Grafana Labs or Langfuse.

## Catalog metadata brief

The verified `src/plugin.json` should contain:

| Field              | Prepared value or rule                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Plugin ID          | `lihorhub-langfuse-datasource`                                                                 |
| Name               | `Langfuse`                                                                                     |
| Description        | `Explore Langfuse metrics, observations, and scores in Grafana.`                               |
| Keywords           | `langfuse`, `observability`, `llm`, `monitoring`, `traces`, `metrics`, `scores`, `data-source` |
| Grafana dependency | The tested minimum version, planned as `>=12.3.0`                                              |
| Logos              | Light and dark SVG assets legible at catalog-card size                                         |
| Links              | Documentation, repository, issues, Apache-2.0 license                                          |
| Screenshots        | Three to five verified images with concise descriptive captions                                |

Grafana uses the `info.keywords`, `info.logos`, `info.screenshots`, and
`info.links` metadata in discovery and the catalog detail page. Keep each value
specific; repeating generic terms does not compensate for unclear positioning.

Do not add a sponsorship link for the first release. Revisit funding only after
the support and governance model is stable.

## Visual asset plan

The current metadata includes three prior synthetic CI screenshots of the
baseline aggregate Platform AI Observability dashboard. They are not fresh
evidence of the concurrent observations/logs, scores or variables tracks. Their
provenance is recorded in [release-track verification](release-track-verification.md).
Never use private Minikube images as catalog assets.

For new assets, use only a verified release candidate with synthetic data.
Use consistent dimensions, a clean Grafana theme, readable labels, and no
cropped menus or browser chrome that distract from the plugin.

1. **Configuration:** Langfuse URL and key fields plus a successful Save & Test
   result; all values are fake and no secret is revealed.
2. **Metrics:** a time-series panel showing observation count and cost with a
   useful dimension split.
3. **Observations:** Explore log output for synthetic generations and spans,
   including filters and trace context.
4. **Scores:** a table of synthetic numeric and categorical scores.
5. **Variables:** a dashboard whose environment or model variable visibly
   changes a query result.

Provide meaningful `alt` text or catalog captions. Review the full-resolution
files for tokens, private URLs, personal data, real trace IDs, and customer
content before committing them.

The logo should be an original project mark. Do not combine or alter Grafana or
Langfuse trademarks in a way that implies an official joint product.

## Catalog-page content

Grafana surfaces project metadata, README content, and changelog information.
Before submission, make the public README answer these questions in order:

1. What problem does the plugin solve?
2. Which Grafana and Langfuse versions are supported?
3. How is the data source installed from the catalog?
4. How are the Langfuse URL, public key, and secret key configured safely?
5. What do the metrics, observations, scores, and variable editors produce?
6. What are the important limits and unsupported Grafana features?
7. Where do users report defects, request features, and report vulnerabilities?

Add a short animated demo only when it is readable, accessible alongside static
screenshots, and small enough not to slow the page materially. Never substitute
a demo for configuration and compatibility documentation.

Maintain `CHANGELOG.md` with dated semantic versions, grouped user-visible
changes, prominent breaking changes, and links to relevant issues or pull
requests. The catalog page must help users decide whether an update is safe.

## Review package

Grafana's current submission form and review guidance call for:

- a URL to the versioned plugin ZIP;
- a public source-code repository or complete source archive;
- the ZIP's SHA1;
- installation, configuration, and usage testing guidance;
- an indication of whether provisioning is included; and
- answers used to determine the applicable signature level.

Prepare these review aids before opening the form:

- Docker Compose with Grafana and a deterministic synthetic
  Langfuse-compatible service;
- a secret-free provisioned data source;
- a provisioned dashboard that exercises metrics, observations, and scores;
- one command or documented sequence to start the environment;
- test credentials that work only against the local synthetic service;
- supported Grafana E2E results;
- plugin-validator output; and
- a two-minute reviewer path from startup to a populated dashboard.

Grafana's current signing documentation says the first public submission does
not need to be signed before review and that approval establishes its public
signature level. Confirm this immediately before submitting. Never use a
private-plugin signature as a shortcut for catalog publication.

## Submission procedure

1. Complete every gate in [Release runbook](releasing.md).
2. Sign in to the intended Grafana Cloud organization as an administrator.
3. Open **Org Settings → My Plugins → Submit New Plugin**.
4. Enter the immutable GitHub release ZIP URL, public source URL, SHA1, testing
   guidance, and provisioning information.
5. Answer signature and distribution questions accurately.
6. Save the submission confirmation and review reference in the private
   maintainer release record without copying credentials.
7. Respond promptly to automated validation, source review, and manual testing
   questions.

If review requires a source change, publish a new semantic patch version and
artifact. Do not replace a submitted ZIP at the same URL.

## Promotion sequence

The catalog page is the canonical call to action after approval.

### Before approval

- Keep public language to “submitted for review”; do not use an official-plugin
  badge or imply acceptance.
- Prepare a concise technical announcement and one synthetic dashboard demo.
- Invite a small group of Grafana and Langfuse users to test the GitHub release
  and file issues using the structured forms.

### On catalog approval

1. Set the GitHub repository Homepage to the canonical Grafana catalog URL.
2. Add a catalog installation link and accurate catalog badge to README.
3. Publish a Grafana Community Forum announcement linking first to the catalog
   page and second to the repository.
4. Demonstrate one concrete workflow: chart Langfuse cost or count, filter by a
   dashboard variable, then inspect related observations.
5. State the exact supported Grafana and Langfuse versions, current limits, and
   issue-reporting route.
6. Ask users for use cases and reproducible issues rather than generic stars.

### After launch

- Keep screenshots synchronized with meaningful UI changes.
- Publish useful, compatibility-focused release notes.
- Answer actionable issue reports and label them consistently.
- Post major new workflows to the Grafana Community Forum without repeating
  low-value patch announcements.
- Coordinate an upstream Langfuse community mention only after the catalog page
  is live; all cross-posts should return users to the official catalog listing.

There is no guaranteed featured placement on Grafana's official site. The
durable promotion strategy is catalog acceptance, searchable metadata, clear
visual proof, useful documentation, reliable releases, and visible maintenance.

## Success measures

Measure launch quality without adding plugin telemetry:

- catalog approval with no unresolved validation, licensing, or security
  findings;
- clean catalog installation on the minimum and current supported Grafana
  versions;
- successful first-time configuration using only the published README;
- GitHub release downloads and repository traffic referred by the catalog or
  launch announcement;
- stars and watchers as weak awareness indicators, not product-quality claims;
- issue completeness, duplicate rate, and time to triage; and
- confirmed credential-exposure or unsafe-write reports, with a target of zero.

Review these signals after the first week and first month. Prefer improving the
catalog description, screenshots, setup path, or issue forms over adding
behavioral tracking to the plugin.
