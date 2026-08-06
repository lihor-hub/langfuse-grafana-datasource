# Langfuse data source for Grafana

A frontend-only, read-only Grafana data source for Langfuse v4 observability
data. Langfuse API credentials are stored by Grafana and attached server-side
by the Grafana data proxy; the browser plugin receives only the proxy URL.

## Requirements

- Grafana 12.3.0 or newer
- Langfuse v4
- Node.js 22 for development

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
```

To run the Grafana end-to-end environment, supply runtime-only credentials and
start the generated Compose stack:

```bash
export LANGFUSE_E2E_PUBLIC_KEY=pk-e2e
export LANGFUSE_E2E_SECRET="$(openssl rand -hex 32)"
npm run server
npm run e2e
```

Do not commit those values or place them in provisioning files.
