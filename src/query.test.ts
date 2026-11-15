import { dateTime, type DataQueryRequest, type DataSourceInstanceSettings } from '@grafana/data';
import { lastValueFrom } from 'rxjs';

import { LangfuseClientError } from './client/errors';
import type { LangfuseObservabilityClient } from './client/types';
import { DataSource } from './datasource';
import type { LangfuseDataSourceOptions, LangfuseQuery } from './types';

const settings = {
  uid: 'demo-langfuse',
  url: '/api/datasources/proxy/uid/demo-langfuse',
  jsonData: {},
} as DataSourceInstanceSettings<LangfuseDataSourceOptions>;

function request(targets: LangfuseQuery[]): DataQueryRequest<LangfuseQuery> {
  return {
    targets,
    intervalMs: 3_600_000,
    range: {
      from: dateTime('2026-11-01T00:00:00Z'),
      to: dateTime('2026-11-02T00:00:00Z'),
      raw: { from: 'now-1d', to: 'now' },
    },
  } as DataQueryRequest<LangfuseQuery>;
}

function client(queryMetrics: LangfuseObservabilityClient['queryMetrics']): LangfuseObservabilityClient {
  return { queryMetrics, checkConnection: jest.fn(), listObservations: jest.fn(), listScores: jest.fn() };
}

it('executes real query models, skips hidden targets and never sends invalid JSON', async () => {
  const queryMetrics = jest
    .fn()
    .mockResolvedValue({ data: [{ time_dimension: '2026-11-01T00:00:00Z', count_count: 7 }] });
  const datasource = new DataSource(settings, () => client(queryMetrics));
  const result = await lastValueFrom(
    datasource.query(request([{ refId: 'A' }, { refId: 'B', hide: true }, { refId: 'C', metricsQuery: '{' }]))
  );
  expect(queryMetrics).toHaveBeenCalledTimes(1);
  expect(result.data[0].fields[1].values).toEqual([7]);
  expect(result.data[0].meta?.notices).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('C: Invalid Langfuse query or filter.') }),
    ])
  );
});

it('sanitizes failed targets and preserves successful empty frames', async () => {
  const queryMetrics = jest
    .fn()
    .mockResolvedValueOnce({ data: [] })
    .mockRejectedValueOnce(new LangfuseClientError('rate-limit', 'sk-do-not-expose', 429));
  const datasource = new DataSource(settings, () => client(queryMetrics));
  const result = await lastValueFrom(datasource.query(request([{ refId: 'A' }, { refId: 'B' }])));
  expect(result.data).toHaveLength(1);
  expect(result.data[0].length).toBe(0);
  expect(JSON.stringify(result)).toContain('rate limit');
  expect(JSON.stringify(result)).not.toContain('sk-do-not-expose');
});

it('rejects all-failed queries with a safe error rather than returning an empty success', async () => {
  const datasource = new DataSource(settings, () => client(jest.fn().mockRejectedValue(new Error('sk-do-not-expose'))));
  await expect(lastValueFrom(datasource.query(request([{ refId: 'A' }])))).rejects.toThrow('Langfuse query failed');
  await expect(
    lastValueFrom(datasource.query(request([{ refId: 'A', kind: 'observations', observationsQuery: '{' }])))
  ).rejects.toThrow('Invalid Langfuse query');
});

it('caps concurrent targets at four and aborts them on unsubscribe', () => {
  const signals: AbortSignal[] = [];
  const queryMetrics = jest.fn((_request, signal?: AbortSignal) => {
    signals.push(signal!);
    return new Promise<never>(() => {});
  });
  const datasource = new DataSource(settings, () => client(queryMetrics));
  const subscription = datasource
    .query(request(Array.from({ length: 7 }, (_, i) => ({ refId: String(i) }))))
    .subscribe();
  expect(queryMetrics).toHaveBeenCalledTimes(4);
  subscription.unsubscribe();
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});
