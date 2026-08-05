# Issue tracker: GitHub

Issues and implementation plans for this repository live in GitHub Issues at
`lihor-hub/langfuse-grafana-datasource`. Use the `gh` CLI for issue operations
when a GitHub connector is unavailable.

## Conventions

- Create dependency-ordered, end-to-end tracer-bullet issues.
- Apply `ready-for-agent` only when the acceptance criteria and dependencies
  let an AFK agent implement the issue without additional product decisions.
- Reference blockers by GitHub issue number.
- Never place Langfuse public keys, secret keys, Grafana tokens, or private host
  details in issues or comments.
- Read issues with comments and labels before changing their state.

Infer the repository from `git remote -v` when running `gh` inside this clone.
