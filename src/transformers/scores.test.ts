import { FieldType } from '@grafana/data';
import type { Score } from '../client/types';
import { scoresToFrames } from './scores';

const values = [
  ['NUMERIC', 3.5],
  ['BOOLEAN', false],
  ['CATEGORICAL', 'good'],
  ['TEXT', 'explanation'],
  ['CORRECTION', ''],
] as const;
const rows: Score[] = values.map(
  ([dataType, value]) =>
    ({
      id: `score-${dataType}`,
      projectId: 'project-1',
      name: 'quality',
      source: 'API',
      environment: 'test',
      timestamp: '2026-08-05T12:00:00Z',
      createdAt: '2026-08-05T12:00:00Z',
      updatedAt: '2026-08-05T12:00:00Z',
      dataType,
      value,
      metadata: { nested: { safe: true } },
      comment: 'note',
      configId: 'config-1',
      subject: { kind: 'observation', id: 'observation-1', traceId: 'trace-1' },
      queueId: 'queue-1',
      authorUserId: 'author-1',
    }) as Score
);

test('all five types retain native values in separate typed tables', () => {
  const frames = scoresToFrames(rows, {}, 'A');
  expect(frames).toHaveLength(5);
  frames.forEach((frame, index) => {
    expect(frame.refId).toBe('A');
    expect(frame.meta?.preferredVisualisationType).toBe('table');
    const value = frame.fields.find((field) => field.name === 'value')!;
    expect(value.values).toEqual([values[index][1]]);
    expect(value.type).toBe(
      [FieldType.number, FieldType.boolean, FieldType.string, FieldType.string, FieldType.string][index]
    );
    expect(frame.fields[0].values).toEqual([Date.parse('2026-08-05T12:00:00Z')]);
  });
});

test('selected documented groups flatten subject only and retain structured metadata', () => {
  const frame = scoresToFrames([rows[0]], { dataType: 'NUMERIC', fields: 'annotation,subject,details' }, 'A')[0];
  expect(frame.fields.map((field) => field.name)).toEqual([
    'timestamp',
    'name',
    'dataType',
    'value',
    'source',
    'environment',
    'id',
    'projectId',
    'createdAt',
    'updatedAt',
    'comment',
    'configId',
    'metadata',
    'subject.kind',
    'subject.id',
    'subject.traceId',
    'authorUserId',
    'queueId',
  ]);
  expect(frame.fields.find((field) => field.name === 'metadata')).toMatchObject({
    type: FieldType.other,
    values: [{ nested: { safe: true } }],
  });
  expect(frame.fields.find((field) => field.name === 'subject.traceId')?.values).toEqual(['trace-1']);
});

test('unrequested payload groups do not become columns', () => {
  const frame = scoresToFrames(rows, { dataType: 'NUMERIC' }, 'A')[0];
  expect(frame.fields.map((field) => field.name)).not.toContain('metadata');
  expect(frame.fields.map((field) => field.name)).not.toContain('subject.id');
});

test('empty schemas and column ordering match populated results for all five types', () => {
  const definition = { fields: 'details,subject,annotation' };
  const empty = scoresToFrames([], definition, 'A');
  const full = scoresToFrames(rows, definition, 'A');
  expect(empty.map((frame) => frame.fields.map(({ name, type }) => ({ name, type })))).toEqual(
    full.map((frame) => frame.fields.map(({ name, type }) => ({ name, type })))
  );
  expect(empty.every((frame) => frame.length === 0)).toBe(true);
});

test('trace, session and experiment subjects have null missing observation trace context', () => {
  for (const kind of ['trace', 'session', 'experiment'] as const) {
    const frame = scoresToFrames(
      [{ ...rows[0], subject: { kind, id: 'subject-1' } }],
      { dataType: 'NUMERIC', fields: 'subject' },
      'A'
    )[0];
    expect(frame.fields.find((field) => field.name === 'subject.kind')?.values).toEqual([kind]);
    expect(frame.fields.find((field) => field.name === 'subject.traceId')?.values).toEqual([null]);
  }
});
