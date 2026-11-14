import {
  DataSourceApi,
  type DataFrame,
  type DataQueryRequest,
  type DataQueryResponse,
  type DataSourceInstanceSettings,
  type TestDataSourceResponse,
} from '@grafana/data';

import { Observable } from 'rxjs';

import type { LangfuseObservabilityClient } from './client/types';
import { connectionErrorMessage, LangfuseClientError } from './client/errors';
import { buildMetricsQuery, DEFAULT_METRICS_QUERY, metricsToFrames } from './metrics';
import { createObservabilityClient } from './client/createClient';
import type { LangfuseDataSourceOptions, LangfuseQuery } from './types';

type ClientFactory = (
  instanceSettings: DataSourceInstanceSettings<LangfuseDataSourceOptions>
) => LangfuseObservabilityClient;

export class DataSource extends DataSourceApi<LangfuseQuery, LangfuseDataSourceOptions> {
  private readonly proxyUrl?: string;
  private readonly client: LangfuseObservabilityClient;

  constructor(
    instanceSettings: DataSourceInstanceSettings<LangfuseDataSourceOptions>,
    clientFactory: ClientFactory = createObservabilityClient
  ) {
    super(instanceSettings);
    this.proxyUrl = instanceSettings.url;
    this.client = clientFactory(instanceSettings);
  }

  getDefaultQuery(): Partial<LangfuseQuery> {
    return { kind: 'metrics', metricsQuery: DEFAULT_METRICS_QUERY };
  }

  query(request: DataQueryRequest<LangfuseQuery>): Observable<DataQueryResponse> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      const targets = request.targets.filter((target) => !target.hide);
      const data: DataFrame[] = [];
      const failures: string[] = [];
      let next = 0;
      const worker = async () => {
        while (next < targets.length && !controller.signal.aborted) {
          const target = targets[next++];
          let query;
          try {
            query = buildMetricsQuery(target, request.range, request.intervalMs);
          } catch (error) {
            failures.push(`${target.refId}: ${(error as Error).message}`);
            continue;
          }
          let response;
          try {
            response = await this.client.queryMetrics({ query: JSON.stringify(query) }, controller.signal);
          } catch (error) {
            const status = error instanceof LangfuseClientError ? error.status : undefined;
            const message =
              status === 401 || status === 403
                ? 'Check Langfuse credentials and permissions.'
                : status === 429
                  ? 'Langfuse rate limit reached; retry later.'
                  : status === 400
                    ? 'Langfuse rejected the metrics query; check supported fields and filters.'
                    : 'Langfuse metrics request failed. Check connectivity and datasource configuration.';
            failures.push(`${target.refId}: ${message}`);
            continue;
          }
          try {
            data.push(...metricsToFrames(response?.data, query, target.refId));
          } catch {
            failures.push(`${target.refId}: Langfuse returned an incompatible metrics response.`);
          }
        }
      };
      void Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker)).then(() => {
        if (subscriber.closed) {
          return;
        }
        if (failures.length && data.length === 0) {
          subscriber.error(new Error(failures.join(' ')));
          return;
        }
        if (failures.length) {
          for (const frame of data) {
            frame.meta = {
              ...frame.meta,
              notices: [...(frame.meta?.notices ?? []), { severity: 'warning', text: failures.join(' ') }],
            };
          }
        }
        subscriber.next({ data });
        subscriber.complete();
      });
      return () => controller.abort();
    });
  }

  async testDatasource(): Promise<TestDataSourceResponse> {
    if (!this.proxyUrl) {
      return {
        status: 'error',
        message: 'Langfuse base URL is required.',
      };
    }

    try {
      const connection = await this.client.checkConnection();
      return {
        status: 'success',
        message: `Connected to Langfuse ${connection.apiVersion} project ${connection.projectId}.`,
      };
    } catch (error) {
      return {
        status: 'error',
        message: connectionErrorMessage(error),
      };
    }
  }
}
