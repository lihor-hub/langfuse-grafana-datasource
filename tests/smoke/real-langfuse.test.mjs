import assert from 'node:assert/strict';
import { test } from 'node:test';

const base = process.env.LANGFUSE_BASE_URL;
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secret = process.env.LANGFUSE_SECRET_KEY;

test(
  'opt-in Langfuse v4 read-only smoke (no payload snapshots)',
  { skip: !base || !publicKey || !secret },
  async () => {
    let url;
    try {
      url = new URL(base);
    } catch {
      throw new Error('Langfuse smoke requires a valid HTTP(S) base URL (value withheld)');
    }
    assert(
      ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
      'use a credential-free HTTP(S) base URL'
    );
    const to = new Date();
    const from = new Date(to.getTime() - 3600_000);
    async function read(path, params = {}) {
      const endpoint = new URL(url.toString().replace(/\/$/, '') + path);
      endpoint.search = new URLSearchParams(params).toString();
      let response;
      try {
        response = await fetch(endpoint, {
          headers: { Authorization: `Basic ${Buffer.from(`${publicKey}:${secret}`).toString('base64')}` },
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        });
      } catch {
        throw new Error('Langfuse smoke transport failed (details withheld)');
      }
      assert(response.ok, `Langfuse smoke HTTP ${response.status}`);
      let body;
      try {
        body = await response.json();
      } catch {
        throw new Error('Langfuse smoke response is not JSON');
      }
      assert(Array.isArray(body?.data), 'Langfuse smoke expected a data array');
      return body.data;
    }
    await read('/api/public/projects');
    await read('/api/public/v2/observations', {
      limit: '1',
      fields: 'core',
      fromStartTime: from.toISOString(),
      toStartTime: to.toISOString(),
    });
    await read('/api/public/v2/metrics', {
      query: JSON.stringify({
        view: 'observations',
        metrics: [{ measure: 'count', aggregation: 'count' }],
        fromTimestamp: from.toISOString(),
        toTimestamp: to.toISOString(),
        config: { row_limit: 1 },
      }),
    });
  }
);
