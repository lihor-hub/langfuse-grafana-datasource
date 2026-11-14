import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import type { DataSource } from '../datasource';
import { DEFAULT_METRICS_QUERY } from '../metrics';
import { QueryEditor } from './QueryEditor';

it('shows a useful count query and runs a valid editor on blur', () => {
  const onChange = jest.fn();
  const onRunQuery = jest.fn();
  render(
    <QueryEditor
      {...({ query: { refId: 'A' }, datasource: {} as DataSource, onChange, onRunQuery } as React.ComponentProps<
        typeof QueryEditor
      >)}
    />
  );
  const input = screen.getByRole('textbox', { name: 'Metrics v2 query (JSON)' });
  expect(input).toHaveValue(DEFAULT_METRICS_QUERY);
  fireEvent.blur(input);
  expect(onRunQuery).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: '{' } });
  expect(onChange).toHaveBeenCalledWith({ refId: 'A', kind: 'metrics', metricsQuery: '{' });
});

it('keeps invalid JSON visible and does not execute it', () => {
  const onRunQuery = jest.fn();
  render(
    <QueryEditor
      {...({
        query: { refId: 'A', metricsQuery: '{' },
        datasource: {} as DataSource,
        onChange: jest.fn(),
        onRunQuery,
      } as React.ComponentProps<typeof QueryEditor>)}
    />
  );
  const input = screen.getByRole('textbox', { name: 'Metrics v2 query (JSON)' });
  expect(input).toHaveValue('{');
  expect(screen.getByText('Metrics query must be valid JSON.')).toBeVisible();
  fireEvent.blur(input);
  expect(onRunQuery).not.toHaveBeenCalled();
});
