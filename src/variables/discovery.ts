import type { MetricFindValue } from '@grafana/data';

import type { LangfuseObservabilityClient } from '../client/types';
import { DISCOVERY_LOOKBACKS, type DiscoveryQuery, validateDiscoveryQuery } from './types';

interface CacheEntry {
  promise: Promise<MetricFindValue[]>;
  controller: AbortController;
  users: number;
  expires?: number;
}

const incompatible = 'Langfuse returned an incompatible discovery response.';
const cancelled = () => new DOMException('Variable discovery cancelled.', 'AbortError');

/** Create once per DataSource instance; never share a runner between clients/projects. */
export function createDiscoveryQueryRunner(client: LangfuseObservabilityClient) {
  const cache = new Map<string, CacheEntry>();
  return async (query: DiscoveryQuery, options?: { signal?: AbortSignal }): Promise<MetricFindValue[]> => {
    validateDiscoveryQuery(query);
    const signal = options?.signal;
    if (signal?.aborted) {
      throw cancelled();
    }
    const lookback = query.lookback ?? '24h';
    const key = JSON.stringify([query.view, query.dimension, lookback]);
    let entry = cache.get(key);
    if (entry?.expires !== undefined && Date.now() >= entry.expires) {
      cache.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const controller = new AbortController();
      const now = Date.now();
      const request = {
        view: query.view,
        dimensions: [{ field: query.dimension }],
        orderBy: [{ field: query.dimension, direction: 'asc' }],
        metrics: [{ measure: 'count', aggregation: 'count' }],
        filters: [],
        fromTimestamp: new Date(now - DISCOVERY_LOOKBACKS[lookback]).toISOString(),
        toTimestamp: new Date(now).toISOString(),
        config: { row_limit: 1000 },
      };
      const created: CacheEntry = { controller, users: 0, promise: Promise.resolve([]) };
      created.promise = Promise.resolve()
        .then(() => {
          if (controller.signal.aborted) {
            throw cancelled();
          }
          return client.queryMetrics({ query: JSON.stringify(request) }, controller.signal);
        })
        .then((response) => {
          if (!response || !Array.isArray(response.data) || response.data.length > 1000) {
            throw new Error(incompatible);
          }
          const values = new Set<string>();
          for (const row of response.data) {
            if (!row || typeof row !== 'object' || Array.isArray(row) || !Object.hasOwn(row, query.dimension)) {
              throw new Error(incompatible);
            }
            const raw = row[query.dimension];
            const cells = Array.isArray(raw) && query.dimension === 'tags' ? raw : [raw];
            for (const value of cells) {
              if (value === null || value === '') {
                continue;
              }
              if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
                throw new Error(incompatible);
              }
              values.add(String(value));
            }
          }
          created.expires = Date.now() + 60_000;
          return [...values].sort().map((value) => ({ text: value, value }));
        })
        .catch((error: unknown) => {
          if (cache.get(key) === created) {
            cache.delete(key);
          }
          throw error;
        });
      cache.set(key, created);
      entry = created;
    }
    const shared = entry;
    shared.users++;
    return new Promise<MetricFindValue[]>((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) {
          return false;
        }
        finished = true;
        signal?.removeEventListener('abort', abort);
        shared.users--;
        if (shared.users === 0 && shared.expires === undefined) {
          if (cache.get(key) === shared) {
            cache.delete(key);
          }
          shared.controller.abort();
        }
        return true;
      };
      const abort = () => {
        if (finish()) {
          reject(cancelled());
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      shared.promise.then(
        (values) => {
          if (finish()) {
            resolve(values.map((value) => ({ ...value })));
          }
        },
        (error: unknown) => {
          if (finish()) {
            reject(error);
          }
        }
      );
    });
  };
}
