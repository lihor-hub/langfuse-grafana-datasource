import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { dateTime, LoadingState } from '@grafana/data';
import type { LangfuseQuery } from '../types';
import type { DataSource } from '../datasource';
import { DEFAULT_METRICS_QUERY } from '../metrics';
import { MetricsQueryEditor } from './MetricsQueryEditor';

// jsdom has no layout observer; only the browser boundary is substituted.
const intersectionObserver = globalThis.IntersectionObserver;
beforeAll(() => {
  globalThis.IntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })) as unknown as typeof IntersectionObserver;
});
afterAll(() => {
  globalThis.IntersectionObserver = intersectionObserver;
});

function setup(initial: LangfuseQuery = { refId: 'A' }) {
  const changed = jest.fn();
  const run = jest.fn();
  function Host() {
    const [query, setQuery] = useState(initial);
    return (
      <MetricsQueryEditor
        {...({
          query,
          datasource: {} as DataSource,
          onChange: (next: LangfuseQuery) => {
            changed(next);
            setQuery(next);
          },
          onRunQuery: run,
        } as React.ComponentProps<typeof MetricsQueryEditor>)}
      />
    );
  }
  render(<Host />);
  return { changed, run };
}
it('starts with useful guided defaults and exposes generated aliases', () => {
  const { run } = setup();
  expect(screen.getByText('count_count')).toBeVisible();
  expect(screen.getByRole('spinbutton', { name: 'Row limit' })).toHaveValue(1000);
  fireEvent.click(screen.getByRole('button', { name: 'Run query' }));
  expect(run).toHaveBeenCalledTimes(1);
});
it('round-trips all supported fields through modes without rewriting the canonical JSON', () => {
  const metricsQuery = JSON.stringify({
    ...JSON.parse(DEFAULT_METRICS_QUERY),
    dimensions: [{ field: 'name' }],
    filters: [{ column: 'metadata', type: 'stringObject', key: 'team', operator: '=', value: 'synthetic' }],
    orderBy: [{ field: 'count_count', direction: 'desc' }],
    config: { row_limit: 25, bins: 12 },
  });
  const { changed } = setup({ refId: 'A', metricsQuery });
  fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
  expect(screen.getByRole('textbox', { name: 'Metrics v2 query (JSON)' })).toHaveValue(metricsQuery);
  fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Row limit' }), { target: { value: '50' } });
  const next = changed.mock.calls.at(-1)[0];
  expect(JSON.parse(next.metricsQuery)).toEqual({ ...JSON.parse(metricsQuery), config: { row_limit: 50, bins: 12 } });
});
it('retains invalid advanced JSON, shows inline errors, and never dispatches it', () => {
  const { changed, run } = setup({ refId: 'A', editorMode: 'advanced' });
  const input = screen.getByRole('textbox', { name: 'Metrics v2 query (JSON)' });
  fireEvent.change(input, { target: { value: '{' } });
  expect(input).toHaveValue('{');
  expect(changed.mock.calls.at(-1)[0].metricsQuery).toBe('{');
  expect(screen.getByText('Metrics query must be valid JSON.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Run query' })).toBeDisabled();
  fireEvent.blur(input);
  expect(run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
  expect(screen.getByRole('textbox', { name: 'Metrics v2 query (JSON)' })).toHaveValue('{');
});
it('removes only invalid selections when changing views and supports guided score measures', () => {
  const { changed } = setup({
    refId: 'A',
    metricsQuery: JSON.stringify({
      ...JSON.parse(DEFAULT_METRICS_QUERY),
      metrics: [
        { measure: 'count', aggregation: 'count' },
        { measure: 'latency', aggregation: 'p95' },
      ],
      dimensions: [{ field: 'name' }, { field: 'type' }],
      filters: [
        { column: 'name', type: 'string', operator: '=', value: 'synthetic' },
        { column: 'level', type: 'string', operator: '=', value: 'ERROR' },
      ],
      orderBy: [
        { field: 'count_count', direction: 'desc' },
        { field: 'p95_latency', direction: 'asc' },
      ],
    }),
  });
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Metrics view' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByText('scores-numeric', { exact: true }));
  expect(JSON.parse(changed.mock.calls.at(-1)[0].metricsQuery)).toMatchObject({
    view: 'scores-numeric',
    metrics: [{ measure: 'count', aggregation: 'count' }],
    dimensions: [{ field: 'name' }],
    filters: [{ column: 'name', type: 'string', operator: '=', value: 'synthetic' }],
    orderBy: [{ field: 'count_count', direction: 'desc' }],
  });
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Measure 1' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByText('value', { exact: true }));
  expect(screen.getByText('count_value')).toBeVisible();
});

it('validates an interpolated query without changing canonical variable placeholders', () => {
  const raw = {
    ...JSON.parse(DEFAULT_METRICS_QUERY),
    filters: [{ column: 'promptVersion', type: 'number', operator: '>=', value: '$threshold' }],
  };
  const metricsQuery = JSON.stringify(raw);
  const validationQuery = {
    refId: 'A',
    metricsQuery: JSON.stringify({ ...raw, filters: [{ ...raw.filters[0], value: 2 }] }),
  };
  const onChange = jest.fn();
  const onRunQuery = jest.fn();
  render(
    <MetricsQueryEditor
      {...({
        query: { refId: 'A', metricsQuery },
        validationQuery,
        datasource: {} as DataSource,
        onChange,
        onRunQuery,
      } as React.ComponentProps<typeof MetricsQueryEditor>)}
    />
  );
  expect(screen.getByRole('textbox', { name: 'Filter 1 value' })).toHaveValue('$threshold');
  expect(screen.getByRole('button', { name: 'Run query' })).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Run query' }));
  expect(onRunQuery).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter 1 value' }), { target: { value: '$version' } });
  expect(JSON.parse(onChange.mock.calls.at(-1)[0].metricsQuery).filters[0].value).toBe('$version');
});

it('shows the actual histogram output from returned frame metadata', () => {
  render(
    <MetricsQueryEditor
      {...({
        query: { refId: 'A' },
        datasource: {} as DataSource,
        onChange: jest.fn(),
        onRunQuery: jest.fn(),
        data: {
          state: LoadingState.Done,
          timeRange: { from: dateTime('2026-11-01'), to: dateTime('2026-11-02'), raw: { from: 'now-1d', to: 'now' } },
          series: [
            {
              refId: 'A',
              length: 0,
              fields: [],
              meta: { notices: [{ severity: 'info', text: 'Histogram output: table. Original values preserved.' }] },
            },
          ],
        },
      } as React.ComponentProps<typeof MetricsQueryEditor>)}
    />
  );
  expect(screen.getByText('Histogram output: table. Original values preserved.')).toBeVisible();
});

it('keeps typed object filters editable and round-trips guided ordering', () => {
  const { changed } = setup({
    refId: 'A',
    metricsQuery: JSON.stringify({
      ...JSON.parse(DEFAULT_METRICS_QUERY),
      filters: [{ column: 'metadata', type: 'stringObject', key: 'team', operator: '=', value: 'synthetic' }],
      orderBy: [{ field: 'count_count', direction: 'asc' }],
    }),
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter 1 key' }), { target: { value: 'owner' } });
  expect(JSON.parse(changed.mock.calls.at(-1)[0].metricsQuery).filters[0]).toEqual({
    column: 'metadata',
    type: 'stringObject',
    key: 'owner',
    operator: '=',
    value: 'synthetic',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
  const value = JSON.parse(
    (screen.getByRole('textbox', { name: 'Metrics v2 query (JSON)' }) as HTMLTextAreaElement).value
  );
  expect(value.orderBy).toEqual([{ field: 'count_count', direction: 'asc' }]);
});
