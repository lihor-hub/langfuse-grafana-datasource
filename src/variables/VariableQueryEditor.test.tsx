import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { VariableQueryEditor } from './VariableQueryEditor';

beforeAll(() => {
  // jsdom has no layout observer; keep the real Grafana Select/menu behavior.
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: jest.fn(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() })),
  });
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IntersectionObserver');
});

it('shows bounded defaults and emits a selected lookback with its readable definition', () => {
  const onChange = jest.fn();
  render(<VariableQueryEditor query={undefined} onChange={onChange} />);
  expect(screen.getByText('environment')).toBeVisible();
  expect(onChange).toHaveBeenCalledWith(
    { view: 'observations', dimension: 'environment', lookback: '24h' },
    'observations.environment (24h)'
  );
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Discovery lookback' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByText('7d'));
  expect(onChange).toHaveBeenCalledWith(
    { view: 'observations', dimension: 'environment', lookback: '7d' },
    'observations.environment (7d)'
  );
});

it('resets an incompatible dimension when selecting a score view', () => {
  const onChange = jest.fn();
  render(
    <VariableQueryEditor query={{ view: 'observations', dimension: 'tags', lookback: '6h' }} onChange={onChange} />
  );
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Discovery view' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByText('scores-categorical'));
  expect(onChange).toHaveBeenCalledWith(
    { view: 'scores-categorical', dimension: 'environment', lookback: '6h' },
    'scores-categorical.environment (6h)'
  );
});

it('only offers low-cardinality dimensions and explains bounds', () => {
  render(<VariableQueryEditor query={{ view: 'observations', dimension: 'environment' }} onChange={jest.fn()} />);
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Discovery dimension' }), { key: 'ArrowDown' });
  expect(screen.getByText('promptVersion')).toBeVisible();
  expect(screen.queryByText('traceId')).not.toBeInTheDocument();
  expect(screen.getByText(/1,000/)).toBeVisible();
});
