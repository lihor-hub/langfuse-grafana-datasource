import { dateTime, type DataQueryRequest } from '@grafana/data';
import type { LangfuseQuery } from '../types';
import type { LangfuseObservabilityClient } from '../client/types';
import { runObservationQuery } from './observations';

const request = {
  app: 'dashboard',
  range: { from: dateTime('2026-11-01T00:00:00Z'), to: dateTime('2026-11-02T00:00:00Z') },
} as DataQueryRequest<LangfuseQuery>;
const row = {
  id: 'o1',
  traceId: 't1',
  projectId: 'p1',
  startTime: '2026-11-01T01:00:00Z',
  type: 'AGENT',
  name: 'agent',
};
const listObservations = jest.fn();
const client = { listObservations } as unknown as LangfuseObservabilityClient;
beforeEach(() => listObservations.mockReset());
it('reads a bounded default table without fetching large payloads and retains empty schema', async () => {
  listObservations.mockResolvedValue({ data: [], meta: {} });
  const [frame] = await runObservationQuery(client, { refId: 'A' }, request, new AbortController().signal);
  expect(listObservations.mock.calls[0][0]).toMatchObject({
    fields: 'core,basic',
    limit: 1000,
    fromStartTime: request.range.from.toISOString(),
    toStartTime: request.range.to.toISOString(),
  });
  expect(frame.length).toBe(0);
  expect(frame.fields.slice(0, 4).map((f) => f.name)).toEqual(['startTime', 'name', 'type', 'level']);
  expect(frame.meta?.preferredVisualisationType).toBe('table');
});
it('follows cursors sequentially, bounds each page, and reports ceiling truncation', async () => {
  listObservations
    .mockResolvedValueOnce({ data: [row], meta: { cursor: 'next' } })
    .mockResolvedValueOnce({ data: [{ ...row, id: 'o2' }], meta: { cursor: 'more' } });
  const signal = new AbortController().signal;
  const [frame] = await runObservationQuery(
    client,
    { refId: 'A', observationsQuery: '{"ceiling":2}' },
    request,
    signal
  );
  expect(listObservations.mock.calls.map((c) => c[0].limit)).toEqual([2, 1]);
  expect(listObservations.mock.calls[1]).toEqual([
    expect.objectContaining({ cursor: 'next', fromStartTime: request.range.from.toISOString() }),
    signal,
  ]);
  expect(frame.length).toBe(2);
  expect(frame.meta?.notices?.[0].text).toMatch(/truncat/i);
});
it('rejects repeated cursors and malformed responses without leaking payloads', async () => {
  listObservations.mockResolvedValue({ data: [row], meta: { cursor: 'same' } });
  await expect(
    runObservationQuery(client, { refId: 'A' }, request, new AbortController().signal)
  ).rejects.toMatchObject({ name: 'LangfuseClientError', kind: 'malformed-response' });
  for (const page of [
    {},
    { data: [null], meta: {} },
    { data: [{ ...row, startTime: 'bad' }], meta: {} },
    { data: [], meta: { cursor: 3 } },
  ]) {
    listObservations.mockResolvedValue(page);
    await expect(
      runObservationQuery(client, { refId: 'A' }, request, new AbortController().signal)
    ).rejects.toMatchObject({ name: 'LangfuseClientError', kind: 'malformed-response' });
  }
});
it('stops on cancellation, errors, and hidden targets', async () => {
  const controller = new AbortController();
  listObservations.mockImplementationOnce(async () => {
    controller.abort();
    return { data: [row], meta: { cursor: 'next' } };
  });
  await expect(runObservationQuery(client, { refId: 'A' }, request, controller.signal)).rejects.toMatchObject({
    name: 'LangfuseClientError',
    kind: 'cancelled',
  });
  expect(listObservations).toHaveBeenCalledTimes(1);
  listObservations.mockReset().mockRejectedValue(new Error('upstream'));
  await expect(runObservationQuery(client, { refId: 'A' }, request, new AbortController().signal)).rejects.toThrow(
    'upstream'
  );
  expect(listObservations).toHaveBeenCalledTimes(1);
  listObservations.mockClear();
  expect(await runObservationQuery(client, { refId: 'A', hide: true }, request, controller.signal)).toEqual([]);
  expect(listObservations).not.toHaveBeenCalled();
});
it.each(['SPAN', 'GENERATION', 'EVENT', 'AGENT', 'TOOL', 'CHAIN', 'RETRIEVER', 'EVALUATOR', 'EMBEDDING', 'GUARDRAIL'])(
  'accepts %s and retains simple filters and range when structured filters override API parameters',
  async (type) => {
    listObservations.mockResolvedValue({ data: [], meta: {} });
    await runObservationQuery(
      client,
      {
        refId: 'A',
        observationsQuery: JSON.stringify({
          type,
          name: 'agent',
          level: 'ERROR',
          environment: ['test'],
          version: 'v1',
          isRootObservation: true,
          parentObservationId: '',
          traceId: 't1',
          userId: 'u1',
          sessionId: 's1',
          filters: [{ type: 'number', column: 'totalCost', operator: '>', value: 0 }],
        }),
      },
      request,
      new AbortController().signal
    );
    const sent = listObservations.mock.calls[0][0];
    expect(JSON.parse(sent.filter)).toEqual(
      expect.arrayContaining([
        { type: 'string', column: 'type', operator: '=', value: type },
        { type: 'string', column: 'parentObservationId', operator: '=', value: '' },
        { type: 'string', column: 'sessionId', operator: '=', value: 's1' },
        { type: 'boolean', column: 'isRootObservation', operator: '=', value: true },
        { type: 'datetime', column: 'startTime', operator: '>=', value: request.range.from.toISOString() },
        { type: 'datetime', column: 'startTime', operator: '<', value: request.range.to.toISOString() },
      ])
    );
  }
);
it.each([
  '{',
  'null',
  '{"ceiling":0}',
  '{"ceiling":5001}',
  '{"ceiling":"10"}',
  '{"type":"nope"}',
  '{"environment":[5]}',
  '{"fieldGroups":["secrets"]}',
  '{"method":"POST"}',
  '{"filters":[{"type":"number","column":"totalCost","operator":">","value":"$bad"}]}',
  '{"filters":[{"type":"datetime","column":"startTime","operator":">","value":"bad"}]}',
])('rejects invalid interpolated definitions before dispatch: %s', async (observationsQuery) => {
  await expect(
    runObservationQuery(client, { refId: 'A', observationsQuery }, request, new AbortController().signal)
  ).rejects.toThrow();
  expect(listObservations).not.toHaveBeenCalled();
});
it('rejects an empty page with a fresh cursor as a non-progressing response', async () => {
  listObservations.mockResolvedValue({ data: [], meta: { cursor: 'unused' } });
  await expect(
    runObservationQuery(client, { refId: 'A' }, request, new AbortController().signal)
  ).rejects.toMatchObject({ name: 'LangfuseClientError', kind: 'malformed-response' });
  expect(listObservations).toHaveBeenCalledTimes(1);
});
it('uses Explore logs by default but respects explicit format and never fetches io just for a body choice', async () => {
  listObservations.mockResolvedValue({ data: [row], meta: {} });
  const [logs] = await runObservationQuery(
    client,
    { refId: 'A', observationsQuery: '{"logBody":"input"}' },
    { ...request, app: 'explore' },
    new AbortController().signal
  );
  expect(logs.meta?.preferredVisualisationType).toBe('logs');
  expect(listObservations.mock.calls[0][0].fields).toBe('core,basic');
  const [table] = await runObservationQuery(
    client,
    { refId: 'A', observationsQuery: '{"format":"table"}' },
    { ...request, app: 'explore' },
    new AbortController().signal
  );
  expect(table.meta?.preferredVisualisationType).toBe('table');
});
it.each([
  { isRootObservation: 'yes' },
  { usageDetails: { input: 'bad' } },
  { costDetails: [] },
  { tags: [1] },
  { modelId: 5 },
])('rejects malformed optional typed fields: %j', async (patch) => {
  listObservations.mockResolvedValue({ data: [{ ...row, ...patch }], meta: {} });
  await expect(runObservationQuery(client, { refId: 'A' }, request, new AbortController().signal)).rejects.toThrow(
    /incompatible/i
  );
});
it('caps every page at 1000 and the full result at 5000 without parallel requests', async () => {
  let active = 0;
  listObservations.mockImplementation(async ({ cursor, limit }) => {
    expect(active++).toBe(0);
    await Promise.resolve();
    active--;
    return {
      data: Array.from({ length: limit }, (_, index) => ({ ...row, id: `${cursor ?? 'first'}-${index}` })),
      meta: { cursor: `${cursor ?? ''}next` },
    };
  });
  const [frame] = await runObservationQuery(
    client,
    { refId: 'A', observationsQuery: '{"ceiling":5000}' },
    request,
    new AbortController().signal
  );
  expect(frame.length).toBe(5000);
  expect(listObservations.mock.calls.map((c) => c[0].limit)).toEqual([1000, 1000, 1000, 1000, 1000]);
});
it('does not dispatch for pre-cancelled requests or invalid ranges', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(runObservationQuery(client, { refId: 'A' }, request, controller.signal)).rejects.toThrow(/cancel/i);
  await expect(
    runObservationQuery(
      client,
      { refId: 'A' },
      { ...request, range: { ...request.range, to: request.range.from } },
      new AbortController().signal
    )
  ).rejects.toThrow();
  expect(listObservations).not.toHaveBeenCalled();
});
it('overwrites legacy timestamps without widening selected bounds or requesting unselected payloads', async () => {
  listObservations.mockResolvedValue({ data: [], meta: {} });
  await runObservationQuery(
    client,
    {
      refId: 'A',
      observationsQuery: '{"fieldGroups":["usage","model"],"fromStartTime":"2000-01-01","toStartTime":"2099-01-01"}',
    },
    request,
    new AbortController().signal
  );
  expect(listObservations.mock.calls[0][0]).toMatchObject({
    fields: 'core,model,usage',
    fromStartTime: request.range.from.toISOString(),
    toStartTime: request.range.to.toISOString(),
  });
});
