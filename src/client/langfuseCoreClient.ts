import type { DataSourceInstanceSettings } from '@grafana/data';
import {
  LangfuseAPIClient,
  LangfuseAPIError,
  LangfuseAPITimeoutError,
  type GetMetricsV2Request,
  type GetObservationsV2Request,
  type GetScoresV3Request,
} from '@langfuse/core';

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

export function createLangfuseCoreClient(
  instanceSettings: DataSourceInstanceSettings<LangfuseDataSourceOptions>,
  now: Clock = () => new Date()
): LangfuseObservabilityClient {
  const api = new LangfuseAPIClient({
    environment: 'https://unused.invalid',
    baseUrl: instanceSettings.url!,
  });
  const timeoutInSeconds = instanceSettings.jsonData.timeout;

  const requestOptions = (signal?: AbortSignal) => ({
    abortSignal: signal,
    maxRetries: 0,
    timeoutInSeconds,
  });

  return {
    async checkConnection(signal) {
      let projects;
      try {
        projects = await api.projects.get(requestOptions(signal));
      } catch (error) {
        throw normalizeCoreError(error);
      }

      const project = projects.data[0];
      if (!project) {
        throw new LangfuseClientError('unexpected', 'Langfuse returned no accessible projects.');
      }

      const to = now();
      const from = new Date(to.getTime() - 60 * 60 * 1000);
      try {
        await api.observations.getMany(
          {
            fields: 'core',
            limit: 1,
            fromStartTime: from.toISOString(),
            toStartTime: to.toISOString(),
          },
          requestOptions(signal)
        );
      } catch (error) {
        throw normalizeCoreError(error, true);
      }

      return { projectId: project.id, apiVersion: 'v4' };
    },

    async queryMetrics(request: MetricsRequest, signal?: AbortSignal): Promise<MetricsResponse> {
      try {
        return await api.metrics.metrics(request as GetMetricsV2Request, requestOptions(signal));
      } catch (error) {
        throw normalizeCoreError(error);
      }
    },

    async listObservations(request: ObservationRequest, signal?: AbortSignal): Promise<ObservationPage> {
      try {
        return (await api.observations.getMany(
          request as GetObservationsV2Request,
          requestOptions(signal)
        )) as unknown as ObservationPage;
      } catch (error) {
        throw normalizeCoreError(error, true);
      }
    },

    async listScores(request: ScoreRequest, signal?: AbortSignal): Promise<ScorePage> {
      try {
        return (await api.scoresV3.getManyV3(
          request as GetScoresV3Request,
          requestOptions(signal)
        )) as unknown as ScorePage;
      } catch (error) {
        throw normalizeCoreError(error);
      }
    },
  };
}

function normalizeCoreError(error: unknown, observationV2 = false): LangfuseClientError {
  if (error instanceof LangfuseAPIError) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new LangfuseClientError(
        'unauthorized',
        'Langfuse rejected the Grafana proxy credentials.',
        error.statusCode
      );
    }
    if (observationV2 && error.statusCode === 404) {
      return new LangfuseClientError('v4-required', 'Observations v2 returned HTTP 404.', 404);
    }
    if (error.message.toLowerCase().includes('aborted')) {
      return new LangfuseClientError('cancelled', 'The request was aborted.');
    }
    return new LangfuseClientError('unexpected', 'Langfuse returned an unexpected response.', error.statusCode);
  }

  if (error instanceof LangfuseAPITimeoutError) {
    return new LangfuseClientError('timeout', 'The Langfuse request timed out.');
  }

  return new LangfuseClientError('network', 'The Langfuse request failed.');
}
