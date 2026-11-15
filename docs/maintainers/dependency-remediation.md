# Bounded dependency security remediation

This follow-up starts at integrated commit `b522af7`. It changes the lockfile
through targeted npm resolution, not `npm audit fix`, overrides or manual
transitive version substitution. Production architecture, direct Grafana/React/
Langfuse SDK versions and the Node floor remain unchanged.

## Scope and results

Before: `npm audit --json` reported **52 findings**: 20 high, 26 moderate,
6 low, zero critical. After the approved compatible updates: **36 findings**:
7 high, 23 moderate, 6 low, zero critical. Audit exit remains 1. These are
package/advisory-chain counts, not 36 independently exploitable plugin paths.
This is a reduction, **not a clean security scan or permission to release**.

The explicitly approved direct development-tool change is `markdownlint-cli2`
0.23.2 → 0.24.1, whose engine requirement `>=22` accepts this repository's Node
22.22.2 floor. Its upstream exact pins include fixed Markdown-it 15.0.3,
smol-toml 1.9.1 and js-yaml 5.5.0. The initially approved 0.23.3 patch still
pinned vulnerable parsers; the parent separately approved 0.24.1 rather than
forcing overrides. CLI/config behavior and repository Markdown checks pass.

Targeted updates within existing declared ranges:

| Package family                       | Before                 | After                   |
| ------------------------------------ | ---------------------- | ----------------------- |
| brace-expansion                      | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.22 / 2.1.8 / 5.0.13 |
| DOMPurify                            | 3.4.0                  | 3.4.18                  |
| fast-uri                             | 3.1.5                  | 3.1.9                   |
| js-yaml (Istanbul dependency)        | 3.15.1                 | 3.15.2                  |
| nanoid                               | 3.3.17                 | 3.3.20                  |
| source-map-js                        | 1.2.1                  | 1.2.2                   |
| undici                               | 7.29.0                 | 7.30.2                  |
| zod                                  | 4.4.3                  | 4.6.7                   |
| ip-address                           | 10.4.0                 | 10.7.6                  |
| qs                                   | 6.15.3                 | 6.17.1                  |
| serialize-javascript                 | 7.0.7                  | 7.1.4                   |
| postcss-selector-parser              | 7.1.4                  | 7.2.1                   |
| react-use (maintained caller)        | 17.6.0                 | 17.6.1                  |
| js-cookie (via updated caller range) | 2.2.1                  | 3.0.8                   |

The approved Markdown-lint minor also updates its exact globby, js-yaml and
smol-toml pins; npm resolves the associated permitted parser dependencies.
Review the complete lockfile diff, including added/removed parser dependencies.
Clean `npm ci` succeeds with lifecycle hooks still disabled by repository policy.

## Outstanding high findings and blocked options

### FTP/proxy tooling

Installed root chains to `basic-ftp@5.3.1`:

```text
@grafana/sign-plugin@3.3.3
  → proxy-agent@8.0.1 → pac-proxy-agent@9.0.1
  → get-uri@8.0.0 → basic-ftp@5.3.1

markdown-link-check@3.15.0
  → proxy-agent@8.0.2 → pac-proxy-agent@9.1.0
  → get-uri@8.0.1 → basic-ftp@5.3.1

markdown-link-check@3.15.0 → link-check@5.6.0
  → proxy-agent@8.0.2 → pac-proxy-agent@9.1.0
  → get-uri@8.0.1 → basic-ftp@5.3.1
```

The installed `get-uri` FTP adapter imports `Client`, constructs `new Client()`,
and invokes `access({host,port,user,password,...opts})`, `lastMod(filepath)`,
`list(dirname(filepath))` (using entry `name`/`modifiedAt`),
`downloadTo(stream,filepath)` and `close()`. This includes the directory-listing
parser exposed by the remaining advisories; it is not just an unused declared
package in the source tooling graph. These are tooling/PAC URI paths, not
plugin-owned Langfuse HTTP operations.

At review time, latest `get-uri@8.0.1` still requires `basic-ftp:^5.3.1`;
latest `pac-proxy-agent@9.1.0` exactly pins `get-uri:8.0.1`. Latest
`markdown-link-check@3.15.0` and `link-check@5.6.0` retain `proxy-agent:^8.0.2`.
Thus no current compatible caller update removes FTP 5. The available fixed
FTP release is 6.2.6, outside those ranges. Do not force FTP 6 beneath a caller
that declares FTP 5. Upstream caller fixes, removal/replacement of a root tool,
or an explicitly evaluated major/override are separate maintainer decisions.

### Cookie chain resolved through a maintained caller

The latest maintained `react-use@17.6.1` patch updates its own cookie dependency
from `js-cookie:^2.2.1` to `^3.0.0`. All three pinned Grafana callers already
permit `react-use:^17.6.0`; targeted `npm update react-use` therefore selects
the supported caller patch and fixed `js-cookie@3.0.8`. No js-cookie 3 override
was forced under a caller declaring version 2. The `useCookie` implementation
uses `Cookies.get(cookieName)`, `Cookies.set(cookieName,newValue,options)` and
`Cookies.remove(cookieName)`; no unsupported private cookie APIs are involved.
The source lock's cookie/react-use high findings are cleared. This does not
update the independently installed Grafana host's own libraries.

## Remaining moderate/low categories

All seven remaining npm high package chains lead to FTP: basic-ftp, get-uri,
pac-proxy-agent, proxy-agent, link-check, markdown-link-check and
@grafana/sign-plugin. Moderate findings remain in Grafana-host moment/router
chains and Jest/glob/minimatch and lint/parser toolchains. Low findings remain
in deepmerge/fork-ts-checker and KaTeX/Markdown math dependencies (including
Markdown-lint caller chains). Do not reinterpret npm's suggested major
upgrades or downgrades as compatible fixes. Rerun both npm audit and the exact
source-enabled official validator after integration; advisory data can change.

## Reachability and validation

Production webpack before and after this dependency change has identical
85,816-byte `module.js` assets; the after gzip size is 22,018 bytes (level 9).
Both builds have zero errors/warnings. The only included `node_modules` module
is `grafana-public-path.js`; Grafana and React remain host-provided externals.
Tooling findings nevertheless affect the source/release supply chain and must
not be dismissed just because they are not bundled browser code.

Passed after a clean install: formatting, lint, TypeScript, all **408 Jest
tests**, HTTP fixture/smoke tests, release-tool tests, production build, local
plugin/archive validation, packaging, secret scan, Markdown checks, link checks
and repository validation. No signing, pushing, production host actions or
real-credential reads were performed. Container E2E remains parent-owned.

A source-enabled official validator scan must use the exact candidate source.
The validator's GitHub archive/tree/SHA handling can clone a default branch or
fail a `--branch <SHA>` clone and then silently skip source-dependent checks.
A skipped scan is **not a pass**. Parent verified a loopback-served exact
`git archive` ZIP as the valid source-input path and owns the final rerun.
The preceding exact-source OSV run reported basic-ftp, fast-uri, js-yaml,
markdown-it, nanoid, smol-toml, source-map-js and undici; all except basic-ftp
have now been updated to versions outside the reported vulnerable ranges.
Only npm's after-result has been rerun in this worker; do not label the final
source-aware OSV result passing before parent executes it.
