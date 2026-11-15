import React, { useEffect } from 'react';
import { InlineField, Select } from '@grafana/ui';

import { DEFAULT_DISCOVERY_QUERY, DISCOVERY_DIMENSIONS, DISCOVERY_LOOKBACKS, type DiscoveryQuery } from './types';

export interface VariableQueryEditorProps {
  query?: DiscoveryQuery;
  onChange: (query: DiscoveryQuery, definition: string) => void;
}

export function VariableQueryEditor({ query, onChange }: VariableQueryEditorProps) {
  const configured = Boolean(query?.view && Object.hasOwn(DISCOVERY_DIMENSIONS, query.view));
  const current = configured && query ? query : DEFAULT_DISCOVERY_QUERY;
  useEffect(() => {
    if (!configured) {
      onChange(DEFAULT_DISCOVERY_QUERY, 'observations.environment (24h)');
    }
  }, [configured, onChange]);
  const change = (next: DiscoveryQuery) => onChange(next, `${next.view}.${next.dimension} (${next.lookback ?? '24h'})`);
  return (
    <>
      <InlineField label="View">
        <Select
          aria-label="Discovery view"
          value={current.view}
          options={Object.keys(DISCOVERY_DIMENSIONS).map((value) => ({ label: value, value }))}
          onChange={({ value }) => {
            if (value && Object.hasOwn(DISCOVERY_DIMENSIONS, value)) {
              const view = value as DiscoveryQuery['view'];
              const dimension = (DISCOVERY_DIMENSIONS[view] as readonly string[]).includes(current.dimension)
                ? current.dimension
                : 'environment';
              change({ ...current, view, dimension } as DiscoveryQuery);
            }
          }}
        />
      </InlineField>
      <InlineField label="Dimension">
        <Select
          aria-label="Discovery dimension"
          value={current.dimension}
          options={DISCOVERY_DIMENSIONS[current.view].map((value) => ({ label: value, value }))}
          onChange={({ value }) => {
            if (value) {
              change({ ...current, dimension: value } as DiscoveryQuery);
            }
          }}
        />
      </InlineField>
      <InlineField label="Lookback">
        <Select
          aria-label="Discovery lookback"
          value={current.lookback ?? '24h'}
          options={Object.keys(DISCOVERY_LOOKBACKS).map((value) => ({ label: value, value }))}
          onChange={({ value }) => {
            if (value) {
              change({ ...current, lookback: value as DiscoveryQuery['lookback'] });
            }
          }}
        />
      </InlineField>
      <p>
        One Metrics v2 request, maximum 1,000 groups; cached for 60 seconds. Score discovery is limited to the selected
        view. IDs and TEXT/CORRECTION score discovery are not supported.
      </p>
    </>
  );
}
