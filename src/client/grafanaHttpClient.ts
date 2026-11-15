import type { DataSourceInstanceSettings } from '@grafana/data';
import { getBackendSrv, isFetchError, type BackendSrv } from '@grafana/runtime';
import { fromEvent, lastValueFrom, takeUntil } from 'rxjs';

import type { LangfuseDataSourceOptions } from '../types';
import { LangfuseClientError, safeRetryAfter } from './errors';
import { isMetricsResponse, isObservationPage, isProjectsResponse, isScorePage } from './responseGuards';
import type {
  LangfuseObservabilityClient,
  MetricsRequest,
  MetricsResponse,
  ObservationPage,
  ObservationRequest,
  ScorePage,
  ScoreRequest,
} from './types';

type Clock = () => Date;
const GRAFANA_PROXY_AUTH_FAILURE = 'Authentication to data source failed';

export function createGrafanaHttpClient(
  instanceSettings: DataSourceInstanceSettings<LangfuseDataSourceOptions>,
  backendSrv: BackendSrv = getBackendSrv(),
  now: Clock = () => new Date()
): LangfuseObservabilityClient {
  const baseUrl = instanceSettings.url?.replace(/\/$/, '');

  async function get<T>(
    path: string,
    params: Record<string, unknown>,
    guard: (value: unknown) => value is T,
    signal?: AbortSignal,
    v4Probe = false
  ): Promise<T> {
    try {
      if (signal?.aborted) {
        throw new LangfuseClientError('cancelled', 'The request was cancelled.');
      }
      if (!validProxyUrl(baseUrl)) {
        throw new LangfuseClientError('configuration', 'Invalid Grafana data proxy URL.');
      }
      const request = backendSrv.fetch<unknown>({
        url: `${baseUrl}${path}`,
        method: 'GET',
        params,
        headers: undefined,
        abortSignal: signal,
        retry: 0,
        showErrorAlert: false,
      });
      const response = await lastValueFrom(signal ? request.pipe(takeUntil(fromEvent(signal, 'abort'))) : request);
      if (!guard(response.data)) {
        throw new LangfuseClientError('malformed-response', 'Langfuse returned an incompatible response.');
      }
      return response.data;
    } catch (error) {
      throw normalizeGrafanaError(error, v4Probe, signal);
    }
  }

  return {
    async checkConnection(signal) {
      const projects = await get('/api/public/projects', {}, isProjectsResponse, signal);
      const project = projects.data[0];

      const to = now();
      const from = new Date(to.getTime() - 60 * 60 * 1000);
      await get<ObservationPage>(
        '/api/public/v2/observations',
        {
          fields: 'core',
          limit: 1,
          fromStartTime: from.toISOString(),
          toStartTime: to.toISOString(),
        },
        isObservationPage,
        signal,
        true
      );

      return { projectId: project.id, apiVersion: 'v4' };
    },

    queryMetrics(request: MetricsRequest, signal?: AbortSignal): Promise<MetricsResponse> {
      return get('/api/public/v2/metrics', { ...request }, isMetricsResponse, signal);
    },

    listObservations(request: ObservationRequest, signal?: AbortSignal): Promise<ObservationPage> {
      return get('/api/public/v2/observations', { ...request }, isObservationPage, signal);
    },

    listScores(request: ScoreRequest, signal?: AbortSignal): Promise<ScorePage> {
      return get('/api/public/v3/scores', { ...request }, isScorePage, signal);
    },
  };
}

function normalizeGrafanaError(error: unknown, v4Probe: boolean, signal?: AbortSignal): LangfuseClientError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return new LangfuseClientError('cancelled', 'The request was cancelled.');
  }
  if (error instanceof LangfuseClientError) {
    return error;
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new LangfuseClientError('timeout', 'The request timed out.');
  }
  if (error instanceof SyntaxError) {
    return new LangfuseClientError('malformed-response', 'The response was not valid JSON.');
  }
  if (isFetchError(error)) {
    const status = error.status;
    if (error.cancelled) {
      return new LangfuseClientError('cancelled', 'The request was cancelled.', status);
    }
    if (status === 401 || (status === 400 && isGrafanaProxyAuthFailure(error.data))) {
      return new LangfuseClientError('unauthorized', 'Langfuse rejected the Grafana proxy credentials.', status);
    }
    if (status === 403) {
      return new LangfuseClientError('forbidden', 'Langfuse denied access to this project.', status);
    }
    if (v4Probe && status === 404) {
      return new LangfuseClientError(
        'v4-required',
        'Observations v2 returned HTTP 404 after project validation.',
        status
      );
    }
    if (status === 429) {
      const headers = 'headers' in error ? error.headers : undefined;
      const value = headers instanceof Headers ? headers.get('retry-after') : retryAfterHeader(headers);
      return new LangfuseClientError(
        'rate-limit',
        'Langfuse rate limit reached.',
        status,
        safeRetryAfter(value) ? String(value) : undefined
      );
    }
    if (status === 408 || status === 504) {
      return new LangfuseClientError('timeout', 'The request timed out.', status);
    }
    if (status === 414) {
      return new LangfuseClientError('url-too-long', 'The query URL is too long.', status);
    }
    if (status === 400 || status === 413 || status === 422) {
      return new LangfuseClientError('invalid-query', 'Langfuse rejected the query or filter.', status);
    }
    if (status >= 500 && status !== 502) {
      return new LangfuseClientError('server', 'Langfuse returned a server error.', status);
    }
    return new LangfuseClientError('network', 'The Grafana proxy request failed.', status);
  }
  return new LangfuseClientError('network', 'The Langfuse request failed.');
}

function retryAfterHeader(headers: unknown): unknown {
  if (typeof headers !== 'object' || headers === null) {
    return undefined;
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'retry-after');
  return entry?.[1];
}

function validProxyUrl(value: string | undefined): boolean {
  if (!value || value.startsWith('//') || /[\\\s]/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value, 'https://grafana.invalid');
    return (
      (!value.includes(':') || /^https?:\/\//.test(value)) &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isGrafanaProxyAuthFailure(data: unknown): boolean {
  if (data === GRAFANA_PROXY_AUTH_FAILURE) {
    return true;
  }
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  return (
    ('message' in data && data.message === GRAFANA_PROXY_AUTH_FAILURE) ||
    ('response' in data && data.response === GRAFANA_PROXY_AUTH_FAILURE)
  );
}
