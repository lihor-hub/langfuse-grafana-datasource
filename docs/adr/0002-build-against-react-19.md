# ADR-0002: Build against React 19 while supporting React 18 hosts

- Status: Accepted
- Date: 2026-11-21

## Context

Starting with 13.2, `@grafana/data`, `@grafana/ui`, `@grafana/runtime` and
`@grafana/i18n` declare a peer dependency on React 19. The plugin pinned React
18, so it could not install Grafana 13.2 or later packages.

The plugin declares `grafanaDependency: ">=12.3.0"`. Grafana 12.3 through 13.1
hosts provide React 18, and later hosts provide React 19. Grafana supplies
`react`, `@grafana/data`, `@grafana/ui` and `@grafana/runtime` to the plugin as
webpack externals, so the plugin's development dependencies select the types
and test environment, not the runtime copies.

## Decision

Build and test against React 19 and the current Grafana packages. Keep the
declared Grafana minimum at 12.3.0.

To stay compatible with React 18 hosts, plugin code must:

- compile JSX to `React.createElement` against the externalized host React, so
  no React 19 JSX runtime is bundled;
- avoid React 19-only APIs such as `use`, `useActionState`, `useOptimistic`,
  `useFormStatus`, `ref` as a plain function-component prop and context
  objects rendered as providers; and
- avoid Grafana package APIs that are missing from the declared minimum
  version.

CI's browser test matrix, which runs from the declared minimum Grafana version
through the latest, provides the compatibility evidence. If it fails on a React
18 host, raise `grafanaDependency` deliberately instead of weakening the test
matrix.

## Consequences

- Dependabot can keep proposing Grafana package updates without React peer
  conflicts.
- Jest now transforms ESM-only `@react-hookz/web` and `@ver0/deep-equal`, which
  the CommonJS builds of the Grafana 13.2 and later packages require.
- Unit tests run on React 19, so React 18 behavior is covered only by the
  browser test matrix.
