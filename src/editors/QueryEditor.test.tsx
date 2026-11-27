import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ScopedVars } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import type { DataSource } from '../datasource';
import { DEFAULT_METRICS_QUERY } from '../metrics';
import type { LangfuseQuery } from '../types';
import { QueryEditor } from './QueryEditor';

jest.mock('@grafana/runtime', () => ({ ...jest.requireActual('@grafana/runtime'), getTemplateSrv: jest.fn() }));

const canvas = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
  measureText: () => ({ width: 100 }),
} as unknown as CanvasRenderingContext2D);
const originalObserver = globalThis.IntersectionObserver;
beforeAll(() => {
  globalThis.IntersectionObserver = jest.fn().mockReturnValue({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  });
});
afterAll(() => {
  canvas.mockRestore();
  globalThis.IntersectionObserver = originalObserver;
});
beforeEach(() => {
  jest.mocked(getTemplateSrv).mockReturnValue({
    replace: (text: string, scoped: ScopedVars, format: (value: unknown) => string) => {
      const name = text.replace(/^\$\{?|\}$/g, '');
      return scoped[name] ? format(scoped[name].value) : text;
    },
  } as unknown as ReturnType<typeof getTemplateSrv>);
});

function setup(query: LangfuseQuery, scopedVars: ScopedVars = {}) {
  const onChange = jest.fn();
  const onRunQuery = jest.fn();
  render(
    <QueryEditor
      {...({
        query,
        datasource: {} as DataSource,
        data: { series: [], request: { scopedVars } },
        onChange,
        onRunQuery,
      } as unknown as React.ComponentProps<typeof QueryEditor>)}
    />
  );
  return { onChange, onRunQuery };
}

it('shows a useful count query and runs a valid advanced editor on blur', () => {
  const { onChange, onRunQuery } = setup({ refId: 'A', editorMode: 'advanced' });
  const input = screen.getByRole('textbox', { name: 'Metrics v2 query (JSON)' });
  expect(input).toHaveValue(DEFAULT_METRICS_QUERY);
  fireEvent.blur(input);
  expect(onRunQuery).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: '{' } });
  expect(onChange).toHaveBeenCalledWith({ refId: 'A', editorMode: 'advanced', kind: 'metrics', metricsQuery: '{' });
});

it('keeps invalid JSON visible and does not execute it', () => {
  const { onRunQuery } = setup({ refId: 'A', metricsQuery: '{' });
  const input = screen.getByRole('textbox', { name: 'Metrics v2 query (JSON)' });
  expect(input).toHaveValue('{');
  expect(screen.getByText('Metrics query must be valid JSON.')).toBeVisible();
  fireEvent.blur(input);
  expect(onRunQuery).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Run query' })).toBeDisabled();
});

it('switches kinds without discarding canonical or invalid inactive drafts', () => {
  const query: LangfuseQuery = {
    refId: 'A',
    metricsQuery: DEFAULT_METRICS_QUERY,
    observationsQuery: '{',
    scoresQuery: '{"name":"synthetic"}',
  };
  const { onChange } = setup(query);
  const input = screen.getByRole('combobox', { name: 'Query kind' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'End' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith({ ...query, kind: 'scores' });
});

it.each(['Score', 'no matching query kind'])('ignores an empty Query kind selection for "%s"', (search) => {
  const query: LangfuseQuery = {
    refId: 'A',
    kind: 'observations',
    metricsQuery: DEFAULT_METRICS_QUERY,
    observationsQuery: '{',
    scoresQuery: '{"name":"synthetic"}',
  };
  const { onChange, onRunQuery } = setup(query);
  const input = screen.getByRole('combobox', { name: 'Query kind' });
  fireEvent.change(input, { target: { value: search } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).not.toHaveBeenCalled();
  expect(onRunQuery).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Observation query (JSON)' })).toHaveValue('{');
});

it.each([
  {
    kind: 'metrics' as const,
    key: 'metricsQuery' as const,
    text: JSON.stringify({
      ...JSON.parse(DEFAULT_METRICS_QUERY),
      filters: [{ type: 'number', column: 'promptVersion', operator: '>=', value: '$threshold' }],
    }),
    label: 'Metrics v2 query (JSON)',
  },
  {
    kind: 'observations' as const,
    key: 'observationsQuery' as const,
    text: '{"type":"$type","filters":[{"type":"number","column":"totalCost","operator":">","value":"$threshold"}]}',
    label: 'Observation query (JSON)',
  },
  {
    kind: 'scores' as const,
    key: 'scoresQuery' as const,
    text: '{"source":"$source","dataType":"$dataType","value":"$threshold","valueMin":"$threshold"}',
    label: 'Scores v3 query (JSON)',
  },
])('validates resolved $kind values without replacing the raw JSON', ({ kind, key, text, label }) => {
  const { onRunQuery } = setup(
    { refId: 'A', kind, editorMode: 'advanced', [key]: text },
    {
      threshold: { value: '2' },
      type: { value: 'SPAN' },
      source: { value: 'API' },
      dataType: { value: 'NUMERIC' },
    }
  );
  const input = screen.getByRole('textbox', { name: label });
  expect(input).toHaveValue(text);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.blur(input);
  expect(onRunQuery).toHaveBeenCalledTimes(1);
});

it('disables Run for an unresolved variable even when the raw string filter is otherwise valid', () => {
  const { onRunQuery } = setup({
    refId: 'A',
    metricsQuery: JSON.stringify({
      ...JSON.parse(DEFAULT_METRICS_QUERY),
      filters: [{ type: 'string', column: 'environment', operator: '=', value: '$missing' }],
    }),
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Check dashboard variable selections');
  const run = screen.getByRole('button', { name: 'Run query' });
  expect(run).toBeDisabled();
  fireEvent.click(run);
  expect(onRunQuery).not.toHaveBeenCalled();
});
