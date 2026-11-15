import { dateTime, type TimeRange } from '@grafana/data';
import { buildMetricsQuery } from './metrics';
const range: TimeRange = {
  from: dateTime('2026-11-01'),
  to: dateTime('2026-11-02'),
  raw: { from: 'now-1d', to: 'now' },
};
const build = (filters: unknown[]) =>
  buildMetricsQuery(
    {
      refId: 'A',
      metricsQuery: JSON.stringify({
        view: 'observations',
        metrics: [{ measure: 'count', aggregation: 'count' }],
        filters,
      }),
    },
    range,
    60000
  );
it.each([
  { column: 'environment', type: 'string', operator: '=', value: 'production' },
  { column: 'name', type: 'stringOptions', operator: 'any of', value: ['one', 'two'] },
  { column: 'tags', type: 'arrayOptions', operator: 'all of', value: ['synthetic'] },
  { column: 'promptVersion', type: 'number', operator: '>=', value: 2 },
  { column: 'isRootObservation', type: 'boolean', operator: '=', value: true },
  { column: 'startTime', type: 'datetime', operator: '>=', value: '2026-11-01T00:00:00Z' },
  { column: 'metadata', type: 'stringObject', key: 'team', operator: '=', value: 'synthetic' },
  { column: 'userId', type: 'null', operator: 'is null', value: '' },
])('preserves documented typed filter %j', (filter) => expect(build([filter]).filters).toEqual([filter]));
it.each([
  { column: 'name', type: 'number', operator: '=', value: 2 },
  { column: 'promptVersion', type: 'number', operator: '=', value: '2' },
  { column: 'name', type: 'stringOptions', operator: 'any of', value: [] },
  { column: 'name', type: 'string', operator: '=', value: ['one', 'two'] },
  { column: 'metadata', type: 'stringObject', operator: '=', value: 'x' },
  { column: 'metadata', type: 'numberObject', key: 'count', operator: '=', value: 2 },
  { column: 'name', type: 'string', operator: 'DROP', value: 'x' },
  { column: 'unknown', type: 'string', operator: '=', value: 'x' },
  { column: 'startTime', type: 'datetime', operator: '>=', value: 'tomorrow' },
  { column: 'environment', type: 'string', operator: '=', value: 'x', url: '/arbitrary' },
])('rejects incompatible typed filter %j', (filter) => expect(() => build([filter])).toThrow('Filters'));
it('rejects oversized persisted and encoded GET queries without echoing content', () => {
  expect(() => build([{ column: 'name', type: 'string', operator: '=', value: 'x'.repeat(8100) }])).toThrow(
    'too large'
  );
  expect(() => build([{ column: 'name', type: 'string', operator: '=', value: '界'.repeat(1000) }])).toThrow(
    'too large'
  );
});
