import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DataSource } from '../datasource';
import type { LangfuseQuery } from '../types';
import { ScoreQueryEditor } from './ScoreQueryEditor';

function setup(initial: LangfuseQuery = { refId: 'A', kind: 'scores' }, validationQuery?: LangfuseQuery) {
  const onRunQuery = jest.fn();
  const onChange = jest.fn();
  function Editor() {
    const [query, setQuery] = useState(initial);
    return (
      <ScoreQueryEditor
        {...({
          query,
          validationQuery,
          datasource: {} as DataSource,
          onRunQuery,
          onChange: (next: LangfuseQuery) => {
            onChange(next);
            setQuery(next);
          },
        } as React.ComponentProps<typeof ScoreQueryEditor>)}
      />
    );
  }
  render(<Editor />);
  return { onRunQuery, onChange };
}

test('resolved validation enables execution without displaying or persisting resolved variables', () => {
  const raw = {
    refId: 'A',
    editorMode: 'advanced' as const,
    scoresQuery: '{"source":"$source","dataType":"$type","value":"$value","valueMin":"$lower","ceiling":"$limit"}',
  };
  const { onRunQuery, onChange } = setup(raw, {
    refId: 'A',
    scoresQuery: '{"source":"API","dataType":"NUMERIC","value":"0.5","valueMin":0,"ceiling":100}',
  });
  const input = screen.getByRole('textbox', { name: 'Scores v3 query (JSON)' });
  expect(input).toHaveValue(raw.scoresQuery);
  expect(screen.getByRole('button', { name: 'Run score query' })).toBeEnabled();
  fireEvent.blur(input);
  expect(onRunQuery).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
  expect(screen.getByRole('textbox', { name: 'Data types' })).toHaveValue('$type');
  expect(screen.getByRole('textbox', { name: 'Numeric lower bound' })).toHaveValue('$lower');
  fireEvent.change(screen.getByRole('textbox', { name: 'Score name' }), { target: { value: 'quality' } });
  const persisted = JSON.parse(onChange.mock.calls.at(-1)[0].scoresQuery);
  expect(persisted).toMatchObject({
    source: '$source',
    dataType: '$type',
    value: '$value',
    valueMin: '$lower',
    ceiling: '$limit',
    name: 'quality',
  });
});

test('invalid resolved values prevent execution even when raw syntax is valid', () => {
  const { onRunQuery } = setup(
    { refId: 'A', editorMode: 'advanced', scoresQuery: '{"dataType":"$type","valueMin":"$lower"}' },
    { refId: 'A', scoresQuery: '{"dataType":"BOOLEAN","valueMin":0}' }
  );
  expect(screen.getByRole('button', { name: 'Run score query' })).toBeDisabled();
  fireEvent.blur(screen.getByRole('textbox', { name: 'Scores v3 query (JSON)' }));
  expect(onRunQuery).not.toHaveBeenCalled();
});

test('guided filters and field groups round-trip the canonical advanced definition', () => {
  const { onChange, onRunQuery } = setup({
    refId: 'A',
    scoresQuery: JSON.stringify({ name: 'quality', experimentId: 'experiment-1', ceiling: 123, fields: 'details' }),
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Score name' }), { target: { value: 'accuracy' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'subject' }));
  fireEvent.click(screen.getByRole('button', { name: 'Advanced JSON' }));
  const text = screen.getByRole('textbox', { name: 'Scores v3 query (JSON)' });
  expect(JSON.parse((text as HTMLTextAreaElement).value)).toEqual({
    name: 'accuracy',
    experimentId: 'experiment-1',
    ceiling: 123,
    fields: 'details,subject',
  });
  fireEvent.change(text, { target: { value: '{"dataType":"BOOLEAN","value":"false","sessionId":"session-1"}' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
  expect(screen.getByRole('textbox', { name: 'Data types' })).toHaveValue('BOOLEAN');
  expect(screen.getByRole('textbox', { name: 'Session IDs' })).toHaveValue('session-1');
  fireEvent.click(screen.getByRole('button', { name: 'Run score query' }));
  expect(onRunQuery).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls.at(-1)[0].scoresQuery).toContain('session-1');
});

test('invalid JSON is persisted visibly, never dispatched, and can be corrected', () => {
  const { onRunQuery, onChange } = setup({ refId: 'A', editorMode: 'advanced' });
  const text = screen.getByRole('textbox', { name: 'Scores v3 query (JSON)' });
  fireEvent.change(text, { target: { value: '{' } });
  expect(onChange.mock.calls.at(-1)[0].scoresQuery).toBe('{');
  expect(text).toHaveValue('{');
  expect(screen.getByRole('button', { name: 'Run score query' })).toBeDisabled();
  fireEvent.blur(text);
  expect(onRunQuery).not.toHaveBeenCalled();
  fireEvent.change(text, { target: { value: '{"dataType":"TEXT"}' } });
  fireEvent.blur(text);
  expect(onRunQuery).toHaveBeenCalledTimes(1);
});

test('guided numeric controls store native JSON numbers, including decimal bounds', () => {
  const { onChange } = setup({ refId: 'A', scoresQuery: '{"dataType":"NUMERIC"}' });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Numeric lower bound' }), { target: { value: '0.25' } });
  expect(JSON.parse(onChange.mock.calls.at(-1)[0].scoresQuery).valueMin).toBe(0.25);
  expect(screen.getByRole('spinbutton', { name: 'Numeric lower bound' })).toHaveValue(0.25);
});

test('guided validation prevents conflicting subjects and incorrect numeric bounds', () => {
  setup();
  fireEvent.change(screen.getByRole('textbox', { name: 'Observation IDs' }), { target: { value: 'observation-1' } });
  expect(screen.getByText(/observationId requires traceId/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Run score query' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Trace IDs' }), { target: { value: 'trace-1' } });
  expect(screen.getByRole('button', { name: 'Run score query' })).toBeEnabled();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Numeric lower bound' }), { target: { value: '1' } });
  expect(screen.getByRole('button', { name: 'Run score query' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Data types' }), { target: { value: 'NUMERIC' } });
  expect(screen.getByRole('button', { name: 'Run score query' })).toBeEnabled();
});
