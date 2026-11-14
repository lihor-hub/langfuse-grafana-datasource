import type { DataSourceJsonData } from '@grafana/data';
import type { DataQuery } from '@grafana/schema';

export interface LangfuseQuery extends DataQuery {
  kind?: 'metrics' | 'observations' | 'scores';
  metricsQuery?: string;
}

export interface LangfuseDataSourceOptions extends DataSourceJsonData {
  url?: string;
  basicAuthUser?: string;
  basicAuth?: boolean;
  timeout?: number;
  langfuseUiUrl?: string;
}

export interface LangfuseSecureJsonData {
  basicAuthPassword?: string;
}
