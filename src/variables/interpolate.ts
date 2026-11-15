import type { ScopedVars } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import type { LangfuseQuery } from '../types';

const reference = /\$(?:\{[\w]+(?::[^}]+)?\}|[\w]+)|\[\[[\w]+(?::[^\]]+)?\]\]/g;
const membership = new Set(['any of', 'none of', 'all of']);

function scalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Parse before replacing: variable contents can never become JSON keys or query structure. */
export function interpolateQuery(target: LangfuseQuery, scopedVars: ScopedVars): LangfuseQuery {
  function text(value: string, allowMulti: boolean): unknown {
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
            'Multi-value variables require an any of, none of or all of filter operator and an exact variable reference.'
          );
        }
        if (!raw.every(scalar)) {
          throw new Error('Dashboard variable values must be finite scalars.');
        }
      } else if (!scalar(raw)) {
        throw new Error('Dashboard variable values must be finite scalars.');
      }
      return raw;
    });
    if (matches.length === 1 && matches[0][0] === value) {
      return resolved[0];
    }
    let index = 0;
    return value.replace(reference, () => String(resolved[index++]));
  }

  function walk(value: unknown, allowMulti = false): unknown {
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
      const isFilter = typeof object.operator === 'string' && typeof object.type === 'string' && 'value' in object;
      return Object.fromEntries(
        Object.entries(object).map(([key, child]) => {
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
              if (
                (typeof item !== 'number' && typeof item !== 'string') ||
                String(item).trim() === '' ||
                !Number.isFinite(Number(item))
              ) {
                throw new Error('Number filters require a finite numeric variable value.');
              }
              return Number(item);
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
    result[key] = JSON.stringify(walk(parsed));
  }
  return result;
}
