import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource';
import { ConfigEditor } from './editors/ConfigEditor';
import { QueryEditor } from './editors/QueryEditor';
import { LangfuseQuery, LangfuseDataSourceOptions } from './types';
import { VariableQueryEditor } from './variables';

export const plugin = new DataSourcePlugin<DataSource, LangfuseQuery, LangfuseDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
  .setVariableQueryEditor(VariableQueryEditor);
