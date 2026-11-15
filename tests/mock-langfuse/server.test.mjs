import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { after, before, test } from 'node:test';

let server;
let base;
const headers = { Authorization: `Basic ${Buffer.from('synthetic-public:synthetic-secret').toString('base64')}` };
before(async () => {
  server = spawn(process.execPath, ['--experimental-strip-types', 'tests/mock-langfuse/server.ts'], {
    env: {
      ...process.env,
      LANGFUSE_E2E_PORT: '0',
      LANGFUSE_E2E_PUBLIC_KEY: 'synthetic-public',
      LANGFUSE_E2E_SECRET: 'synthetic-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for await (const chunk of server.stdout) {
    output += chunk;
    const port = output.match(/port=(\d+)/)?.[1];
    if (port) {
      base = `http://127.0.0.1:${port}`;
      break;
    }
  }
  assert(base, 'mock must announce its ephemeral port');
});
after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
});
const get = (path) => fetch(base + path, { headers });

test('paginated observations preserve probe identity, filter types, and omit unrequested payloads', async () => {
  const first = await (await get('/api/public/v2/observations?limit=2')).json();
  assert.equal(first.data[0].id, 'observation-e2e');
  assert.equal(first.data.length, 2);
  assert.equal(first.data[0].input, undefined);
  assert.equal(typeof first.meta.cursor, 'string');
  const next = await (await get(`/api/public/v2/observations?limit=2&cursor=${first.meta.cursor}`)).json();
  assert.notEqual(next.data[0].id, first.data[0].id);
  const filtered = await (await get('/api/public/v2/observations?type=GENERATION&fields=core,io')).json();
  assert.deepEqual(
    filtered.data.map((row) => row.type),
    ['GENERATION']
  );
  assert.equal(filtered.data[0].input, 'Synthetic input');
});

test('scores paginate every native value type with opt-in details', async () => {
  const rows = [];
  let cursor = '';
  do {
    const page = await (await get(`/api/public/v3/scores?fields=details,subject,annotation&cursor=${cursor}`)).json();
    rows.push(...page.data);
    cursor = page.meta.cursor ?? '';
  } while (cursor);
  assert.deepEqual(
    rows.map((row) => row.dataType),
    ['NUMERIC', 'BOOLEAN', 'CATEGORICAL', 'TEXT', 'CORRECTION']
  );
  assert.deepEqual(
    rows.map((row) => typeof row.value),
    ['number', 'boolean', 'string', 'string', 'string']
  );
  assert.deepEqual(rows[0].metadata, { fixture: true });
  assert.deepEqual(rows[0].subject, { kind: 'trace', id: 'trace-e2e' });
  const core = await (await get('/api/public/v3/scores')).json();
  assert.equal(core.data[0].metadata, undefined);
});

test('valid name filters select empty, malformed, rate limit, repeated cursor and delay scenarios', async () => {
  const empty = await (await get('/api/public/v2/observations?name=fixture-empty')).json();
  assert.deepEqual(empty.data, []);
  const malformed = await (await get('/api/public/v3/scores?name=fixture-malformed')).json();
  assert.equal(malformed.data, 'not-an-array');
  const rateLimit = await get('/api/public/v3/scores?name=fixture-rate-limit');
  assert.equal(rateLimit.status, 429);
  assert.equal(rateLimit.headers.get('retry-after'), '2');
  const first = await (await get('/api/public/v2/observations?name=fixture-repeated-cursor')).json();
  const next = await (
    await get(`/api/public/v2/observations?name=fixture-repeated-cursor&cursor=${first.meta.cursor}`)
  ).json();
  assert.equal(first.meta.cursor, next.meta.cursor);
  const started = Date.now();
  const aborted = get('/api/public/v3/scores?name=fixture-delay');
  assert.equal((await aborted).status, 200);
  assert(Date.now() - started >= 1000);
});

const metricsQuery = (extra = {}) => ({
  view: 'observations',
  metrics: [{ measure: 'count', aggregation: 'count' }],
  fromTimestamp: '2026-08-05T10:00:00Z',
  toTimestamp: '2026-08-05T12:00:00Z',
  ...extra,
});
const metrics = (query) => get('/api/public/v2/metrics?query=' + encodeURIComponent(JSON.stringify(query)));
test('metrics structured filter selects scenarios without undocumented query fields', async () => {
  const response = await metrics(
    metricsQuery({ filters: [{ column: 'name', type: 'string', operator: '=', value: 'fixture-rate-limit' }] })
  );
  assert.equal(response.status, 429);
  const baseline = await (await metrics(metricsQuery({ timeDimension: { granularity: 'hour' } }))).json();
  assert.deepEqual(
    baseline.data.map((row) => row.count_count),
    [18, 19]
  );
});

test('histograms supply real bucket tuples with time only when requested; discovery has distinct dimensions', async () => {
  const query = metricsQuery({
    metrics: [{ measure: 'latency', aggregation: 'histogram' }],
    config: { bins: 2 },
    timeDimension: { granularity: 'hour' },
  });
  const heatmap = await (await metrics(query)).json();
  assert.deepEqual(heatmap.data[0].histogram_latency, [
    [0, 100, 3],
    [100, 200, 7],
  ]);
  assert.equal(heatmap.data[0].time_dimension, '2026-08-05T10:00:00.000Z');
  const table = await (await metrics({ ...query, timeDimension: null })).json();
  assert.equal(table.data[0].time_dimension, undefined);
  assert.deepEqual(table.data[0].histogram_latency, heatmap.data[0].histogram_latency);
  const discovery = await (
    await metrics(
      metricsQuery({
        dimensions: [{ field: 'environment' }],
        filters: [{ column: 'name', type: 'string', operator: '=', value: 'fixture-discovery' }],
      })
    )
  ).json();
  assert.deepEqual(
    discovery.data.map((row) => row.environment),
    ['synthetic', 'staging']
  );
});

test('real-host smoke runs against synthetic HTTP without printing payloads or credentials', async () => {
  const child = spawn(process.execPath, ['--test', 'tests/smoke/real-langfuse.test.mjs'], {
    env: {
      ...process.env,
      LANGFUSE_BASE_URL: base,
      LANGFUSE_PUBLIC_KEY: 'synthetic-public',
      LANGFUSE_SECRET_KEY: 'synthetic-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  assert(!/synthetic-public|synthetic-secret|observation-e2e|demo-span/.test(output));
});

test('structured name/type equality filters take precedence over simple filters', async () => {
  const filter = encodeURIComponent(JSON.stringify([{ column: 'type', type: 'string', operator: '=', value: 'TOOL' }]));
  const rows = await (await get(`/api/public/v2/observations?type=SPAN&filter=${filter}`)).json();
  assert.deepEqual(
    rows.data.map((row) => row.type),
    ['TOOL']
  );
  const scenario = encodeURIComponent(
    JSON.stringify([{ column: 'name', type: 'string', operator: '=', value: 'fixture-empty' }])
  );
  const empty = await (await get(`/api/public/v2/observations?filter=${scenario}`)).json();
  assert.deepEqual(empty.data, []);
});

test('auth and bounds errors do not expose keys; aborts close delayed responses', async () => {
  assert.equal((await fetch(base + '/api/public/projects')).status, 401);
  assert.equal((await fetch(base + '/api/public/projects', { method: 'POST', headers })).status, 405);
  assert.equal((await get('/api/public/v3/scores?limit=101')).status, 400);
  assert.equal((await get('/api/public/v2/observations?cursor=bad')).status, 400);
  const controller = new AbortController();
  const pending = fetch(base + '/api/public/v2/observations?name=fixture-delay&delayMs=5000', {
    headers,
    signal: controller.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const diagnostics = await (await fetch(base + '/__test/requests')).text();
  assert(!/synthetic-public|synthetic-secret|Authorization/.test(diagnostics));
  assert(JSON.parse(diagnostics).events.some((event) => event.query.delayMs === '5000' && event.aborted));
});
