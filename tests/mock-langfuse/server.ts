import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const publicKey = requiredEnvironment('LANGFUSE_E2E_PUBLIC_KEY');
const secretKey = requiredEnvironment('LANGFUSE_E2E_SECRET');
const mode = process.env.LANGFUSE_E2E_MODE ?? 'normal';

type RecordedRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  authAccepted: boolean;
  aborted: boolean;
};

const events: RecordedRequest[] = [];

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(Number(process.env.LANGFUSE_E2E_PORT ?? 8080), '0.0.0.0', () => {
  const address = server.address();
  console.log(`mock-langfuse ready (${mode}) port=${typeof address === 'object' ? address?.port : address}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://mock-langfuse');

  if (url.pathname === '/__test/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (url.pathname === '/__test/requests') {
    sendJson(response, 200, { events });
    return;
  }

  const authAccepted = acceptsBasicAuth(request.headers.authorization);
  const event: RecordedRequest = {
    method: request.method ?? 'GET',
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    authAccepted,
    aborted: false,
  };
  events.push(event);
  response.on('close', () => {
    if (!response.writableEnded) {
      event.aborted = true;
    }
  });

  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'read-only mock' });
    return;
  }
  if (!authAccepted) {
    sendJson(response, 401, { error: 'unauthorized' });
    return;
  }

  const scenario = fixtureScenario(url);
  const delay = Number(url.searchParams.get('delayMs') ?? (scenario === 'delay' ? 1500 : 0));
  const delayMs = Number.isFinite(delay) ? Math.max(0, Math.min(delay, 10_000)) : 0;
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (event.aborted) {
      return;
    }
  }
  const failures: Record<string, number> = {
    'rate-limit': 429,
    forbidden: 403,
    'server-error': 503,
    'url-too-long': 414,
  };
  if (failures[scenario]) {
    if (scenario === 'rate-limit') {
      response.setHeader('retry-after', '2');
    }
    sendJson(response, failures[scenario], { error: `Synthetic ${scenario}` });
    return;
  }
  if (scenario === 'malformed') {
    sendJson(response, 200, { data: 'not-an-array', meta: {} });
    return;
  }
  if (scenario === 'empty') {
    sendJson(response, 200, { data: [], meta: { limit: 100 } });
    return;
  }

  if (url.pathname === '/api/public/projects') {
    sendJson(response, 200, {
      data: [
        {
          id: 'project-e2e',
          name: 'E2E project',
          organization: { id: 'organization-e2e', name: 'E2E organization' },
          metadata: {},
        },
      ],
    });
    return;
  }

  if (url.pathname === '/api/public/v2/observations') {
    if (mode === 'no-v2') {
      sendJson(response, 404, { error: 'not found' });
      return;
    }
    sendPage(response, url, observationFixtures(url), 1000);
    return;
  }

  if (url.pathname === '/api/public/v2/metrics') {
    try {
      const query = JSON.parse(url.searchParams.get('query') ?? '{}') as {
        view: string;
        metrics: Array<{ measure: string; aggregation: string }>;
        dimensions?: Array<{ field: string }>;
        timeDimension?: { granularity: string };
        fromTimestamp: string;
        toTimestamp: string;
      };
      if (
        !['observations', 'scores-numeric', 'scores-categorical'].includes(query.view) ||
        !query.metrics?.length ||
        !Number.isFinite(Date.parse(query.fromTimestamp)) ||
        !Number.isFinite(Date.parse(query.toTimestamp))
      ) {
        sendJson(response, 400, { error: 'invalid metrics query' });
        return;
      }
      const samples = query.timeDimension || scenario === 'discovery' ? [0, 1] : [0];
      const data = samples.map((index) => {
        const row: Record<string, unknown> = {};
        if (query.timeDimension) {
          const from = Date.parse(query.fromTimestamp);
          row.time_dimension = new Date(from + (index * (Date.parse(query.toTimestamp) - from)) / 2).toISOString();
        }
        for (const { field } of query.dimensions ?? []) {
          const dimensions: Record<string, unknown[]> = {
            environment: ['synthetic', 'staging'],
            providedModelName: ['demo-model', 'demo-model-small'],
            type: ['GENERATION', 'SPAN'],
            name: ['demo-operation', 'demo-tool'],
            tags: [['demo'], ['synthetic']],
            release: ['demo-release', 'demo-release-next'],
            promptName: ['demo-prompt', 'demo-prompt-next'],
            promptVersion: [1, 2],
            scoreName: ['demo-quality', 'demo-helpful'],
            dataType: ['NUMERIC', 'BOOLEAN'],
            source: ['API', 'ANNOTATION'],
          };
          row[field] = dimensions[field]?.[scenario === 'discovery' ? index : 0] ?? 'demo-operation';
        }
        for (const { measure, aggregation } of query.metrics) {
          row[`${aggregation}_${measure}`] =
            aggregation === 'histogram'
              ? [
                  [0, 100, 3 + index],
                  [100, 200, 7 + index],
                ]
              : measure === 'count'
                ? 18 + index
                : measure.endsWith('Cost')
                  ? 0.12 + index * 0.02
                  : measure.endsWith('Tokens')
                    ? 120 + index * 20
                    : measure === 'value'
                      ? 0.8 + index * 0.1
                      : aggregation === 'p95'
                        ? 1250 + index * 100
                        : 250 + index * 100;
        }
        return row;
      });
      sendJson(response, 200, { data });
    } catch {
      sendJson(response, 400, { error: 'invalid metrics query' });
    }
    return;
  }

  if (url.pathname === '/api/public/v3/scores') {
    sendPage(response, url, scoreFixtures(url), 100);
    return;
  }

  sendJson(response, 404, { error: 'not found' });
}

function acceptsBasicAuth(authorization: string | undefined): boolean {
  if (!authorization?.startsWith('Basic ')) {
    return false;
  }
  try {
    const decoded = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8');
    return decoded === `${publicKey}:${secretKey}`;
  } catch {
    return false;
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const observationTypes = [
  'SPAN',
  'GENERATION',
  'EVENT',
  'AGENT',
  'TOOL',
  'CHAIN',
  'RETRIEVER',
  'EVALUATOR',
  'EMBEDDING',
  'GUARDRAIL',
];

function observationFixtures(url: URL): Array<Record<string, unknown>> {
  const groups = new Set((url.searchParams.get('fields') ?? 'core,basic,time').split(','));
  return observationTypes
    .map((type, index) => ({
      id: index === 0 ? 'observation-e2e' : `observation-e2e-${index}`,
      traceId: 'trace-e2e',
      projectId: 'project-e2e',
      type,
      name: `demo-${type.toLowerCase()}`,
      level: index === 2 ? 'ERROR' : 'DEFAULT',
      environment: 'synthetic',
      startTime: '2026-08-05T11:30:00.000Z',
      ...(groups.has('basic')
        ? { statusMessage: index === 2 ? 'Synthetic failure' : null, version: '1', parentObservationId: null }
        : {}),
      ...(groups.has('time') ? { endTime: '2026-08-05T11:30:00.250Z' } : {}),
      ...(groups.has('io') ? { input: 'Synthetic input', output: { text: 'Synthetic output' } } : {}),
      ...(groups.has('metadata') ? { metadata: { fixture: true } } : {}),
      ...(groups.has('model') ? { providedModelName: 'demo-model', modelParameters: { temperature: 0 } } : {}),
      ...(groups.has('usage')
        ? { usageDetails: { input: 100, output: 20, total: 120 }, costDetails: { total: 0.01 } }
        : {}),
      ...(groups.has('prompt') ? { promptName: 'demo-prompt', promptVersion: 1 } : {}),
      ...(groups.has('metrics') ? { latency: 0.25, timeToFirstToken: 0.05 } : {}),
      ...(groups.has('trace_context')
        ? { traceName: 'demo-trace', userId: 'synthetic-user', sessionId: 'synthetic-session', release: 'demo-release' }
        : {}),
    }))
    .filter((row) => matchesFilters(row, url));
}

function matchesFilters(row: Record<string, unknown>, url: URL): boolean {
  const structured = url.searchParams.get('filter');
  if (structured) {
    try {
      const filters = JSON.parse(structured);
      return (
        Array.isArray(filters) &&
        filters.every((filter: { column: string; operator: string; value: unknown }) => {
          if (filter.column === 'name' && String(filter.value).startsWith('fixture-')) {
            return true;
          }
          const actual = row[filter.column];
          switch (filter.operator) {
            case '=':
              return actual === filter.value;
            case 'any of':
              return Array.isArray(filter.value) && filter.value.includes(actual);
            case '>=':
              return String(actual) >= String(filter.value);
            case '<':
              return String(actual) < String(filter.value);
            default:
              return false;
          }
        })
      );
    } catch {
      return false;
    }
  }
  for (const field of ['type', 'name', 'level', 'environment', 'dataType', 'source', 'traceId']) {
    const expected = url.searchParams.get(field);
    if (expected && !expected.startsWith('fixture-') && row[field] !== expected) {
      return false;
    }
  }
  return true;
}

function sendPage(response: ServerResponse, url: URL, rows: Array<Record<string, unknown>>, maximum: number) {
  const limit = Number(url.searchParams.get('limit') ?? maximum);
  const cursor = url.searchParams.get('cursor');
  const offset = cursor ? Number(cursor.replace(/^fixture-/, '')) : 0;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > maximum ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    (cursor && !/^fixture-\d+$/.test(cursor))
  ) {
    sendJson(response, 400, { error: 'invalid pagination' });
    return;
  }
  // shortcut: two-row pages exercise pagination with tiny fixtures; use larger generated sets for load testing.
  const end = offset + Math.min(limit, 2);
  sendJson(response, 200, {
    data: rows.slice(offset, end),
    meta: {
      limit,
      ...(fixtureScenario(url) === 'repeated-cursor'
        ? { cursor: 'fixture-2' }
        : end < rows.length
          ? { cursor: `fixture-${end}` }
          : {}),
    },
  });
}

function scoreFixtures(url: URL): Array<Record<string, unknown>> {
  const groups = new Set((url.searchParams.get('fields') ?? '').split(','));
  return ['NUMERIC', 'BOOLEAN', 'CATEGORICAL', 'TEXT', 'CORRECTION']
    .map((dataType, index) => ({
      id: `score-e2e-${index}`,
      projectId: 'project-e2e',
      name: `demo-${dataType.toLowerCase()}`,
      dataType,
      value: [0.85, true, 'helpful', 'Synthetic review', 'Synthetic correction'][index],
      source: 'API',
      environment: 'synthetic',
      timestamp: '2026-08-05T11:30:00.000Z',
      createdAt: '2026-08-05T11:30:00.000Z',
      updatedAt: '2026-08-05T11:30:00.000Z',
      ...(groups.has('details')
        ? { comment: 'Synthetic comment', configId: 'config-e2e', metadata: { fixture: true } }
        : {}),
      ...(groups.has('subject') ? { subject: { kind: 'trace', id: 'trace-e2e' } } : {}),
      ...(groups.has('annotation') ? { authorUserId: 'synthetic-author', queueId: 'synthetic-queue' } : {}),
    }))
    .filter((row) => matchesFilters(row, url));
}

function fixtureScenario(url: URL): string {
  let marker = url.searchParams.get('name') ?? '';
  try {
    const query = JSON.parse(url.searchParams.get('query') ?? '{}');
    const filters = query.filters ?? JSON.parse(url.searchParams.get('filter') ?? '[]');
    const nameFilter = filters.find(
      (filter: { column: string; value: unknown }) =>
        filter.column === 'name' && typeof filter.value === 'string' && filter.value.startsWith('fixture-')
    );
    marker = nameFilter?.value ?? marker;
  } catch {
    /* Invalid query JSON is rejected by the endpoint below. */
  }
  return marker.startsWith('fixture-') ? marker.slice('fixture-'.length) : (url.searchParams.get('__fixture') ?? '');
}
