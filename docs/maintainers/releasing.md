# Release runbook

This runbook prepares and publishes a plugin release. It does not authorize a
release. Changing repository visibility, pushing a tag, publishing an artifact,
using signing credentials, and submitting to Grafana each require explicit
maintainer approval for that release.

The repository is currently pre-release and has no runnable plugin package.
Stop at the first gate until the implementation, package manifest, workflows,
and commands it requires exist.

## Release principles

- Build once, test the exact artifact, and publish it without replacement.
- Use Semantic Versioning and keep the package, `plugin.json`, tag, archive, and
  changelog versions consistent.
- Base every compatibility or security claim on fresh release-candidate
  evidence.
- Use synthetic test data and keep release output free of credentials and
  private infrastructure details.
- Prefer a new patch release over changing an artifact attached to an existing
  version.
- Stop on incomplete evidence; release dates are not correctness deadlines.

## Gate 1: scope and source readiness

1. Confirm the release has an approved specification and completed
   implementation plan.
2. Confirm all included behavior is documented and no planned behavior is
   described as released.
3. Confirm the release candidate is the intended commit on the default branch:

   ```bash
   git branch --show-current
   git status --short
   git log -1 --format='%H %s'
   ```

4. Stop if the branch is not `main`, the worktree is dirty, or the commit has
   not passed review.
5. Review the diff from the previous release tag. For the first release, review
   the complete source tree.
6. Confirm `README.md`, `SECURITY.md`, `SUPPORT.md`, `CONTRIBUTING.md`,
   `CHANGELOG.md`, `LICENSE`, and `NOTICE` describe the candidate accurately.

## Gate 2: version and compatibility

For the first release, set the release version to `0.1.0`. For later releases,
choose the semantic version from the compatibility and behavior change, not
from the size of the diff.

1. Compare version-bearing files after the implementation creates them:

   ```bash
   jq -r '.version' package.json
   jq -r '.info.version' src/plugin.json
   jq -r '.dependencies.grafanaDependency' src/plugin.json
   ```

2. Confirm the package and plugin versions match the intended tag without the
   leading `v`.
3. Confirm the minimum Grafana dependency and Langfuse v4 requirement match the
   README and compatibility documentation.
4. Run the complete end-to-end suite on Grafana 12.3.0 and every additional
   Grafana version named in the repository's supported matrix.
5. Test Langfuse Cloud and the documented self-hosted Langfuse v4 fixture or
   environment.
6. Verify saved-secret preservation and reset, authentication failure,
   cancellation, pagination ceilings, partial target failure, variable
   interpolation, and every advertised data-frame output.

Stop if any documented environment lacks passing evidence.

## Gate 3: native quality checks

Use scripts from the candidate's locked `package.json`. Do not substitute
ad-hoc commands for a missing release gate.

```bash
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
npm run e2e
```

Run the Grafana plugin validator against the production output using the
repository-pinned command or workflow. Confirm that the validator reports no
blocking findings.

Inspect the actual GitHub Actions run and require successful jobs for:

- repository readiness;
- formatting or linting;
- TypeScript type checking;
- unit tests;
- production build;
- plugin validation; and
- the supported Grafana end-to-end matrix.

Stop if a script is missing, skipped, flaky, or succeeds only against output
different from the release candidate.

## Gate 4: security, dependencies, and licensing

1. Review dependency changes, the lockfile, production dependency audit, and
   repository dependency alerts.
2. Review third-party licenses and notices for every dependency included in the
   browser bundle or release ZIP.
3. Review GitHub secret-scanning results and run the repository's local secret
   scanner when configured.
4. Search the source and built output for real credential prefixes, private
   hosts, authorization headers, cookies, personal information, and captured
   customer payloads.
5. Inspect source maps and fixtures as carefully as executable bundles.
6. Confirm the browser bundle cannot read the saved Langfuse secret and that
   errors and logs redact request authorization.
7. Confirm plugin-owned code exposes no mutation or generic request method.

Stop on an unexplained dependency, incompatible license, secret-like value, or
unreviewed security finding.

## Gate 5: package contents and provenance

Follow Grafana's current
[packaging guidance](https://grafana.com/developers/plugin-tools/publish-a-plugin/package-a-plugin)
and [build automation guidance](https://grafana.com/developers/plugin-tools/publish-a-plugin/build-automation).

1. Build from the reviewed commit in a clean GitHub Actions runner.
2. Ensure the ZIP has one top-level directory named
   `lihorhub-langfuse-datasource`.
3. Confirm that directory contains the production module, `plugin.json`,
   `README.md`, `CHANGELOG.md`, `LICENSE`, required images, and any generated
   manifest expected for the applicable signature stage.
4. Reject development configuration, tests, credentials, caches, and unrelated
   source files from the distributable archive.
5. Generate the SHA1 required by Grafana's submission form and a SHA256 for
   users:

   ```bash
   shasum -a 1 lihorhub-langfuse-datasource-0.1.0.zip
   shasum -a 256 lihorhub-langfuse-datasource-0.1.0.zip
   unzip -l lihorhub-langfuse-datasource-0.1.0.zip
   ```

6. Retain GitHub build provenance for the artifact.

Grafana's current
[signing guidance](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin)
states that the first public submission does not need a signature before
review; approval assigns the public signature level. Re-read the current page
immediately before submission. Store `GRAFANA_ACCESS_POLICY_TOKEN` only as an
encrypted GitHub Actions secret, and never print or copy it into an issue,
artifact, or local transcript.

## Gate 6: clean-environment acceptance

1. Download the ZIP and checksums from the draft GitHub release rather than
   reusing a local build.
2. Verify both checksums.
3. Install the downloaded archive in a clean instance of the minimum supported
   Grafana version.
4. Start the documented Docker Compose test environment and provision the
   synthetic data source and sample dashboard.
5. Follow the README as a new user would: configure credentials, run Save &
   Test, execute each query kind, use a variable, and inspect the advertised
   visualizations.
6. Repeat the documented current-version smoke test.
7. Confirm the browser console, Grafana logs, and fixture logs contain no
   credentials.

Stop if the documentation needs undocumented knowledge or the downloaded
artifact behaves differently from the tested build.

## Gate 7: publication authorization

Present the maintainer with:

- release version and commit SHA;
- changelog and release notes;
- CI, compatibility, validator, dependency, license, and security results;
- artifact URLs and SHA1/SHA256 values;
- clean-install evidence;
- known limitations; and
- the proposed Grafana testing guidance.

Obtain separate explicit approval before each of these actions:

1. making the source repository public;
2. applying repository and security settings;
3. pushing the version tag;
4. publishing the draft GitHub release;
5. using a signing credential when the current Grafana process requires it; and
6. submitting the artifact to Grafana.

Preparation approval is not publication approval.

## Gate 8: public source and GitHub release

After authorization:

1. Apply and test the settings in [GitHub repository settings](github-settings.md).
2. Make the repository public and immediately confirm private vulnerability
   reporting, secret scanning, push protection, Issues, and the `main` ruleset.
3. Remove the private-repository URL exceptions from
   `.markdown-link-check.json`, then verify the live Issues, Security, and
   changelog comparison links.
4. Create and push the version tag from the reviewed commit using the
   repository's release workflow.
5. Wait for the release workflow to produce the draft release, artifact,
   checksums, and provenance.
6. Repeat the checksum and clean-install checks on the final draft assets.
7. Publish the GitHub release without replacing the validated files.

## Gate 9: Grafana catalog submission

Use the procedure and prepared copy in
[Grafana catalog launch](grafana-catalog-launch.md). Submit through Grafana
Cloud **My Plugins** with the immutable archive URL, public source URL, SHA1,
testing guidance, and provisioning details requested by the current form.

Treat review findings as release work:

- fix source through the ordinary review path;
- publish a new patch version and immutable artifact;
- update the submission to that artifact; and
- keep the previous release and its findings auditable.

Do not replace an archive at an existing URL.

## Gate 10: post-release transition

After the GitHub artifact is verified and the maintainer is ready to review
external code:

1. Update `CONTRIBUTING.md`, the pull-request template, and README to announce
   that pull requests are open.
2. Confirm required status checks are enforced on `main`.
3. Publish the Grafana catalog URL in the repository Homepage and README after
   catalog approval.
4. Follow the catalog launch and community announcement plan.
5. Triage early reports using the repository workflow labels.

## Rollback and incident response

- Stop promotion immediately when a release is unsafe or materially broken.
- Mark the GitHub release and README with a concise warning without deleting
  investigation evidence.
- Coordinate catalog deprecation or removal through Grafana's current process
  when users must not install the version.
- Rotate any exposed credential outside the repository before publishing a
  retrospective.
- Fix forward with a reviewed patch release; do not rewrite tags or replace
  existing release assets.
- Document user impact, affected versions, mitigation, and recovery without
  exposing reporter or customer data.
