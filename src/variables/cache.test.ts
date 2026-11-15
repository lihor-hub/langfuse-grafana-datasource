import type { LangfuseObservabilityClient, MetricsResponse } from '../client/types';
import { createDiscoveryQueryRunner } from './discovery';

const query = { view: 'observations', dimension: 'name' } as const;
const response = { data: [{ name: 'synthetic' }] };
function deferred() {
  let resolve!: (value: MetricsResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<MetricsResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function runner(queryMetrics: jest.Mock) {
  return createDiscoveryQueryRunner({ queryMetrics } as unknown as LangfuseObservabilityClient);
}

afterEach(() => jest.useRealTimers());

it('shares in-flight work, starts expiry at fulfillment and refreshes at exactly 60 seconds', async () => {
  jest.useFakeTimers().setSystemTime(0);
  const pending = deferred();
  const queryMetrics = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response);
  const run = runner(queryMetrics);
  const first = run(query);
  const second = run({ ...query, lookback: '24h' });
  await Promise.resolve();
  expect(queryMetrics).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(120_000);
  pending.resolve(response);
  expect(await first).toEqual(await second);
  jest.advanceTimersByTime(59_999);
  const values = await run(query);
  values[0].text = 'mutated';
  expect(await run(query)).toEqual([{ text: 'synthetic', value: 'synthetic' }]);
  expect(queryMetrics).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  await run(query);
  expect(queryMetrics).toHaveBeenCalledTimes(2);
});

it('does not cache rejections or share different lookbacks, dimensions, views or instances', async () => {
  const queryMetrics = jest.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(response);
  const run = runner(queryMetrics);
  await expect(run(query)).rejects.toThrow('failed');
  await run(query);
  await run({ ...query, lookback: '1h' });
  queryMetrics.mockResolvedValue({ data: [] });
  await run({ ...query, dimension: 'environment' });
  await run({ ...query, view: 'scores-numeric' });
  await runner(queryMetrics)(query);
  expect(queryMetrics).toHaveBeenCalledTimes(6);
});

it('cancels one subscriber without aborting another; aborts upstream when the last leaves', async () => {
  const pending = deferred();
  const queryMetrics = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response);
  const run = runner(queryMetrics);
  const one = new AbortController();
  const two = new AbortController();
  const first = run(query, { signal: one.signal });
  const second = run(query, { signal: two.signal });
  await Promise.resolve();
  const upstream: AbortSignal = queryMetrics.mock.calls[0][1];
  one.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  expect(upstream.aborted).toBe(false);
  two.abort();
  await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  expect(upstream.aborted).toBe(true);
  await run(query);
  pending.reject(new Error('late abort rejection'));
  await Promise.resolve();
  await run(query);
  expect(queryMetrics).toHaveBeenCalledTimes(2);
});

it('does not dispatch a request cancelled before its queued start', async () => {
  const queryMetrics = jest.fn().mockResolvedValue(response);
  const controller = new AbortController();
  const result = runner(queryMetrics)(query, { signal: controller.signal });
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(queryMetrics).not.toHaveBeenCalled();
});

it('does not dispatch already-cancelled requests', async () => {
  const queryMetrics = jest.fn();
  const controller = new AbortController();
  controller.abort();
  await expect(runner(queryMetrics)(query, { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(queryMetrics).not.toHaveBeenCalled();
});
