import type { DataSourceInstanceSettings } from '@grafana/data';
import { getBackendSrv, isFetchError, type BackendSrv } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';

import type { LangfuseDataSourceOptions } from '../types';
import { LangfuseClientError } from './errors';
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
  const baseUrl = instanceSettings.url!;

  async function get<T>(path: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    try {
      const response = await lastValueFrom(
        backendSrv.fetch<T>({
          url: `${baseUrl}${path}`,
          method: 'GET',
          params,
          headers: undefined,
          abortSignal: signal,
          showErrorAlert: false,
        })
      );
      return response.data;
    } catch (error) {
      throw normalizeGrafanaError(error, path.includes('/v2/observations'));
    }
  }

  return {
    async checkConnection(signal) {
      const projects = await get<{ data: Array<{ id: string }> }>('/api/public/projects', {}, signal);
      const project = projects.data[0];
      if (!project) {
        throw new LangfuseClientError('unexpected', 'Langfuse returned no accessible projects.');
      }

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
        signal
      );

      return { projectId: project.id, apiVersion: 'v4' };
    },

    queryMetrics(request: MetricsRequest, signal?: AbortSignal): Promise<MetricsResponse> {
      return get('/api/public/v2/metrics', { ...request }, signal);
    },

    listObservations(request: ObservationRequest, signal?: AbortSignal): Promise<ObservationPage> {
      return get('/api/public/v2/observations', { ...request }, signal);
    },

    listScores(request: ScoreRequest, signal?: AbortSignal): Promise<ScorePage> {
      return get('/api/public/v3/scores', { ...request }, signal);
    },
  };
}

function normalizeGrafanaError(error: unknown, observationV2: boolean): LangfuseClientError {
  if (isFetchError(error)) {
    if (error.cancelled) {
      return new LangfuseClientError('cancelled', 'The request was aborted.');
    }
    if (
      error.status === 401 ||
      error.status === 403 ||
      (error.status === 400 && isGrafanaProxyAuthFailure(error.data))
    ) {
      return new LangfuseClientError('unauthorized', 'Langfuse rejected the Grafana proxy credentials.', error.status);
    }
    if (observationV2 && error.status === 404) {
      return new LangfuseClientError('v4-required', 'Observations v2 returned HTTP 404.', 404);
    }
    return new LangfuseClientError('unexpected', 'Langfuse returned an unexpected response.', error.status);
  }

  return new LangfuseClientError('network', 'The Langfuse request failed.');
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
