export const DISCOVERY_DIMENSIONS = {
  observations: ['environment', 'name', 'type', 'providedModelName', 'tags', 'release', 'promptName', 'promptVersion'],
  'scores-numeric': ['environment', 'name', 'dataType', 'source'],
  'scores-categorical': ['environment', 'name', 'dataType', 'source'],
} as const;

export const DISCOVERY_LOOKBACKS = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
} as const;

export type DiscoveryQuery = {
  [View in keyof typeof DISCOVERY_DIMENSIONS]: {
    view: View;
    dimension: (typeof DISCOVERY_DIMENSIONS)[View][number];
    lookback?: keyof typeof DISCOVERY_LOOKBACKS;
  };
}[keyof typeof DISCOVERY_DIMENSIONS];

export const DEFAULT_DISCOVERY_QUERY: DiscoveryQuery = {
  view: 'observations',
  dimension: 'environment',
  lookback: '24h',
};

export function validateDiscoveryQuery(query: DiscoveryQuery): void {
  if (
    !query ||
    !Object.hasOwn(DISCOVERY_DIMENSIONS, query.view) ||
    !(DISCOVERY_DIMENSIONS[query.view] as readonly string[]).includes(query.dimension) ||
    !Object.hasOwn(DISCOVERY_LOOKBACKS, query.lookback ?? '24h') ||
    Object.keys(query).some((key) => !['view', 'dimension', 'lookback', 'refId'].includes(key))
  ) {
    throw new Error('Select a supported discovery view, low-cardinality dimension and lookback.');
  }
}
