import type { DataSourceInstanceSettings } from '@grafana/data';

import type { LangfuseDataSourceOptions } from '../types';
import { createGrafanaHttpClient } from './grafanaHttpClient';
import type { LangfuseObservabilityClient } from './types';

export function createObservabilityClient(
  instanceSettings: DataSourceInstanceSettings<LangfuseDataSourceOptions>
): LangfuseObservabilityClient {
  return createGrafanaHttpClient(instanceSettings);
}
