import type { ScopedVars } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import { interpolateQuery } from './interpolate';

jest.mock('@grafana/runtime', () => ({ getTemplateSrv: jest.fn() }));

beforeEach(() => {
  jest.mocked(getTemplateSrv).mockReturnValue({
    replace: (text: string, vars: ScopedVars, format: (value: unknown) => string) =>
      text.replace(/\$(\w+)/g, (match, name) => (vars[name] ? format(vars[name].value) : match)),
  } as unknown as ReturnType<typeof getTemplateSrv>);
});

function run(query: unknown, vars: ScopedVars) {
  return JSON.parse(
    interpolateQuery({ refId: 'A', kind: 'scores', scoresQuery: JSON.stringify(query) }, vars).scoresQuery!
  );
}

it.each([
  'id',
  'name',
  'source',
  'dataType',
  'environment',
  'configId',
  'queueId',
  'authorUserId',
  'traceId',
  'observationId',
  'sessionId',
  'experimentId',
  'value',
])('encodes score CSV filter %s only at the documented root path', (field) => {
  expect(run({ [field]: '$selected' }, { selected: { value: ['one', 'two'] } })).toEqual({ [field]: 'one,two' });
  expect(() => run({ nested: { [field]: '$selected' } }, { selected: { value: ['one', 'two'] } })).toThrow(
    /multi-value/i
  );
});

it('keeps score exact values as strings and resolves source/dataType enum placeholders before validation', () => {
  expect(
    run(
      { source: '$sources', dataType: '$types', value: '$values' },
      {
        sources: { value: ['API', 'EVAL'] },
        types: { value: 'NUMERIC' },
        values: { value: [0, 1.5] },
      }
    )
  ).toEqual({ source: 'API,EVAL', dataType: 'NUMERIC', value: '0,1.5' });
  expect(run({ dataType: '$type', value: '$value' }, { type: { value: 'BOOLEAN' }, value: { value: false } })).toEqual({
    dataType: 'BOOLEAN',
    value: 'false',
  });
  expect(run({ value: '$value' }, { value: { value: 0 } })).toEqual({ value: '0' });
  expect(run({ value: '$value' }, { value: { value: '' } })).toEqual({ value: '' });
});

it.each(['valueMin', 'valueMax', 'ceiling'])('coerces only documented numeric score path %s', (field) => {
  expect(run({ [field]: '$n' }, { n: { value: '42.5' } })).toEqual({ [field]: 42.5 });
  expect(run({ nested: { [field]: '$n' } }, { n: { value: '42.5' } })).toEqual({ nested: { [field]: '42.5' } });
  expect(() => run({ [field]: '$n' }, { n: { value: ['1', '2'] } })).toThrow(/multi-value/i);
  for (const value of ['', 'NaN', 'Infinity', '1e999', true, null]) {
    expect(() => run({ [field]: '$n' }, { n: { value } })).toThrow();
  }
});

it.each([{ value: ['a,b'] }, { value: ['a', 'b,c'] }, { value: 'a,b' }])(
  'rejects ambiguous comma-containing variable selection %j',
  ({ value }) => {
    expect(() => run({ name: '$selected' }, { selected: { value } })).toThrow(/comma/i);
  }
);

it('retains literal CSV but rejects embedded multi-values, empty sets and unsupported multi-value paths', () => {
  expect(run({ name: 'literal,values', source: 'API,EVAL' }, {})).toEqual({
    name: 'literal,values',
    source: 'API,EVAL',
  });
  expect(run({ name: 'literal,$single' }, { single: { value: 'other' } })).toEqual({ name: 'literal,other' });
  expect(() => run({ name: 'literal,$multi' }, { multi: { value: ['a', 'b'] } })).toThrow(/multi-value/i);
  expect(() => run({ name: '$empty' }, { empty: { value: [] } })).toThrow(/empty/i);
  expect(() => run({ name: '$empty' }, { empty: { value: ['a', ''] } })).toThrow(/empty/i);
  expect(() => run({ fields: '$groups' }, { groups: { value: ['details', 'subject'] } })).toThrow(/multi-value/i);
  expect(() => run({ unknown: '$multi' }, { multi: { value: ['a', 'b'] } })).toThrow(/multi-value/i);
  expect(() => run({ name: '$missing' }, {})).toThrow(/unresolved/i);
});

it('does not join CSV-like fields or coerce score-specific numbers in other query kinds', () => {
  for (const kind of ['metrics', 'observations'] as const) {
    const key = kind === 'metrics' ? 'metricsQuery' : 'observationsQuery';
    const numeric = interpolateQuery({ refId: 'A', kind, [key]: '{"valueMin":"$n"}' }, { n: { value: '2' } });
    expect(JSON.parse(numeric[key]!)).toEqual({ valueMin: '2' });
    expect(() =>
      interpolateQuery({ refId: 'A', kind, [key]: '{"name":"$multi"}' }, { multi: { value: ['a', 'b'] } })
    ).toThrow(/multi-value/i);
  }
});
