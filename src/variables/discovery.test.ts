import type { LangfuseObservabilityClient } from '../client/types';
import { createDiscoveryQueryRunner } from './discovery';
import { DISCOVERY_DIMENSIONS, type DiscoveryQuery } from './types';

describe('bounded dimension discovery', () => {
  afterEach(() => jest.useRealTimers());
  it('discovers deterministic unique environments with one count request and a default 24h lookback', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00Z'));
    const queryMetrics = jest.fn().mockResolvedValue({
      data: [{ environment: 'staging' }, { environment: 'prod' }, { environment: 'prod' }, { environment: null }],
    });
    const run = createDiscoveryQueryRunner({ queryMetrics } as unknown as LangfuseObservabilityClient);
    await expect(run({ view: 'observations', dimension: 'environment' })).resolves.toEqual([
      { text: 'prod', value: 'prod' },
      { text: 'staging', value: 'staging' },
    ]);
    expect(queryMetrics).toHaveBeenCalledTimes(1);
    expect(JSON.parse(queryMetrics.mock.calls[0][0].query)).toEqual({
      view: 'observations',
      dimensions: [{ field: 'environment' }],
      orderBy: [{ field: 'environment', direction: 'asc' }],
      metrics: [{ measure: 'count', aggregation: 'count' }],
      filters: [],
      fromTimestamp: '2026-08-04T12:00:00.000Z',
      toTimestamp: '2026-08-05T12:00:00.000Z',
      config: { row_limit: 1000 },
    });
  });

  it('supports every declared view/dimension and all five bounded lookbacks', async () => {
    const queryMetrics = jest.fn().mockResolvedValue({ data: [] });
    const run = createDiscoveryQueryRunner({ queryMetrics } as unknown as LangfuseObservabilityClient);
    for (const [view, dimensions] of Object.entries(DISCOVERY_DIMENSIONS)) {
      for (const dimension of dimensions) {
        await expect(run({ view, dimension } as DiscoveryQuery)).resolves.toEqual([]);
        expect(JSON.parse(queryMetrics.mock.calls.at(-1)![0].query)).toMatchObject({
          view,
          dimensions: [{ field: dimension }],
        });
      }
    }
    for (const [lookback, hours] of [
      ['1h', 1],
      ['6h', 6],
      ['24h', 24],
      ['7d', 168],
      ['30d', 720],
    ] as const) {
      await createDiscoveryQueryRunner({ queryMetrics } as unknown as LangfuseObservabilityClient)({
        view: 'observations',
        dimension: 'environment',
        lookback,
      });
      const request = JSON.parse(queryMetrics.mock.calls.at(-1)![0].query);
      expect(Date.parse(request.toTimestamp) - Date.parse(request.fromTimestamp)).toBe(hours * 3_600_000);
    }
  });

  it.each([
    { view: 'observations', dimension: 'traceId' },
    { view: 'observations', dimension: 'observationId' },
    { view: 'observations', dimension: 'userId' },
    { view: 'observations', dimension: 'sessionId' },
    { view: 'scores-numeric', dimension: 'tags' },
    { view: 'observations', dimension: 'name', lookback: '90d' },
    { view: 'observations', dimension: 'name', filters: [] },
    { view: '__proto__', dimension: 'name' },
  ])('rejects unsupported query before requesting: %j', async (query) => {
    const queryMetrics = jest.fn();
    const run = createDiscoveryQueryRunner({ queryMetrics } as unknown as LangfuseObservabilityClient);
    await expect(run(query as DiscoveryQuery)).rejects.toThrow(/supported/);
    expect(queryMetrics).not.toHaveBeenCalled();
  });

  it('flattens tags and converts numeric prompt versions without losing values', async () => {
    const queryMetrics = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ tags: ['z', 'a'] }, { tags: ['a'] }] })
      .mockResolvedValueOnce({ data: [{ promptVersion: 2 }, { promptVersion: 0 }] });
    const run = createDiscoveryQueryRunner({ queryMetrics } as unknown as LangfuseObservabilityClient);
    await expect(run({ view: 'observations', dimension: 'tags' })).resolves.toEqual([
      { text: 'a', value: 'a' },
      { text: 'z', value: 'z' },
    ]);
    await expect(run({ view: 'observations', dimension: 'promptVersion' })).resolves.toEqual([
      { text: '0', value: '0' },
      { text: '2', value: '2' },
    ]);
  });

  it.each([
    {},
    { data: null },
    { data: [null] },
    { data: [{}] },
    { data: [{ name: {} }] },
    { data: [{ name: Infinity }] },
    { data: Array.from({ length: 1001 }, () => ({ name: 'x' })) },
  ])('rejects malformed response and cleans the cache', async (response) => {
    const queryMetrics = jest.fn().mockResolvedValueOnce(response).mockResolvedValueOnce({ data: [] });
    const run = createDiscoveryQueryRunner({ queryMetrics } as unknown as LangfuseObservabilityClient);
    await expect(run({ view: 'observations', dimension: 'name' })).rejects.toThrow(/incompatible/);
    await expect(run({ view: 'observations', dimension: 'name' })).resolves.toEqual([]);
    expect(queryMetrics).toHaveBeenCalledTimes(2);
  });
});
