# Upstream compatibility standing feedback

Loaded by the Pi actuator after the deterministic controller. Maintainers may
edit this file to steer future runs. Keep durable preferences here, not secrets
or individual-run logs. Repository rules and the skill remain authoritative.

- Prefer focused compatibility fixes over modernization. A newer release is
  evidence to inspect, not evidence that a change is required.
- Production uses Grafana's native HTTP adapter (ADR-0001). Langfuse SDK version
  updates do not automatically update our plugin-owned API types.
- Keep minimum-supported Grafana coverage, secure proxy authentication,
  cancellation, bounded pagination and saved-query regressions.
- Dependabot owns package-only bumps. Do not repeat its PRs or reintroduce the
  known incompatible ESLint/stylistic major migrations without human review.
- Synthetic fixtures do not certify every real Langfuse installation. Preserve
  that distinction in PRs and public compatibility documentation.
- The unpublished plugin's unsigned validator warning is expected during initial
  catalog review; never "fix" it by signing or changing release credentials.
- Review existing automation runs and upstream-decision issues before repeating
  an irrelevant finding or a deferred migration. A declined decision remains
  declined until a maintainer changes it.
