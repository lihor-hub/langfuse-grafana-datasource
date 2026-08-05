import type {
  GetObservationsV2Request,
  GetScoresV3Request,
  GetScoresV3Response,
  ObservationV2,
  ObservationsV2Response,
  ScoreV3,
} from '@langfuse/core';

export type ConnectionResult = {
  projectId: string;
  apiVersion: 'v4';
};

export interface MetricsRequest {
  query: string;
}

export interface MetricsResponse {
  data: Array<Record<string, unknown>>;
}

export type ObservationRequest = GetObservationsV2Request;
export type Observation = ObservationV2;
export type ObservationPage = ObservationsV2Response;

export type ScoreRequest = GetScoresV3Request;
export type Score = ScoreV3;
export type ScorePage = GetScoresV3Response;

export interface LangfuseObservabilityClient {
  checkConnection(signal?: AbortSignal): Promise<ConnectionResult>;
  queryMetrics(request: MetricsRequest, signal?: AbortSignal): Promise<MetricsResponse>;
  listObservations(request: ObservationRequest, signal?: AbortSignal): Promise<ObservationPage>;
  listScores(request: ScoreRequest, signal?: AbortSignal): Promise<ScorePage>;
}
