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

server.listen(8080, '0.0.0.0', () => {
  console.log(`mock-langfuse ready (${mode})`);
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
    sendJson(response, 200, {
      data: [
        {
          id: 'observation-e2e',
          traceId: 'trace-e2e',
          startTime: '2026-08-05T11:30:00.000Z',
          projectId: 'project-e2e',
          type: 'SPAN',
        },
      ],
      meta: {},
    });
    return;
  }

  if (url.pathname === '/api/public/v2/metrics') {
    const delayMs = Math.min(Number(url.searchParams.get('delayMs') ?? 0), 10_000);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (event.aborted) {
        return;
      }
    }
    sendJson(response, 200, { data: [{ count_count: 7 }] });
    return;
  }

  if (url.pathname === '/api/public/v3/scores') {
    sendJson(response, 200, { data: [], meta: { limit: 50 } });
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
