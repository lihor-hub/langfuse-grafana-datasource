import { FieldType, toDataFrame, type DataFrame, type FieldConfig } from '@grafana/data';
import type { Observation } from '../client/types';
import type { ObservationFieldGroup, ObservationQueryDefinition } from '../queries/observations';

type Column = { name: keyof Observation; type: FieldType; unit?: string };
const strings = (...names: Array<keyof Observation>): Column[] =>
  names.map((name) => ({ name, type: FieldType.string }));
const times = (...names: Array<keyof Observation>): Column[] => names.map((name) => ({ name, type: FieldType.time }));
const structured = (...names: Array<keyof Observation>): Column[] =>
  names.map((name) => ({ name, type: FieldType.other }));
const core: Column[] = [
  ...times('startTime'),
  ...strings('name', 'type', 'level', 'id', 'traceId', 'projectId', 'parentObservationId'),
];
const groups: Record<ObservationFieldGroup, Column[]> = {
  basic: [
    ...strings('environment', 'version', 'statusMessage'),
    { name: 'isRootObservation', type: FieldType.boolean },
  ],
  time: times('endTime', 'completionStartTime', 'createdAt', 'updatedAt'),
  trace_context: [...strings('traceName', 'userId', 'sessionId', 'release'), ...structured('tags')],
  model: [
    ...strings('providedModelName', 'internalModelId', 'modelId', 'inputPrice', 'outputPrice', 'totalPrice'),
    ...structured('modelParameters'),
  ],
  usage: [
    ...structured('usageDetails', 'costDetails'),
    { name: 'totalCost', type: FieldType.number, unit: 'currencyUSD' },
    ...strings('usagePricingTierName'),
  ],
  prompt: [...strings('promptId', 'promptName'), { name: 'promptVersion', type: FieldType.number }],
  metrics: ['latency', 'timeToFirstToken'].map((name) => ({
    name: name as keyof Observation,
    type: FieldType.number,
    unit: 's',
  })),
  io: structured('input', 'output'),
  metadata: structured('metadata'),
};
function uiBase(value?: string): string | undefined {
  if (!value) {
    return;
  }
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /\/api\/datasources\/proxy(?:\/|$)/.test(url.pathname)
    ) {
      return;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return;
  }
}
function urls(item: Observation, base: string): { trace: string | null; observation: string | null } {
  if (!item.projectId || !item.traceId) {
    return { trace: null, observation: null };
  }
  const trace = `${base}/project/${encodeURIComponent(item.projectId)}/traces/${encodeURIComponent(item.traceId)}`;
  return { trace, observation: `${trace}?observation=${encodeURIComponent(item.id)}` };
}
function linkFields(items: Observation[], base?: string) {
  if (!base) {
    return [];
  }
  return ['trace', 'observation'].map((kind) => ({
    name: `${kind}Url`,
    type: FieldType.string,
    values: items.map((item) => urls(item, base)[kind as 'trace' | 'observation']),
  }));
}
function linkConfig(name: string, items: Observation[], base?: string): FieldConfig {
  if (!base || !items.every((item) => item.projectId && item.traceId) || !['id', 'traceId'].includes(name)) {
    return {};
  }
  const kind = name === 'id' ? 'observation' : 'trace';
  return {
    links: [{ title: `View ${kind} in Langfuse`, url: '${__data.fields["' + kind + 'Url"]}', targetBlank: true }],
  };
}
export function observationsToTable(
  items: Observation[],
  definition: ObservationQueryDefinition,
  refId: string,
  uiUrl?: string
): DataFrame {
  const selected = definition.fieldGroups ?? ['basic'];
  const columns = [
    ...core,
    ...(
      [
        'basic',
        'time',
        'trace_context',
        'model',
        'usage',
        'prompt',
        'metrics',
        'io',
        'metadata',
      ] as ObservationFieldGroup[]
    )
      .filter((g) => selected.includes(g))
      .flatMap((g) => groups[g]),
  ];
  const base = uiBase(uiUrl);
  return toDataFrame({
    refId,
    name: 'Observations',
    meta: { preferredVisualisationType: 'table' },
    fields: [
      ...columns.map(({ name, type, unit }) => ({
        name,
        type,
        config: { ...linkConfig(name, items, base), ...(unit ? { unit } : {}) },
        values: items.map((item) =>
          type === FieldType.time ? (item[name] == null ? null : Date.parse(String(item[name]))) : (item[name] ?? null)
        ),
      })),
      ...linkFields(items, base),
    ],
  });
}
export function observationsToLogs(
  items: Observation[],
  definition: ObservationQueryDefinition,
  refId: string,
  uiUrl?: string
): DataFrame {
  const selected = definition.fieldGroups ?? ['basic'];
  const base = uiBase(uiUrl);
  const bodyKey = definition.logBody ?? 'name';
  const bodyAllowed =
    bodyKey === 'name' || (bodyKey === 'statusMessage' ? selected.includes('basic') : selected.includes('io'));
  const labelKeys: Array<keyof Observation> = [
    'type',
    ...(selected.includes('basic') ? ['environment' as const] : []),
    ...(selected.includes('model') ? ['providedModelName' as const] : []),
    ...(selected.includes('trace_context') ? ['traceName' as const, 'release' as const] : []),
    ...(selected.includes('prompt') ? ['promptName' as const] : []),
  ];
  return toDataFrame({
    refId,
    name: 'Observations',
    meta: { type: 'log-lines', preferredVisualisationType: 'logs' },
    fields: [
      { name: 'timestamp', type: FieldType.time, values: items.map((item) => Date.parse(item.startTime)) },
      {
        name: 'body',
        type: FieldType.string,
        values: items.map((item) => {
          const value = bodyAllowed ? item[bodyKey] : null;
          return value == null || value === ''
            ? item.name || '(unnamed observation)'
            : typeof value === 'string'
              ? value
              : JSON.stringify(value);
        }),
      },
      {
        name: 'severity',
        type: FieldType.string,
        values: items.map(
          (item) =>
            ({ DEBUG: 'debug', DEFAULT: 'info', WARNING: 'warning', ERROR: 'error' })[item.level ?? 'DEFAULT'] ??
            'unknown'
        ),
      },
      {
        name: 'id',
        type: FieldType.string,
        config: linkConfig('id', items, base),
        values: items.map((item) => item.id),
      },
      {
        name: 'labels',
        type: FieldType.other,
        values: items.map((item) =>
          Object.fromEntries(
            labelKeys.filter((key) => typeof item[key] === 'string' && item[key] !== '').map((key) => [key, item[key]])
          )
        ),
      },
      {
        name: 'traceId',
        type: FieldType.string,
        config: linkConfig('traceId', items, base),
        values: items.map((item) => item.traceId ?? null),
      },
      ...linkFields(items, base),
    ],
  });
}
