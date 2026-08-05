import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DataSourcePluginOptionsEditorProps, DataSourceSettings } from '@grafana/data';

import { ConfigEditor } from './ConfigEditor';
import type { LangfuseDataSourceOptions, LangfuseSecureJsonData } from '../types';

type Props = DataSourcePluginOptionsEditorProps<LangfuseDataSourceOptions, LangfuseSecureJsonData>;

function configuredOptions(
  overrides: Partial<DataSourceSettings<LangfuseDataSourceOptions, LangfuseSecureJsonData>> = {}
): DataSourceSettings<LangfuseDataSourceOptions, LangfuseSecureJsonData> {
  return {
    id: 1,
    uid: 'langfuse-test',
    orgId: 1,
    name: 'Langfuse test',
    typeLogoUrl: '',
    type: 'lihorhub-langfuse-datasource',
    typeName: 'Langfuse',
    access: 'proxy',
    url: 'https://cloud.langfuse.com',
    user: '',
    database: '',
    basicAuth: true,
    basicAuthUser: 'pk-test',
    isDefault: false,
    jsonData: { timeout: 30 },
    secureJsonData: {},
    secureJsonFields: {},
    readOnly: false,
    withCredentials: false,
    ...overrides,
  };
}

function renderEditor(options = configuredOptions()) {
  const onOptionsChange = jest.fn<void, Parameters<Props['onOptionsChange']>>();
  render(<ConfigEditor options={options} onOptionsChange={onOptionsChange} />);
  return { onOptionsChange };
}

describe('ConfigEditor', () => {
  it('marks the base URL, public key, and secret key as required', () => {
    renderEditor(configuredOptions({ url: '', basicAuthUser: '', basicAuth: false }));

    expect(screen.getByLabelText('Langfuse base URL')).toBeRequired();
    expect(screen.getByLabelText('Langfuse public key')).toBeRequired();
    expect(screen.getByLabelText('Langfuse secret key')).toBeRequired();
  });

  it('normalizes trailing slashes from the Langfuse base URL on blur', () => {
    const { onOptionsChange } = renderEditor();
    const input = screen.getByRole('textbox', { name: 'Langfuse base URL' });

    fireEvent.change(input, { target: { value: '  https://langfuse.example.test///  ' } });
    fireEvent.blur(input);

    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://langfuse.example.test' }));
  });

  it('maps Langfuse keys to Grafana Basic Auth fields', () => {
    const { onOptionsChange } = renderEditor();

    fireEvent.change(screen.getByRole('textbox', { name: 'Langfuse public key' }), {
      target: { value: 'pk-new' },
    });
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ basicAuth: true, basicAuthUser: 'pk-new' })
    );

    fireEvent.change(screen.getByLabelText('Langfuse secret key'), {
      target: { value: 'sk-new' },
    });
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secureJsonData: { basicAuthPassword: 'sk-new' },
      })
    );
  });

  it('preserves a saved secret until the user explicitly resets it', () => {
    const options = configuredOptions({
      secureJsonData: undefined,
      secureJsonFields: { basicAuthPassword: true },
    });
    const { onOptionsChange } = renderEditor(options);

    fireEvent.change(screen.getByRole('textbox', { name: 'Langfuse public key' }), {
      target: { value: 'pk-updated' },
    });
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secureJsonData: undefined,
        secureJsonFields: { basicAuthPassword: true },
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secureJsonData: { basicAuthPassword: '' },
        secureJsonFields: { basicAuthPassword: false },
      })
    );
  });

  it('stores timeout and the optional Langfuse UI URL in JSON data', () => {
    const { onOptionsChange } = renderEditor();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Timeout in seconds' }), {
      target: { value: '45' },
    });
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ jsonData: { timeout: 45 } }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Langfuse UI URL' }), {
      target: { value: 'https://app.langfuse.example.test' },
    });
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jsonData: {
          timeout: 30,
          langfuseUiUrl: 'https://app.langfuse.example.test',
        },
      })
    );
  });
});
