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

export interface ObservationRequest {
  fields?: string;
  expandMetadata?: string;
  limit?: number;
  cursor?: string;
  name?: string;
  userId?: string;
  type?: string;
  traceId?: string;
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  parentObservationId?: string;
  isRootObservation?: boolean;
  environment?: string | string[];
  fromStartTime?: string;
  toStartTime?: string;
  version?: string;
  filter?: string;
}

export interface Observation {
  id: string;
  traceId: string;
  startTime: string;
  projectId: string;
  type: string;
  [field: string]: unknown;
}

export interface ObservationPage {
  data: Observation[];
  meta: { cursor?: string };
}

export interface ScoreRequest {
  limit?: number;
  cursor?: string;
  fields?: string;
  id?: string;
  name?: string;
  source?: string;
  dataType?: string;
  environment?: string;
  configId?: string;
  queueId?: string;
  authorUserId?: string;
  value?: string;
  valueMin?: number;
  valueMax?: number;
  traceId?: string;
  sessionId?: string;
  observationId?: string;
  experimentId?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
}

export interface Score {
  id: string;
  name: string;
  timestamp: string;
  dataType: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL' | 'TEXT' | 'CORRECTION';
  value: number | boolean | string;
  [field: string]: unknown;
}

export interface ScorePage {
  data: Score[];
  meta: { limit: number; cursor?: string };
}

export interface LangfuseObservabilityClient {
  checkConnection(signal?: AbortSignal): Promise<ConnectionResult>;
  queryMetrics(request: MetricsRequest, signal?: AbortSignal): Promise<MetricsResponse>;
  listObservations(request: ObservationRequest, signal?: AbortSignal): Promise<ObservationPage>;
  listScores(request: ScoreRequest, signal?: AbortSignal): Promise<ScorePage>;
}
