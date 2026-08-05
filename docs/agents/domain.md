# Domain documentation

This repository uses a single project context.

Before implementation or diagnosis, read these files when they exist:

- `CONTEXT.md` at the repository root for canonical domain language.
- Relevant decisions under `docs/adr/`.
- The approved feature specifications under `docs/superpowers/specs/`.
- The active implementation plan under `docs/superpowers/plans/`.

Proceed silently when `CONTEXT.md` or `docs/adr/` does not yet exist. Those
documents are created only when the project has domain language or architectural
decisions that need a durable home.

Use the specification's terms consistently: data source, observability query,
metrics, observations, scores, discovery query, and read-only client. Surface
any planned behavior that contradicts an accepted specification or ADR.
