import {
  DataSourceApi,
  type DataQueryRequest,
  type DataQueryResponse,
  type DataSourceInstanceSettings,
  type TestDataSourceResponse,
} from '@grafana/data';

import type { LangfuseObservabilityClient } from './client/types';
import { connectionErrorMessage } from './client/errors';
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

  async query(_request: DataQueryRequest<LangfuseQuery>): Promise<DataQueryResponse> {
    return { data: [] };
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
