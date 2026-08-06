import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource';
import { ConfigEditor } from './editors/ConfigEditor';
import { LangfuseQuery, LangfuseDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<DataSource, LangfuseQuery, LangfuseDataSourceOptions>(
  DataSource
).setConfigEditor(ConfigEditor);
