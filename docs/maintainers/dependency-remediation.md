# Bounded dependency security remediation

The initial compatible-update pass starts at integrated commit `b522af7` and
is recorded below as historical evidence. It used targeted npm resolution,
not `npm audit fix`, overrides or manual transitive version substitution.
A subsequent explicitly authorized, tested FTP override is documented at the
end of this file and supersedes the initial FTP blocker/counts. Production
architecture, direct Grafana/React/Langfuse SDK versions and the Node floor
remain unchanged.

## Initial compatible-update scope and results

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

## Subsequent authorized FTP-bounce hardening override

After primary-source review, the parent explicitly approved only this narrow
exception to the prior no-major/override boundary:

```json
{
  "overrides": {
    "get-uri": {
      "basic-ftp": "6.2.6"
    }
  }
}
```

This is scoped to basic-ftp beneath get-uri, pinned to one reviewed version;
it is not a blanket override of unrelated consumers. `npm ls` confirms both
get-uri 8.0.0 and 8.0.1 resolve basic-ftp 6.2.6 under all three tooling chains.
No get-uri caller version, direct Grafana/React/SDK version or Node floor changed.
The 5.3.1 and 6.2.6 basic-ftp engine declarations both accept Node `>=10`.

The upstream [basic-ftp 6.0.0 release notes](https://github.com/patrickjuchli/basic-ftp/releases/tag/v6.0.0)
identify the breaking change: separate data-transfer hosts are rejected by
default to protect against FTP-bounce attacks. The upstream opt-in is
`allowSeparateTransferHost: true` on Client construction. This repository does
**not** enable it. The get-uri APIs listed above remain present. The behavioral
tightening is intentional: a server cannot redirect the client to a different
data host. In 6.2.6, distinct loopback addresses are considered compatible for
negotiation, but the actual connection is always pinned to the control-host
address. Other incompatible host pairs are rejected. An earlier version could
connect directly to the advertised different loopback host.

### Real loopback compatibility evidence

`scripts/ftp-compatibility.test.mjs` uses only Node's net/http-independent local
TCP APIs and the existing get-uri dependency. No FTP server dependency, external
host, real account or new secret is involved. Ephemeral listeners bind only
127.0.0.1 and 127.0.0.2. A tiny FTP control fixture rejects EPSV to exercise PASV
host handling explicitly.

- Before the override: normal same-host FTP retrieval passed, but the security
  test failed because get-uri successfully connected to the advertised second
  loopback host and returned its synthetic payload.
- After the override: normal get-uri login/MDTM/PASV/RETR retrieval still returns
  the exact synthetic payload.
- With a second advertised loopback host: both a trusted control-host listener
  and an alternate-host listener exist on the advertised port, offering distinct
  payloads. Real get-uri completes successfully using only the trusted
  control-host payload; the alternate host receives **zero connections**. This
  proves host pinning, rather than treating a closed port as proof of security.
  The child must finish without a timeout; an unrelated error or hang is not
  accepted as a security pass.

Both cases execute real get-uri in a bounded child with
`--unhandled-rejections=strict`. They require exit zero and the expected trusted
payload, without suppressing rejections or enabling separate-host opt-out.
Get-uri attaches no rejection handler to its asynchronous `downloadTo` promise;
a genuinely incompatible FTP setup may therefore fail its tooling process. The
loopback test does not claim that failure mode is user-friendly or hide it.

Both tests are included in `npm run test:release-tools`, so ordinary CI and the
unsigned release workflow retain the gate. All existing link/Markdown/tooling,
type/unit/build/package checks are rerun after clean installation.

### Current audit and removal condition

After this override, npm audit reports **29 findings: zero high, zero critical,
23 moderate and 6 low**. The previous seven high FTP caller-chain findings are
cleared. Moderate/low host/tooling findings listed earlier remain; this is not a
clean audit or a waiver of the parent-owned exact-source OSV/validator rerun.

Remove this override once maintained get-uri releases natively declare a fixed
basic-ftp 6-or-newer range **and every installed caller chain can resolve those
releases compatibly**. Update through those supported caller ranges, retain the
loopback tests, then rerun clean install, link/tool checks, npm audit and the
exact-source official validator before removing the exception. Do not relax
transfer-host validation to make an unsupported remote FTP setup work.

## Integration verification

After a fresh integration install, all 408 Jest tests, 9 fixture tests and
5 release-tool tests pass, along with types, lint, formatting, repository,
Markdown, link, secret, build and local archive checks. The FTP subprocess
checks wait for `close`, so stdout/stderr are fully drained before assertions.

The integrator reran official Grafana plugin validator 0.53.6 against the
packaged plugin and an exact committed source ZIP. Self-checks confirmed the
ZIP was fetched and its lockfile was actually scanned. There are no source-map
mismatches or high-severity OSV findings. The remaining results are the expected
unsigned-plugin warning and the unregistered `lihorhub` publisher warning/error
(`organization not found`). This is not an overall passing catalog validation
or permission to sign/publish. The 23 moderate and 6 low npm findings remain.

Browser compatibility results belong to the PR's real Grafana matrix; local
checks and source-aware validation do not replace browser or clean-install
acceptance. The existing Minikube installation has not been replaced by this
integrated feature branch.

## Signing-tool v4 migration

`@grafana/sign-plugin` v4 replaces its proxy-agent dependency with Node's native
proxy support. Its upstream migration guide requires Node 24.15.0 or later;
this repository now selects Node 24 in `.nvmrc` and requires
`>=24.15.0 <25` in `package.json`. CI and API-compatibility jobs read `.nvmrc`
rather than maintaining separate Node-major settings. This supersedes the
historical Node 22 development baseline above, not the Grafana or Langfuse
runtime requirements.

Removing the signing tool's proxy-agent chain also removes the root-hoisted
`get-uri` package. The link-checking tools still contain two real proxy chains:
`markdown-link-check → proxy-agent → pac-proxy-agent → get-uri` and
`link-check → proxy-agent → pac-proxy-agent → get-uri`. The FTP regression tests
resolve each adapter through its actual caller with `createRequire`, so the
suite no longer depends on npm hoisting. Both same-host transfers and rejection
of an advertised alternate data host are tested for each chain. Missing adapters
fail the tests; no security test is skipped and no obsolete dependency is
reintroduced solely for testing. The exact `basic-ftp: 6.2.6` override remains.

Signing, credential use, release publication and catalog submission remain
separate privileged actions. Toolchain migration does not authorize any of them.
