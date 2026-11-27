# PR response template

Use title `fix(TRACK): <specific compatibility correction>` or
`chore(TRACK): <specific tooling compatibility correction>`.

```markdown
<!-- upstream-compatibility:TRACK -->

## Upstream evidence

- Source release(s), immutable commit(s) and official links:
- Relevant contract/deprecation difference:
- Why this affects our existing supported behavior:

## Changes and risk

- Smallest corrective change:
- Regression that failed before the fix:
- Saved-query, proxy-security and cancellation impact:
- Documentation/changelog and any reviewed baseline advance:
- Risk and manual verification steps:

## Verification

- Exact local commands, results and tested source SHA:
- Known warnings, retries, skipped checks and limitations:
- Normal GitHub compatibility and six-host E2E checks still required.

## Deferred

- Other upstream changes and linked human-decision issues:
- No support-floor increase, adapter switch, signing, publication or automatic merge.
```
