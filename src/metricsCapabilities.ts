export type MetricsView = 'observations' | 'scores-numeric' | 'scores-categorical';
export type MetricFilterType =
  'string' | 'stringOptions' | 'arrayOptions' | 'number' | 'boolean' | 'datetime' | 'stringObject' | 'null';
export interface MetricCapability {
  aggregations: readonly string[];
  unit: string;
  requiresDimension?: string;
}
export interface MetricCapabilities {
  measures: Record<string, MetricCapability>;
  dimensions: readonly string[];
  filters: Record<string, readonly MetricFilterType[]>;
}

// Langfuse Metrics v2 dataModel.ts / types.ts. Keep this matrix shared by validation and the editor.
const numericAggregations = [
  'sum',
  'avg',
  'min',
  'max',
  'p50',
  'p75',
  'p90',
  'p95',
  'p99',
  'histogram',
  'count',
  'uniq',
];
const numeric = (unit = 'short', requiresDimension?: string): MetricCapability => ({
  aggregations: numericAggregations,
  unit,
  requiresDimension,
});
const distinct: MetricCapability = { aggregations: ['count', 'uniq'], unit: 'short' };
const count: MetricCapability = {
  aggregations: ['count', ...numericAggregations.filter((aggregation) => aggregation !== 'count')],
  unit: 'short',
};
const observationDimensions = [
  'name',
  'type',
  'level',
  'environment',
  'version',
  'providedModelName',
  'traceName',
  'release',
  'traceRelease',
  'traceVersion',
  'promptName',
  'promptVersion',
  'tags',
  'startTimeMonth',
  'isRootObservation',
  'toolNames',
  'calledToolNames',
  'costType',
  'usageType',
  'skillNamesAvailable',
  'skillsNamesLoaded',
];
const scoreDimensions = [
  'name',
  'environment',
  'source',
  'dataType',
  'configId',
  'traceName',
  'tags',
  'traceRelease',
  'traceVersion',
  'observationName',
  'observationModelName',
  'observationPromptName',
  'observationPromptVersion',
  'timestampMonth',
  'timestampDay',
];
function filters(
  dimensions: string[],
  extra: string[],
  numericFields: string[],
  arrayFields: string[],
  booleanFields: string[],
  time: string
) {
  const result: Record<string, readonly MetricFilterType[]> = {};
  for (const name of [...dimensions, ...extra]) {
    result[name] = numericFields.includes(name)
      ? ['number', 'null']
      : arrayFields.includes(name)
        ? ['arrayOptions', 'null']
        : booleanFields.includes(name)
          ? ['boolean', 'null']
          : ['string', 'stringOptions', 'null'];
  }
  result[time] = ['datetime', 'null'];
  result.metadata = ['stringObject'];
  // Pair-expanded keys are grouping dimensions, not filter columns in Metrics v2.
  delete result.costType;
  delete result.usageType;
  return result;
}
const observation: MetricCapabilities = {
  measures: {
    count,
    traceId: distinct,
    uniqueUserIds: distinct,
    uniqueSessionIds: distinct,
    latency: numeric('ms'),
    streamingLatency: numeric('ms'),
    timeToFirstToken: numeric('ms'),
    inputCost: numeric('currencyUSD'),
    outputCost: numeric('currencyUSD'),
    totalCost: numeric('currencyUSD'),
    inputTokens: numeric(),
    outputTokens: numeric(),
    totalTokens: numeric(),
    tokensPerSecond: numeric('cps'),
    outputTokensPerSecond: numeric('cps'),
    countScores: numeric(),
    toolDefinitions: numeric(),
    toolCalls: numeric(),
    toolCallInvocations: numeric('short', 'calledToolNames'),
    costByType: numeric('currencyUSD', 'costType'),
    usageByType: numeric('short', 'usageType'),
  },
  dimensions: observationDimensions,
  filters: filters(
    observationDimensions,
    [
      'id',
      'traceId',
      'userId',
      'sessionId',
      'parentObservationId',
      'experimentName',
      'experimentId',
      'experimentDatasetId',
    ],
    ['promptVersion'],
    ['tags', 'toolNames', 'calledToolNames', 'skillNamesAvailable', 'skillsNamesLoaded'],
    ['isRootObservation'],
    'startTime'
  ),
};
function score(categorical: boolean): MetricCapabilities {
  const dimensions = [...scoreDimensions, categorical ? 'stringValue' : 'value'];
  return {
    measures: categorical ? { count } : { count, value: numeric() },
    dimensions,
    filters: filters(
      dimensions,
      ['id', 'traceId', 'observationId', 'userId', 'sessionId', 'datasetRunId', 'experimentId', 'experimentName'],
      ['value', 'observationPromptVersion'],
      ['tags'],
      [],
      'timestamp'
    ),
  };
}
const capabilities: Record<MetricsView, MetricCapabilities> = {
  observations: observation,
  'scores-numeric': score(false),
  'scores-categorical': score(true),
};
export const METRICS_VIEWS = Object.keys(capabilities) as MetricsView[];
export function getMetricCapabilities(view: MetricsView): MetricCapabilities {
  return capabilities[view];
}
export const METRIC_FILTER_OPERATORS: Record<MetricFilterType, readonly string[]> = {
  string: ['=', 'contains', 'does not contain', 'starts with', 'ends with', 'is not empty'],
  stringOptions: ['any of', 'none of'],
  arrayOptions: ['any of', 'none of', 'all of'],
  number: ['=', '>', '<', '>=', '<='],
  boolean: ['=', '<>'],
  datetime: ['>', '<', '>=', '<='],
  stringObject: ['=', 'contains', 'does not contain', 'starts with', 'ends with', 'is set', 'is not set'],
  null: ['is null', 'is not null'],
};
