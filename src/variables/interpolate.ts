import type { ScopedVars } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import type { ScoreRequest } from '../client/types';
import type { LangfuseQuery } from '../types';

const reference = /\$(?:\{[\w]+(?::[^}]+)?\}|[\w]+)|\[\[[\w]+(?::[^\]]+)?\]\]/g;
const membership = new Set(['any of', 'none of', 'all of']);
// Scores v3 documents comma separators, but no quoting or escaping convention.
const scoreCsvFilters = new Set<string>([
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
] satisfies Array<keyof ScoreRequest>);
const scoreNumbers = new Set(['valueMin', 'valueMax', 'ceiling']);

function finiteNumber(value: unknown): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    String(value).trim() === '' ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error('Numeric query fields require a finite numeric value.');
  }
  return Number(value);
}

function scalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Parse before replacing: variable contents can never become JSON keys or query structure. */
export function interpolateQuery(target: LangfuseQuery, scopedVars: ScopedVars): LangfuseQuery {
  function text(value: string, allowMulti: boolean, csv = false): unknown {
    const matches = [...value.matchAll(reference)];
    if (matches.length === 0) {
      return value;
    }
    const resolved = matches.map((match) => {
      let raw: unknown;
      let found = false;
      getTemplateSrv().replace(match[0], scopedVars, (replacement: unknown) => {
        found = true;
        raw = replacement;
        return '';
      });
      if (!found) {
        throw new Error('Query contains an unresolved dashboard variable. Select a value before running it.');
      }
      if (Array.isArray(raw)) {
        if (!allowMulti || matches.length !== 1 || match[0] !== value) {
          throw new Error(
            'Multi-value variables require a documented membership operator or score CSV filter and an exact variable reference.'
          );
        }
        if (!raw.every(scalar)) {
          throw new Error('Dashboard variable values must be finite scalars.');
        }
      } else if (!scalar(raw)) {
        throw new Error('Dashboard variable values must be finite scalars.');
      }
      if (csv && (Array.isArray(raw) ? raw : [raw]).some((item) => String(item).includes(','))) {
        throw new Error('Score CSV variable values cannot contain commas; the endpoint has no documented escaping.');
      }
      return raw;
    });
    if (matches.length === 1 && matches[0][0] === value) {
      return resolved[0];
    }
    let index = 0;
    return value.replace(reference, () => String(resolved[index++]));
  }

  function walk(value: unknown, allowMulti = false, scoreRoot = false): unknown {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Query numbers must be finite.');
    }
    if (typeof value === 'string') {
      return text(value, allowMulti);
    }
    if (Array.isArray(value)) {
      const items = value.map((item) => walk(item, allowMulti));
      return allowMulti ? items.flat() : items;
    }
    if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      const isFilter =
        target.kind !== 'scores' &&
        typeof object.operator === 'string' &&
        typeof object.type === 'string' &&
        'value' in object;
      return Object.fromEntries(
        Object.entries(object).map(([key, child]) => {
          if (scoreRoot && scoreCsvFilters.has(key) && typeof child === 'string') {
            const interpolated = text(child, true, true);
            const values = Array.isArray(interpolated) ? interpolated : [interpolated];
            if (values.length === 0 || (key !== 'value' && values.some((item) => String(item).trim() === ''))) {
              throw new Error('Score CSV variable selections cannot be empty.');
            }
            return [key, values.map(String).join(',')];
          }
          if (scoreRoot && scoreNumbers.has(key)) {
            return [key, finiteNumber(walk(child))];
          }
          if (!isFilter || key !== 'value') {
            return [key, walk(child)];
          }
          const multi = membership.has(String(object.operator));
          let interpolated = walk(child, multi);
          if (multi && !Array.isArray(interpolated)) {
            interpolated = [interpolated];
          }
          function typed(item: unknown): unknown {
            if (object.type === 'number') {
              return finiteNumber(item);
            }
            if (object.type === 'boolean') {
              if (item === true || item === 'true') {
                return true;
              }
              if (item === false || item === 'false') {
                return false;
              }
              throw new Error('Boolean filters require true or false.');
            }
            return item;
          }
          return [key, Array.isArray(interpolated) ? interpolated.map(typed) : typed(interpolated)];
        })
      );
    }
    return value;
  }

  const result = { ...target };
  const key =
    target.kind === 'observations' ? 'observationsQuery' : target.kind === 'scores' ? 'scoresQuery' : 'metricsQuery';
  const source = target[key];
  if (source !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error('Query must be valid JSON before interpolating dashboard variables.');
    }
    result[key] = JSON.stringify(walk(parsed, false, target.kind === 'scores'));
  }
  return result;
}
