import React, { type ChangeEvent, type FocusEvent, useState } from 'react';
import type { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { InlineField, Input, SecretInput } from '@grafana/ui';

import type { LangfuseDataSourceOptions, LangfuseSecureJsonData } from '../types';

type Props = DataSourcePluginOptionsEditorProps<LangfuseDataSourceOptions, LangfuseSecureJsonData>;

export function normalizeLangfuseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function ConfigEditor({ options, onOptionsChange }: Props) {
  const [url, setUrl] = useState(options.url);

  const onUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUrl(event.currentTarget.value);
    onOptionsChange({ ...options, url: event.currentTarget.value });
  };

  const onUrlBlur = (event: FocusEvent<HTMLInputElement>) => {
    const normalized = normalizeLangfuseUrl(event.currentTarget.value);
    setUrl(normalized);
    onOptionsChange({ ...options, url: normalized });
  };

  const onPublicKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      basicAuth: true,
      basicAuthUser: event.currentTarget.value,
    });
  };

  const onSecretKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      basicAuth: true,
      secureJsonData: {
        ...options.secureJsonData,
        basicAuthPassword: event.currentTarget.value,
      },
    });
  };

  const onSecretKeyReset = () => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...options.secureJsonData,
        basicAuthPassword: '',
      },
      secureJsonFields: {
        ...options.secureJsonFields,
        basicAuthPassword: false,
      },
    });
  };

  const onTimeoutChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        timeout: Number(event.currentTarget.value),
      },
    });
  };

  const onUiUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        langfuseUiUrl: event.currentTarget.value,
      },
    });
  };

  return (
    <>
      <InlineField label="Langfuse base URL" required>
        <Input
          aria-label="Langfuse base URL"
          required
          placeholder="https://cloud.langfuse.com"
          value={url}
          onChange={onUrlChange}
          onBlur={onUrlBlur}
        />
      </InlineField>
      <InlineField label="Langfuse public key" required>
        <Input
          aria-label="Langfuse public key"
          required
          placeholder="pk-lf-..."
          value={options.basicAuthUser}
          onChange={onPublicKeyChange}
        />
      </InlineField>
      <InlineField label="Langfuse secret key" required>
        <SecretInput
          aria-label="Langfuse secret key"
          required
          placeholder="sk-lf-..."
          isConfigured={Boolean(options.secureJsonFields.basicAuthPassword)}
          value={options.secureJsonData?.basicAuthPassword ?? ''}
          onChange={onSecretKeyChange}
          onReset={onSecretKeyReset}
        />
      </InlineField>
      <InlineField label="Timeout in seconds">
        <Input
          aria-label="Timeout in seconds"
          type="number"
          min={1}
          value={options.jsonData.timeout ?? 30}
          onChange={onTimeoutChange}
        />
      </InlineField>
      <InlineField label="Langfuse UI URL">
        <Input
          aria-label="Langfuse UI URL"
          placeholder="Optional link target"
          value={options.jsonData.langfuseUiUrl ?? ''}
          onChange={onUiUrlChange}
        />
      </InlineField>
    </>
  );
}
