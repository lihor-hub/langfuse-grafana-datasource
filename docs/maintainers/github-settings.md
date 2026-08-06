# GitHub repository settings

This document records the intended settings for
`lihor-hub/langfuse-grafana-datasource`. It is a maintainer runbook, not an
automation trigger. Repository visibility and protection may change only with
explicit maintainer authorization.

## Prepared private state

| Setting | Value |
| --- | --- |
| Visibility | Private |
| Description | Grafana data source plugin for exploring Langfuse observability data. |
| Topics | `grafana`, `grafana-datasource`, `grafana-plugin`, `langfuse`, `observability`, `monitoring`, `typescript` |
| Homepage | Unset until the official Grafana catalog page exists |
| Issues | Enabled |
| Wiki | Disabled |
| Discussions | Disabled |
| Delete head branches after merge | Enabled |

Confirm the live state without changing it:

```bash
gh repo view lihor-hub/langfuse-grafana-datasource \
  --json description,visibility,homepageUrl,repositoryTopics,hasIssuesEnabled,hasWikiEnabled,hasDiscussionsEnabled,deleteBranchOnMerge
```

## Default-branch protection

`.github/rulesets/main.json` contains the prepared `Protect main` repository
ruleset. A checked-in ruleset file is inert: GitHub does not automatically read
or apply it.

The template targets the default branch and:

- blocks deletion and non-fast-forward pushes;
- requires linear history;
- requires a pull request with one approval;
- dismisses stale approvals after new commits;
- requires code-owner review and approval by someone other than the last
  pusher;
- requires resolution of review conversations; and
- permits squash and rebase merges, but not merge commits.

Automatic deletion of a pull request's head branch after merge is a separate
repository setting, not a ruleset rule. It is enabled to keep merged branches
from accumulating. GitHub does not delete protected branches or branches that
are still open in another pull request.

There are deliberately no bypass actors. Before activation, decide and document
how emergency recovery will work without silently weakening routine protection.

## Why activation is deferred

GitHub currently returns HTTP 403 when rulesets are queried for this private
repository because the repository's current plan does not provide that feature.
Do not make the repository public merely to work around that restriction.

Protection activation also waits for stable CI job names. Before applying the
ruleset, update its `rules` array with required status checks for:

- formatting or linting;
- TypeScript type checking;
- unit tests;
- production build;
- Grafana plugin validation; and
- the supported Grafana end-to-end matrix.

Use the exact job names reported by successful runs on the default branch. Do
not guess names or require checks that have never completed successfully.

## Activation procedure

Stop unless the maintainer has explicitly authorized ruleset activation.

1. Confirm the repository is public or its plan supports rulesets.
2. Confirm `@ioachim-hub` resolves as the owner in `.github/CODEOWNERS`.
3. Confirm all required CI jobs have stable names and are encoded in the
   template.
4. Review the template and emergency-access decision in GitHub's ruleset UI or
   current REST API documentation.
5. Apply the reviewed request body:

   ```bash
   gh api --method POST \
     repos/lihor-hub/langfuse-grafana-datasource/rulesets \
     --input .github/rulesets/main.json
   ```

6. Record the returned ruleset ID, then inspect the effective rules:

   ```bash
   gh api repos/lihor-hub/langfuse-grafana-datasource/rulesets/RULESET_ID
   ```

7. Open a test pull request and verify approval, code-owner, conversation,
   merge-method, and required-check behavior before opening contributions.

`RULESET_ID` is a value returned by GitHub, not text to copy literally.

## Public-release settings

Immediately before the explicit public-release decision:

- enable private vulnerability reporting;
- enable secret scanning and push protection when available;
- confirm the ruleset is active and tested;
- keep Issues enabled;
- keep Wiki disabled; and
- enable Discussions only after support volume justifies a separate forum.

After Grafana accepts the plugin, set Homepage to the canonical Grafana catalog
URL. Do not use a temporary release URL as the homepage.
