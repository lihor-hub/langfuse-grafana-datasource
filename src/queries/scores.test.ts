import { dateTime, FieldType, type DataQueryRequest } from '@grafana/data';
import type { LangfuseObservabilityClient, Score } from '../client/types';
import type { LangfuseQuery } from '../types';
import { buildScoreRequest, runScoreQuery } from './scores';

const range = {
  from: dateTime('2026-08-05T00:00:00Z'),
  to: dateTime('2026-08-06T00:00:00Z'),
  raw: { from: 'now-1d', to: 'now' },
};
const request = { range } as DataQueryRequest<LangfuseQuery>;
const target = (definition: object = {}): LangfuseQuery => ({
  refId: 'A',
  kind: 'scores',
  scoresQuery: JSON.stringify(definition),
});
const score = (dataType: Score['dataType'] = 'NUMERIC', value: unknown = 3): Score =>
  ({
    id: 'score-1',
    projectId: 'project-1',
    timestamp: '2026-08-05T12:00:00Z',
    createdAt: '2026-08-05T12:00:00Z',
    updatedAt: '2026-08-05T12:00:00Z',
    name: 'quality',
    source: 'API',
    environment: 'test',
    dataType,
    value,
  }) as Score;
const clientWith = (listScores: jest.Mock) => ({ listScores }) as unknown as LangfuseObservabilityClient;

test('bounded default request uses Grafana range and all documented filters', () => {
  const definition = {
    name: 'quality,accuracy',
    source: 'api,eval',
    environment: 'test',
    configId: 'config-1',
    queueId: 'queue-1',
    authorUserId: 'author-1',
    traceId: 'trace-1',
    observationId: 'observation-1',
    fields: 'details,subject,annotation',
    fromTimestamp: 'old',
    toTimestamp: 'old',
  };
  expect(buildScoreRequest(target(definition), range)).toEqual({
    ...definition,
    limit: 100,
    fromTimestamp: '2026-08-05T00:00:00.000Z',
    toTimestamp: '2026-08-06T00:00:00.000Z',
  });
});

test.each(['NUMERIC', 'BOOLEAN', 'CATEGORICAL', 'TEXT', 'CORRECTION'])('accepts %s', (dataType) => {
  expect(buildScoreRequest(target({ dataType }), range).dataType).toBe(dataType);
});

test.each([
  { observationId: 'o' },
  { traceId: 't', sessionId: 's' },
  { traceId: 't', experimentId: 'e' },
  { sessionId: 's', experimentId: 'e' },
  { value: '1' },
  { dataType: 'TEXT', value: 'hello' },
  { dataType: 'CORRECTION', value: 'fixed' },
  { dataType: 'NUMERIC,BOOLEAN', value: '1' },
  { dataType: 'BOOLEAN', value: '1' },
  { dataType: 'NUMERIC', value: 'NaN' },
  { dataType: 'NUMERIC', value: ' ' },
  { dataType: 'CATEGORICAL', valueMin: 1 },
  { dataType: 'NUMERIC', valueMin: '1' },
  { dataType: 'NUMERIC', valueMin: 5, valueMax: 1 },
  { ceiling: 0 },
  { ceiling: 5001 },
  { ceiling: 1.5 },
  { fields: 'metadata' },
  { dataType: 'unknown' },
  { name: ['bad'] },
  { path: '/anything' },
  { limit: 200 },
  { cursor: 'skip' },
  { traceId: ' ' },
  { sessionId: 's,' },
  { dataType: '' },
  { source: 'unsupported' },
])('rejects invalid query %j before dispatch', (definition) => {
  expect(() => buildScoreRequest(target(definition), range)).toThrow();
});

test.each([
  { dataType: 'numeric', value: '0,-1,2.5', valueMin: -2, valueMax: 3 },
  { dataType: 'BOOLEAN', value: 'true,false' },
  { dataType: 'CATEGORICAL', value: 'good,bad' },
  { sessionId: 's' },
  { experimentId: 'e' },
  { ceiling: 5000 },
])('accepts valid typed filters %j', (definition) => {
  expect(() => buildScoreRequest(target(definition), range)).not.toThrow();
});

test('sequential pages are bounded, share cancellation signal, and show truncation', async () => {
  const list = jest
    .fn()
    .mockResolvedValueOnce({ data: Array.from({ length: 100 }, () => score()), meta: { limit: 100, cursor: 'next' } })
    .mockResolvedValueOnce({ data: [score(), score()], meta: { limit: 2, cursor: 'later' } });
  const signal = new AbortController().signal;
  const frames = await runScoreQuery(clientWith(list), target({ ceiling: 102, dataType: 'NUMERIC' }), request, signal);
  expect(list).toHaveBeenCalledTimes(2);
  expect(list.mock.calls[0][0].limit).toBe(100);
  expect(list.mock.calls[1]).toEqual([expect.objectContaining({ limit: 2, cursor: 'next' }), signal]);
  expect(frames[0].length).toBe(102);
  expect(frames[0].meta?.notices?.[0].text).toMatch(/102.*truncat/i);
});

test('default ceiling is 500 and never requests another page at the ceiling', async () => {
  const list = jest.fn().mockResolvedValue({ data: Array.from({ length: 100 }, () => score()), meta: { limit: 100 } });
  list.mockImplementation(async () => ({
    data: Array.from({ length: 100 }, () => score()),
    meta: { limit: 100, cursor: `page-${list.mock.calls.length}` },
  }));
  const frames = await runScoreQuery(
    clientWith(list),
    target({ dataType: 'NUMERIC' }),
    request,
    new AbortController().signal
  );
  expect(list).toHaveBeenCalledTimes(5);
  expect(frames[0].length).toBe(500);
});

test('repeated cursors are rejected rather than looping', async () => {
  const list = jest.fn().mockResolvedValue({ data: [score()], meta: { limit: 100, cursor: 'same' } });
  await expect(runScoreQuery(clientWith(list), target(), request, new AbortController().signal)).rejects.toThrow(
    /cursor/i
  );
  expect(list).toHaveBeenCalledTimes(2);
});

test('cancellation before and between pages stops dispatch', async () => {
  const controller = new AbortController();
  const list = jest.fn().mockImplementation(async () => {
    controller.abort();
    return { data: [score()], meta: { limit: 100, cursor: 'next' } };
  });
  await expect(runScoreQuery(clientWith(list), target(), request, controller.signal)).rejects.toThrow(/cancel/i);
  expect(list).toHaveBeenCalledTimes(1);
  await expect(runScoreQuery(clientWith(list), target(), request, controller.signal)).rejects.toThrow(/cancel/i);
  expect(list).toHaveBeenCalledTimes(1);
});

test.each([
  {},
  { data: [], meta: {} },
  { data: [], meta: { limit: 100, cursor: 2 } },
  { data: [score('BOOLEAN', 1)], meta: { limit: 100 } },
  { data: [null], meta: { limit: 100 } },
])('rejects malformed responses without echoing payloads', async (page) => {
  const list = jest.fn().mockResolvedValue(page);
  await expect(runScoreQuery(clientWith(list), target(), request, new AbortController().signal)).rejects.toThrow(
    /incompatible/i
  );
});

test('invalid queries and ranges never reach the read client', async () => {
  const list = jest.fn();
  for (const definition of [{ ceiling: 0 }, { dataType: 'TEXT', value: 'not supported' }]) {
    await expect(
      runScoreQuery(clientWith(list), target(definition), request, new AbortController().signal)
    ).rejects.toThrow(/Invalid score query/);
  }
  expect(() => buildScoreRequest(target(), { ...range, to: range.from })).toThrow(/range/);
  expect(list).not.toHaveBeenCalled();
});

test('client failure stops pages and is not retried', async () => {
  const error = new Error('synthetic request failure');
  const list = jest.fn().mockRejectedValue(error);
  await expect(runScoreQuery(clientWith(list), target(), request, new AbortController().signal)).rejects.toBe(error);
  expect(list).toHaveBeenCalledTimes(1);
});

test('short and empty final pages terminate without a truncation notice', async () => {
  const list = jest
    .fn()
    .mockResolvedValueOnce({ data: [score()], meta: { limit: 100, cursor: 'next' } })
    .mockResolvedValueOnce({ data: [], meta: { limit: 100 } });
  const frames = await runScoreQuery(
    clientWith(list),
    target({ dataType: 'NUMERIC' }),
    request,
    new AbortController().signal
  );
  expect(frames[0].length).toBe(1);
  expect(frames[0].meta?.notices).toBeUndefined();
  expect(list).toHaveBeenCalledTimes(2);
});

test('an exact ceiling with confirmed final page is not marked truncated', async () => {
  const list = jest.fn().mockResolvedValue({ data: [score()], meta: { limit: 1 } });
  const frames = await runScoreQuery(
    clientWith(list),
    target({ ceiling: 1, dataType: 'NUMERIC' }),
    request,
    new AbortController().signal
  );
  expect(frames[0].length).toBe(1);
  expect(frames[0].meta?.notices).toBeUndefined();
});

test('incompatible values outside the requested type are not silently dropped', async () => {
  const list = jest.fn().mockResolvedValue({ data: [score('BOOLEAN', true)], meta: { limit: 100 } });
  await expect(
    runScoreQuery(clientWith(list), target({ dataType: 'NUMERIC' }), request, new AbortController().signal)
  ).rejects.toThrow(/incompatible/i);
});

test('empty non-final pages cannot evade the bounded row budget indefinitely', async () => {
  const list = jest.fn().mockResolvedValue({ data: [], meta: { limit: 100, cursor: 'next' } });
  await expect(runScoreQuery(clientWith(list), target(), request, new AbortController().signal)).rejects.toThrow(
    /incompatible/i
  );
  expect(list).toHaveBeenCalledTimes(1);
});

test('empty typed response has a stable native schema', async () => {
  const list = jest.fn().mockResolvedValue({ data: [], meta: { limit: 100 } });
  const frames = await runScoreQuery(
    clientWith(list),
    target({ dataType: 'BOOLEAN' }),
    request,
    new AbortController().signal
  );
  expect(frames).toHaveLength(1);
  expect(frames[0].length).toBe(0);
  expect(frames[0].fields.find((field) => field.name === 'value')?.type).toBe(FieldType.boolean);
});
