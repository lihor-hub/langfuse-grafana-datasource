import type { ScopedVars } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import { interpolateQuery } from './interpolate';

jest.mock('@grafana/runtime', () => ({ getTemplateSrv: jest.fn() }));

const replace = jest.fn((text: string, scoped: ScopedVars, format: (value: unknown) => string) =>
  text.replace(/\$(?:\{(\w+)(?::\w+)?\}|(\w+))|\[\[(\w+)\]\]/g, (match, a, b, c) => {
    const value = scoped[a ?? b ?? c]?.value;
    return value === undefined ? match : format(value);
  })
);

beforeEach(() => {
  jest.mocked(getTemplateSrv).mockReturnValue({ replace } as unknown as ReturnType<typeof getTemplateSrv>);
});

function filter(value: unknown, operator = '=', type = 'string') {
  return { type, column: 'environment', operator, value };
}
function run(value: unknown, vars: ScopedVars) {
  return JSON.parse(interpolateQuery({ refId: 'A', metricsQuery: JSON.stringify(value) }, vars).metricsQuery!);
}

it('interpolates parsed values without injecting JSON, editing keys or mutating the saved target', () => {
  const raw = { filters: [filter('$env')], $env: 'unchanged' };
  const target = { refId: 'A', metricsQuery: JSON.stringify(raw) };
  const malicious = '\"}],\"config\":{\"row_limit\":999999},\"x\":[{\"a\":\"';
  const result = interpolateQuery(target, { env: { value: malicious } });
  expect(JSON.parse(result.metricsQuery!)).toEqual({ filters: [filter(malicious)], $env: 'unchanged' });
  expect(target.metricsQuery).toBe(JSON.stringify(raw));
});

it.each(['any of', 'none of', 'all of'])('expands membership %s while preserving literal arrays', (operator) => {
  expect(
    run({ filters: [filter(['fixed', '${env}'], operator, 'stringOptions')] }, { env: { value: ['prod', 'stage'] } })
  ).toEqual({ filters: [filter(['fixed', 'prod', 'stage'], operator, 'stringOptions')] });
});

it('expands exact references and retains single-value membership arrays', () => {
  expect(run({ filters: [filter('$env', 'any of', 'stringOptions')] }, { env: { value: 'prod' } })).toEqual({
    filters: [filter(['prod'], 'any of', 'stringOptions')],
  });
});

it.each(['=', 'contains', '>', 'in'])('rejects multi-values for scalar or undocumented operator %s', (operator) => {
  expect(() => run({ filters: [filter('$env', operator)] }, { env: { value: ['prod', 'stage'] } })).toThrow(
    /multi-value/i
  );
});

it('rejects embedded multi-values, unresolved variables and non-finite inputs', () => {
  expect(() => run({ filters: [filter('prefix-$env')] }, { env: { value: ['a', 'b'] } })).toThrow(/multi-value/i);
  expect(() => run({ filters: [filter('$missing')] }, {})).toThrow(/unresolved/i);
  expect(() => run({ filters: [filter('$number', '>', 'number')] }, { number: { value: Infinity } })).toThrow();
});

it('coerces numeric/boolean filter values only according to their declared type', () => {
  const value = { filters: [filter('$n', '>', 'number'), filter('$b', '=', 'boolean'), filter('$n')] };
  expect(run(value, { n: { value: '12.5' }, b: { value: 'false' } })).toEqual({
    filters: [filter(12.5, '>', 'number'), filter(false, '=', 'boolean'), filter('12.5')],
  });
  expect(() => run({ filters: [filter('$n', '>', 'number')] }, { n: { value: '' } })).toThrow();
  expect(() => run({ filters: [filter('$b', '=', 'boolean')] }, { b: { value: 'yes' } })).toThrow();
});

it('supports the active canonical query, preserves inactive drafts and forwards scoped variables', () => {
  for (const [kind, key, source] of [
    ['observations', 'observationsQuery', '{"name":"${env}"}'],
    ['scores', 'scoresQuery', '{"name":"[[env]]"}'],
  ] as const) {
    const target = { refId: 'A', kind, metricsQuery: '{unfinished draft', [key]: source };
    expect(interpolateQuery(target, { env: { value: 'scoped' } })).toEqual({
      refId: 'A',
      kind,
      metricsQuery: '{unfinished draft',
      [key]: '{"name":"scoped"}',
    });
  }
  expect(replace).toHaveBeenCalledWith(expect.any(String), { env: { value: 'scoped' } }, expect.any(Function));
  expect(() => interpolateQuery({ refId: 'A', metricsQuery: '{invalid' }, {})).toThrow(/JSON/);
});

it('rejects non-finite JSON numbers rather than converting them to null', () => {
  expect(() => interpolateQuery({ refId: 'A', metricsQuery: '{"limit":1e999}' }, {})).toThrow(/finite/);
});
