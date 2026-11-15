import { FieldType } from '@grafana/data';
import type { Observation } from '../client/types';
import { observationsToLogs, observationsToTable } from './observations';
const row: Observation = {
  endTime: null,
  parentObservationId: null,
  modelId: null,
  inputPrice: null,
  outputPrice: null,
  totalPrice: null,
  id: 'o/1',
  projectId: 'p/1',
  traceId: 't/1',
  startTime: '2026-11-01T01:00:00Z',
  type: 'AGENT',
  name: 'agent',
  level: 'ERROR',
  input: 'private input',
  output: '{"answer":42}',
  metadata: { a: 1 },
  environment: 'test',
  userId: 'u1',
  sessionId: 's1',
  traceName: 'workflow',
  release: 'v1',
  providedModelName: 'demo',
  promptName: 'prompt',
  totalCost: 0.1,
  usageDetails: { input: 12 },
  latency: 1.5,
};
it('emits deterministic typed tables with selected groups and structured payloads only', () => {
  const basic = observationsToTable([row], {}, 'A');
  expect(basic.fields.map((f) => f.name)).not.toEqual(expect.arrayContaining(['input', 'output', 'metadata']));
  const definition = {
    fieldGroups: ['basic', 'time', 'io', 'metadata', 'model', 'usage', 'prompt', 'metrics', 'trace_context'] as const,
  };
  const full = observationsToTable([row], { fieldGroups: [...definition.fieldGroups] }, 'A');
  expect(full.fields.find((f) => f.name === 'totalCost')).toMatchObject({
    type: FieldType.number,
    values: [0.1],
    config: { unit: 'currencyUSD' },
  });
  expect(full.fields.find((f) => f.name === 'latency')).toMatchObject({
    type: FieldType.number,
    values: [1.5],
    config: { unit: 's' },
  });
  expect(full.fields.find((f) => f.name === 'metadata')).toMatchObject({ type: FieldType.other, values: [{ a: 1 }] });
  expect(
    observationsToTable([], { fieldGroups: [...definition.fieldGroups] }, 'A').fields.map((f) => [f.name, f.type])
  ).toEqual(full.fields.map((f) => [f.name, f.type]));
});
it('maps native logs contract, body fallbacks and low-cardinality labels without identifiers', () => {
  const logs = observationsToLogs([row], { logBody: 'statusMessage' }, 'B');
  expect(logs.fields.slice(0, 5).map((f) => [f.name, f.type])).toEqual([
    ['timestamp', FieldType.time],
    ['body', FieldType.string],
    ['severity', FieldType.string],
    ['id', FieldType.string],
    ['labels', FieldType.other],
  ]);
  expect(logs.fields[1].values).toEqual(['agent']);
  expect(logs.fields[2].values).toEqual(['error']);
  expect(logs.fields[4].values).toEqual([{ type: 'AGENT', environment: 'test' }]);
  expect(logs.meta).toMatchObject({ type: 'log-lines', preferredVisualisationType: 'logs' });
  expect(observationsToLogs([row], { logBody: 'output', fieldGroups: ['io'] }, 'A').fields[1].values).toEqual([
    '{"answer":42}',
  ]);
  expect(observationsToLogs([row], { logBody: 'input' }, 'A').fields[1].values).toEqual(['agent']);
  expect(observationsToLogs([], {}, 'A').length).toBe(0);
  const selected = observationsToLogs(
    [{ ...row, input: { text: 'example' } }],
    { logBody: 'input', fieldGroups: ['basic', 'model', 'trace_context', 'prompt', 'io'] },
    'A'
  );
  expect(selected.fields[1].values).toEqual(['{"text":"example"}']);
  expect(selected.fields[4].values).toEqual([
    {
      type: 'AGENT',
      environment: 'test',
      providedModelName: 'demo',
      traceName: 'workflow',
      release: 'v1',
      promptName: 'prompt',
    },
  ]);
  expect(
    observationsToLogs([{ ...row, name: null, input: '' }], { logBody: 'input', fieldGroups: ['io'] }, 'A').fields[1]
      .values
  ).toEqual(['(unnamed observation)']);
});
it('links encoded project-scoped trace and observation IDs only to a verified configured UI root', () => {
  const frame = observationsToTable([row], {}, 'A', 'https://ui.example.test/langfuse/');
  expect(frame.fields.find((f) => f.name === 'traceId')?.config.links?.[0].url).toBe('${__data.fields["traceUrl"]}');
  expect(frame.fields.find((f) => f.name === 'id')?.config.links?.[0].url).toBe('${__data.fields["observationUrl"]}');
  const traceUrl = frame.fields.find((f) => f.name === 'traceUrl')?.values[0];
  expect(traceUrl).toBe('https://ui.example.test/langfuse/project/p%2F1/traces/t%2F1');
  expect(frame.fields.find((f) => f.name === 'observationUrl')?.values[0]).toBe(traceUrl + '?observation=o%2F1');
  for (const url of [
    undefined,
    '/api/datasources/proxy/1',
    'javascript:alert(1)',
    'https://ui.example.test/api/datasources/proxy/1',
  ]) {
    expect(observationsToLogs([row], {}, 'A', url).fields.find((f) => f.name === 'id')?.config.links).toBeUndefined();
  }
  expect(
    observationsToTable([{ ...row, projectId: '' }], {}, 'A', 'https://ui.example.test').fields.find(
      (f) => f.name === 'id'
    )?.config.links
  ).toBeUndefined();
  expect(
    observationsToTable([{ ...row, projectId: '' }], {}, 'A', 'https://ui.example.test').fields.find(
      (f) => f.name === 'traceUrl'
    )?.values
  ).toEqual([null]);
});
