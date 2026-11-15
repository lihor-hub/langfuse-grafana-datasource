import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { get } from 'node:http';
import { dateTime, DataFrameType } from '@grafana/data';
import { HISTOGRAM_DASHBOARD_TIME, HISTOGRAM_GRANULARITY } from './metrics.testFixtures';
import { buildMetricsQuery, metricsToFrames } from './metrics';

let server: ChildProcessWithoutNullStreams;
let base: string;
beforeAll(async () => {
  server = spawn(process.execPath, ['--experimental-strip-types', 'tests/mock-langfuse/server.ts'], {
    env: {
      ...process.env,
      LANGFUSE_E2E_PORT: '0',
      LANGFUSE_E2E_PUBLIC_KEY: 'synthetic-public',
      LANGFUSE_E2E_SECRET: 'synthetic-secret',
    },
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
  expect(base).toBeDefined();
});
afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
});

async function execute(timed: boolean, time = HISTOGRAM_DASHBOARD_TIME) {
  const range = { from: dateTime(time.from), to: dateTime(time.to), raw: time };
  const query = buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'observations',
        metrics: [{ measure: 'latency', aggregation: 'histogram' }],
        dimensions: [{ field: 'name' }],
        filters: [
          {
            column: 'name',
            type: 'string',
            operator: '=',
            value: timed ? 'fixture-histogram-heatmap' : 'fixture-histogram-table',
          },
        ],
        ...(timed ? { timeDimension: { granularity: HISTOGRAM_GRANULARITY } } : {}),
        config: { bins: 2, row_limit: 25 },
      }),
    },
    range,
    3600000
  );
  const data = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
    get(
      `${base}/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      {
        headers: { Authorization: `Basic ${Buffer.from('synthetic-public:synthetic-secret').toString('base64')}` },
      },
      (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Synthetic mock returned ${response.statusCode}`));
          response.resume();
          return;
        }
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body).data);
          } catch (error) {
            reject(error);
          }
        });
        response.on('error', reject);
      }
    ).on('error', reject);
  });
  return metricsToFrames(data, query, 'A')[0];
}

it('produces heatmap cells from the browser histogram time window and the actual shared mock', async () => {
  const frame = await execute(true);
  expect(frame.meta?.type).toBe(DataFrameType.HeatmapCells);
  expect(frame.meta?.notices?.[0].text).toContain('Histogram output: heatmap');
  expect(frame.fields.map((field) => field.name)).toEqual(['xMin', 'xMax', 'yMin', 'yMax', 'count']);
  expect(frame.fields[4].values).toEqual([3, 7, 4, 8]);
});
it('keeps conservative fallback when the mock samples are not consecutive requested time buckets', async () => {
  const frame = await execute(true, { from: HISTOGRAM_DASHBOARD_TIME.from, to: '2026-11-01T06:00:00Z' });
  expect(frame.meta?.preferredVisualisationType).toBe('table');
  expect(frame.fields.find((field) => field.name === 'time_dimension')?.values).toEqual([
    '2026-11-01T00:00:00.000Z',
    '2026-11-01T03:00:00.000Z',
  ]);
  expect(frame.fields.find((field) => field.name === 'histogram_latency')?.values).toEqual([
    [
      [0, 100, 3],
      [100, 200, 7],
    ],
    [
      [0, 100, 4],
      [100, 200, 8],
    ],
  ]);
});
it('preserves the actual fallback fixture with headers distinct from cell values', async () => {
  const frame = await execute(false);
  expect(frame.meta?.preferredVisualisationType).toBe('table');
  expect(frame.fields.map((field) => field.name)).toEqual(['name', 'histogram_latency']);
  expect(frame.fields[0].values).toEqual(['demo-operation']);
  expect(frame.fields[1].values).toEqual([
    [
      [0, 100, 3],
      [100, 200, 7],
    ],
  ]);
});
