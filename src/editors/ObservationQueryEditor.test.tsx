import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CoreApp } from '@grafana/data';
import { ObservationQueryEditor } from './ObservationQueryEditor';

// JSDOM has no canvas; Grafana Combobox uses it only to measure menu width.
const canvas = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
  measureText: () => ({ width: 100 }),
} as unknown as CanvasRenderingContext2D);
afterAll(() => canvas.mockRestore());
function setup(
  query = { refId: 'A' } as { refId: string; observationsQuery?: string; editorMode?: 'guided' | 'advanced' },
  app = CoreApp.Dashboard
) {
  const onChange = jest.fn();
  const onRunQuery = jest.fn();
  const props = { query, app, datasource: {}, onChange, onRunQuery } as unknown as React.ComponentProps<
    typeof ObservationQueryEditor
  >;
  const view = render(<ObservationQueryEditor {...props} />);
  return { onChange, onRunQuery, ...view };
}
it.each([CoreApp.Dashboard, CoreApp.Explore])(
  'uses context defaults and preserves filters when changing format in %s',
  (app) => {
    const { onChange } = setup(
      {
        refId: 'A',
        observationsQuery:
          '{"traceId":"t1","filters":[{"type":"number","column":"totalCost","operator":">","value":0}]}',
      },
      app
    );
    expect(screen.getByRole('button', { name: app === CoreApp.Explore ? 'Logs' : 'Table' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: app === CoreApp.Explore ? 'Table' : 'Logs' }));
    expect(JSON.parse(onChange.mock.calls[0][0].observationsQuery)).toMatchObject({
      format: app === CoreApp.Explore ? 'table' : 'logs',
      traceId: 't1',
      filters: [{ column: 'totalCost', value: 0 }],
    });
  }
);
it('validates interpolated values while displaying and preserving canonical variable references', () => {
  const query = {
    refId: 'A',
    observationsQuery: JSON.stringify({
      type: '$type',
      ceiling: '$limit',
      filters: [{ type: 'number', column: 'totalCost', operator: '>', value: '$cost' }],
    }),
  };
  const onChange = jest.fn();
  render(
    <ObservationQueryEditor
      {...({
        query,
        validationQuery: {
          ...query,
          observationsQuery: JSON.stringify({
            type: 'AGENT',
            ceiling: 10,
            filters: [{ type: 'number', column: 'totalCost', operator: '>', value: 0 }],
          }),
        },
        datasource: {},
        onChange,
        onRunQuery: jest.fn(),
      } as unknown as React.ComponentProps<typeof ObservationQueryEditor>)}
    />
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Trace ID' }), { target: { value: 't1' } });
  expect(JSON.parse(onChange.mock.calls[0][0].observationsQuery)).toMatchObject({
    type: '$type',
    ceiling: '$limit',
    filters: [{ value: '$cost' }],
    traceId: 't1',
  });
});
it('retains invalid canonical JSON without executing or allowing guided edits to discard it', () => {
  const { onChange, onRunQuery } = setup({ refId: 'A', editorMode: 'advanced', observationsQuery: '{' });
  const input = screen.getByRole('textbox', { name: 'Observation query (JSON)' });
  expect(input).toHaveValue('{');
  fireEvent.blur(input);
  expect(onRunQuery).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Guided' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '{"name":"agent"}' } });
  expect(onChange.mock.calls[0][0].observationsQuery).toBe('{"name":"agent"}');
});
it('updates guided filters and explicit payload selection in the same canonical definition', () => {
  const { onChange } = setup();
  fireEvent.change(screen.getByRole('textbox', { name: 'Trace ID' }), { target: { value: 'trace-test' } });
  expect(JSON.parse(onChange.mock.calls[0][0].observationsQuery)).toMatchObject({ traceId: 'trace-test' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'io' }));
  expect(JSON.parse(onChange.mock.calls[1][0].observationsQuery).fieldGroups).toEqual(['basic', 'io']);
});
