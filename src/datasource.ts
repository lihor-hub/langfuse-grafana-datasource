import {
  CoreApp,
  DataSourceApi,
  type DataFrame,
  type DataQueryRequest,
  type DataQueryResponse,
  type DataSourceInstanceSettings,
  type MetricFindValue,
  type LegacyMetricFindQueryOptions,
  type TestDataSourceResponse,
} from '@grafana/data';
import { Observable } from 'rxjs';

import type { LangfuseObservabilityClient } from './client/types';
import { connectionErrorMessage, LangfuseClientError, queryErrorMessage } from './client/errors';
import { buildMetricsQuery, DEFAULT_METRICS_QUERY, metricsToFrames } from './metrics';
import { createObservabilityClient } from './client/createClient';
import {
  buildObservationRequest,
  DEFAULT_OBSERVATIONS_QUERY,
  parseObservationQuery,
  runObservationQuery,
} from './queries/observations';
import { buildScoreRequest, runScoreQuery } from './queries/scores';
import { createDiscoveryQueryRunner, interpolateQuery, type DiscoveryQuery } from './variables';
import type { LangfuseDataSourceOptions, LangfuseQuery } from './types';

type ClientFactory = (
  instanceSettings: DataSourceInstanceSettings<LangfuseDataSourceOptions>
) => LangfuseObservabilityClient;

export class DataSource extends DataSourceApi<LangfuseQuery, LangfuseDataSourceOptions> {
  private readonly proxyUrl?: string;
  private readonly uiUrl?: string;
  private readonly client: LangfuseObservabilityClient;
  private readonly discover: ReturnType<typeof createDiscoveryQueryRunner>;

  constructor(
    instanceSettings: DataSourceInstanceSettings<LangfuseDataSourceOptions>,
    clientFactory: ClientFactory = createObservabilityClient
  ) {
    super(instanceSettings);
    this.proxyUrl = instanceSettings.url;
    this.uiUrl = instanceSettings.jsonData.langfuseUiUrl;
    this.client = clientFactory(instanceSettings);
    this.discover = createDiscoveryQueryRunner(this.client);
  }

  getDefaultQuery(app = CoreApp.Dashboard): Partial<LangfuseQuery> {
    return app === CoreApp.Explore
      ? {
          kind: 'observations',
          observationsQuery: JSON.stringify({ ...JSON.parse(DEFAULT_OBSERVATIONS_QUERY), format: 'logs' }, null, 2),
        }
      : { kind: 'metrics', metricsQuery: DEFAULT_METRICS_QUERY };
  }

  metricFindQuery(
    query: DiscoveryQuery,
    options?: LegacyMetricFindQueryOptions & { signal?: AbortSignal }
  ): Promise<MetricFindValue[]> {
    return this.discover(query, options);
  }

  query(request: DataQueryRequest<LangfuseQuery>): Observable<DataQueryResponse> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      const targets = request.targets.filter((target) => !target.hide);
      const results: DataFrame[][] = [];
      const failures: string[] = [];
      let next = 0;
      const worker = async () => {
        while (next < targets.length && !controller.signal.aborted) {
          const index = next++;
          const original = targets[index];
          let run: () => Promise<DataFrame[]>;
          try {
            const target = interpolateQuery(original, request.scopedVars ?? {});
            switch (target.kind) {
              case 'observations':
                buildObservationRequest(parseObservationQuery(target.observationsQuery), request);
                run = () => runObservationQuery(this.client, target, request, controller.signal, this.uiUrl);
                break;
              case 'scores':
                buildScoreRequest(target, request.range);
                run = () => runScoreQuery(this.client, target, request, controller.signal);
                break;
              case undefined:
              case 'metrics': {
                const definition = buildMetricsQuery(target, request.range, request.intervalMs);
                run = async () => {
                  const response = await this.client.queryMetrics(
                    { query: JSON.stringify(definition) },
                    controller.signal
                  );
                  try {
                    return metricsToFrames(response?.data, definition, target.refId);
                  } catch {
                    throw new LangfuseClientError('malformed-response', 'Incompatible metrics response.');
                  }
                };
                break;
              }
              default:
                throw new Error('Unsupported query kind.');
            }
          } catch {
            failures[index] =
              `${original.refId}: ${queryErrorMessage(new LangfuseClientError('invalid-query', 'Invalid query definition.'))}`;
            continue;
          }
          try {
            results[index] = await run();
          } catch (error) {
            failures[index] = `${original.refId}: ${queryErrorMessage(error)}`;
          }
        }
      };
      void Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker)).then(() => {
        if (subscriber.closed) {
          return;
        }
        const data = results.flat();
        const errors = failures.filter(Boolean);
        if (errors.length && data.length === 0) {
          subscriber.error(new Error(errors.join(' ')));
          return;
        }
        if (errors.length) {
          for (const frame of data) {
            frame.meta = {
              ...frame.meta,
              notices: [...(frame.meta?.notices ?? []), { severity: 'warning', text: errors.join(' ') }],
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
