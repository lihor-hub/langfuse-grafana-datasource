import type { DataFrame, DataQueryRequest } from '@grafana/data';
import type { LangfuseObservabilityClient, Observation, ObservationRequest } from '../client/types';
import { LangfuseClientError } from '../client/errors';
import type { LangfuseQuery } from '../types';
import { observationsToLogs, observationsToTable } from '../transformers/observations';

export const OBSERVATION_TYPES = [
  'SPAN',
  'GENERATION',
  'EVENT',
  'AGENT',
  'TOOL',
  'CHAIN',
  'RETRIEVER',
  'EVALUATOR',
  'EMBEDDING',
  'GUARDRAIL',
] as const;
export const OBSERVATION_FIELD_GROUPS = [
  'basic',
  'time',
  'io',
  'metadata',
  'model',
  'usage',
  'prompt',
  'metrics',
  'trace_context',
] as const;
export type ObservationFieldGroup = (typeof OBSERVATION_FIELD_GROUPS)[number];
export type ObservationFilter = { type: string; column: string; operator: string; value?: unknown; key?: string };
export interface ObservationQueryDefinition {
  format?: 'table' | 'logs';
  logBody?: 'name' | 'statusMessage' | 'input' | 'output';
  fieldGroups?: ObservationFieldGroup[];
  ceiling?: number;
  type?: string;
  name?: string;
  level?: ObservationRequest['level'];
  environment?: string | string[];
  version?: string;
  isRootObservation?: boolean;
  parentObservationId?: string;
  traceId?: string;
  userId?: string;
  sessionId?: string;
  filters?: ObservationFilter[];
}
export const DEFAULT_OBSERVATIONS_QUERY = JSON.stringify({ fieldGroups: ['basic'], ceiling: 1000 }, null, 2);
const simpleStrings = [
  'type',
  'name',
  'level',
  'version',
  'parentObservationId',
  'traceId',
  'userId',
  'sessionId',
] as const;
const columns =
  'id type name traceId parentObservationId startTime endTime environment level statusMessage version userId sessionId isRootObservation traceName traceTags tags latency timeToFirstToken tokensPerSecond inputTokens outputTokens totalTokens tokens inputCost outputCost totalCost model providedModelName promptName promptVersion input output metadata'.split(
    ' '
  );
const operators: Record<string, string[]> = {
  string: ['=', 'contains', 'does not contain', 'starts with', 'ends with', 'matches'],
  stringObject: ['=', 'contains', 'does not contain', 'starts with', 'ends with', 'matches'],
  number: ['=', '>', '<', '>=', '<='],
  numberObject: ['=', '>', '<', '>=', '<='],
  datetime: ['>', '<', '>=', '<='],
  boolean: ['=', '<>'],
  null: ['is null', 'is not null'],
  stringOptions: ['any of', 'none of'],
  categoryOptions: ['any of', 'none of'],
  arrayOptions: ['any of', 'none of', 'all of'],
};
function invalid(): never {
  throw new Error('Invalid observation query. Check filters, field groups, format and ceiling (1–5,000).');
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validateFilter(value: unknown): asserts value is ObservationFilter {
  if (!object(value) || Object.keys(value).some((k) => !['type', 'column', 'operator', 'value', 'key'].includes(k))) {
    invalid();
  }
  const { type, column, operator, key } = value;
  if (
    typeof type !== 'string' ||
    typeof column !== 'string' ||
    !columns.includes(column) ||
    typeof operator !== 'string' ||
    !operators[type]?.includes(operator)
  ) {
    invalid();
  }
  const v = value.value;
  if (['string', 'stringObject'].includes(type) && typeof v !== 'string') {
    invalid();
  }
  if (['number', 'numberObject'].includes(type) && (typeof v !== 'number' || !Number.isFinite(v))) {
    invalid();
  }
  if (type === 'boolean' && typeof v !== 'boolean') {
    invalid();
  }
  if (type === 'datetime' && (typeof v !== 'string' || !Number.isFinite(Date.parse(v)))) {
    invalid();
  }
  if (
    ['stringOptions', 'categoryOptions', 'arrayOptions'].includes(type) &&
    (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))
  ) {
    invalid();
  }
  if (['stringObject', 'numberObject', 'categoryOptions'].includes(type) && (typeof key !== 'string' || !key)) {
    invalid();
  }
  if (key !== undefined && typeof key !== 'string') {
    invalid();
  }
  if (operator === 'matches' && !['input', 'output', 'metadata'].includes(column)) {
    invalid();
  }
}
export function parseObservationQuery(text = DEFAULT_OBSERVATIONS_QUERY): ObservationQueryDefinition {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    invalid();
  }
  if (!object(value)) {
    invalid();
  }
  const allowed = [
    ...simpleStrings,
    'format',
    'logBody',
    'fieldGroups',
    'ceiling',
    'environment',
    'isRootObservation',
    'filters',
    'fromStartTime',
    'toStartTime',
  ];
  if (Object.keys(value).some((k) => !allowed.includes(k))) {
    invalid();
  }
  for (const key of simpleStrings) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      invalid();
    }
  }
  if (value.type !== undefined && !OBSERVATION_TYPES.includes(value.type as (typeof OBSERVATION_TYPES)[number])) {
    invalid();
  }
  if (value.level !== undefined && !['DEBUG', 'DEFAULT', 'WARNING', 'ERROR'].includes(String(value.level))) {
    invalid();
  }
  if (value.format !== undefined && !['table', 'logs'].includes(String(value.format))) {
    invalid();
  }
  if (value.logBody !== undefined && !['name', 'statusMessage', 'input', 'output'].includes(String(value.logBody))) {
    invalid();
  }
  if (
    value.ceiling !== undefined &&
    (typeof value.ceiling !== 'number' || !Number.isInteger(value.ceiling) || value.ceiling < 1 || value.ceiling > 5000)
  ) {
    invalid();
  }
  if (
    value.fieldGroups !== undefined &&
    (!Array.isArray(value.fieldGroups) || !value.fieldGroups.every((g) => OBSERVATION_FIELD_GROUPS.includes(g)))
  ) {
    invalid();
  }
  if (
    value.environment !== undefined &&
    typeof value.environment !== 'string' &&
    (!Array.isArray(value.environment) || !value.environment.every((v) => typeof v === 'string'))
  ) {
    invalid();
  }
  if (value.isRootObservation !== undefined && typeof value.isRootObservation !== 'boolean') {
    invalid();
  }
  if (value.filters !== undefined) {
    if (!Array.isArray(value.filters)) {
      invalid();
    }
    value.filters.forEach(validateFilter);
    const io = value.filters.filter((f) => ['input', 'output'].includes(f.column));
    if (io.length && !io.some((f) => ['=', 'matches'].includes(f.operator))) {
      invalid();
    }
  }
  // Legacy fixed bounds are accepted for migration, but never persisted by the editor or dispatched.
  const { fromStartTime, toStartTime, ...definition } = value;
  return definition as ObservationQueryDefinition;
}
export function observationFormat(definition: ObservationQueryDefinition, app?: string): 'table' | 'logs' {
  return definition.format ?? (app?.toLowerCase() === 'explore' ? 'logs' : 'table');
}
export function buildObservationRequest(
  definition: ObservationQueryDefinition,
  request: DataQueryRequest<LangfuseQuery>
): ObservationRequest {
  const from = request.range.from.toISOString();
  const to = request.range.to.toISOString();
  if (
    !from ||
    !to ||
    !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) ||
    Date.parse(from) >= Date.parse(to)
  ) {
    invalid();
  }
  const filters: ObservationFilter[] = [...(definition.filters ?? [])];
  // Structured filters override ALL URL filters in Langfuse. Carry scope and range into that same AND array.
  for (const column of simpleStrings) {
    if (definition[column] !== undefined) {
      filters.push({ type: 'string', column, operator: '=', value: definition[column] });
    }
  }
  if (definition.environment !== undefined) {
    filters.push({
      type: Array.isArray(definition.environment) ? 'stringOptions' : 'string',
      column: 'environment',
      operator: Array.isArray(definition.environment) ? 'any of' : '=',
      value: definition.environment,
    });
  }
  if (definition.isRootObservation !== undefined) {
    filters.push({ type: 'boolean', column: 'isRootObservation', operator: '=', value: definition.isRootObservation });
  }
  filters.push(
    { type: 'datetime', column: 'startTime', operator: '>=', value: from },
    { type: 'datetime', column: 'startTime', operator: '<', value: to }
  );
  const groups = new Set(definition.fieldGroups ?? ['basic']);
  return {
    fields: ['core', ...OBSERVATION_FIELD_GROUPS.filter((g) => groups.has(g))].join(','),
    limit: Math.min(1000, definition.ceiling ?? 1000),
    fromStartTime: from,
    toStartTime: to,
    filter: JSON.stringify(filters),
  };
}
function cancelled(signal: AbortSignal) {
  if (signal.aborted) {
    throw new LangfuseClientError('cancelled', 'Observation query cancelled.');
  }
}
function guardPage(page: unknown, limit: number): asserts page is { data: Observation[]; meta: { cursor?: string } } {
  const fail = () => {
    throw new LangfuseClientError(
      'malformed-response',
      'Incompatible observation response. Check Langfuse v4 compatibility.'
    );
  };
  if (
    !object(page) ||
    !Array.isArray(page.data) ||
    !object(page.meta) ||
    (page.meta.cursor !== undefined && typeof page.meta.cursor !== 'string') ||
    page.data.length > limit ||
    (page.data.length === 0 && Boolean(page.meta.cursor))
  ) {
    fail();
  }
  const rows = (page as { data: unknown[] }).data;
  for (const row of rows) {
    if (
      !object(row) ||
      typeof row.id !== 'string' ||
      typeof row.type !== 'string' ||
      typeof row.startTime !== 'string' ||
      !Number.isFinite(Date.parse(row.startTime))
    ) {
      fail();
    }
    if (!object(row)) {
      continue;
    }
    for (const key of [
      'name',
      'level',
      'traceId',
      'projectId',
      'parentObservationId',
      'environment',
      'statusMessage',
      'version',
      'userId',
      'sessionId',
      'providedModelName',
      'internalModelId',
      'modelId',
      'inputPrice',
      'outputPrice',
      'totalPrice',
      'usagePricingTierName',
      'promptId',
      'traceName',
      'release',
      'promptName',
    ]) {
      if (row[key] != null && typeof row[key] !== 'string') {
        fail();
      }
    }
    for (const key of ['isRootObservation', 'bookmarked', 'public']) {
      if (row[key] != null && typeof row[key] !== 'boolean') {
        fail();
      }
    }
    if (row.tags != null && (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === 'string'))) {
      fail();
    }
    for (const key of ['usageDetails', 'costDetails']) {
      const details = row[key];
      if (
        details != null &&
        (!object(details) ||
          !Object.values(details).every((value) => typeof value === 'number' && Number.isFinite(value)))
      ) {
        fail();
      }
    }
    for (const key of ['totalCost', 'latency', 'timeToFirstToken', 'promptVersion']) {
      if (row[key] != null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]))) {
        fail();
      }
    }
    for (const key of ['endTime', 'completionStartTime', 'createdAt', 'updatedAt']) {
      if (row[key] != null && (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(row[key])))) {
        fail();
      }
    }
  }
}
export async function runObservationQuery(
  client: LangfuseObservabilityClient,
  target: LangfuseQuery,
  request: DataQueryRequest<LangfuseQuery>,
  signal: AbortSignal,
  uiUrl?: string
): Promise<DataFrame[]> {
  if (target.hide) {
    return [];
  }
  const definition = parseObservationQuery(target.observationsQuery);
  const apiRequest = buildObservationRequest(definition, request);
  const ceiling = definition.ceiling ?? 1000;
  const items: Observation[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let truncated = false;
  do {
    cancelled(signal);
    const limit = Math.min(1000, ceiling - items.length);
    const page = await client.listObservations({ ...apiRequest, limit, ...(cursor ? { cursor } : {}) }, signal);
    cancelled(signal);
    guardPage(page, limit);
    items.push(...page.data);
    cursor = page.meta.cursor || undefined;
    if (cursor && seen.has(cursor)) {
      throw new LangfuseClientError(
        'malformed-response',
        'Incompatible observation response: repeated pagination cursor.'
      );
    }
    if (cursor) {
      seen.add(cursor);
    }
    if (items.length >= ceiling) {
      truncated = Boolean(cursor);
      break;
    }
  } while (cursor);
  const frame =
    observationFormat(definition, request.app) === 'logs'
      ? observationsToLogs(items, definition, target.refId, uiUrl)
      : observationsToTable(items, definition, target.refId, uiUrl);
  if (truncated) {
    frame.meta = {
      ...frame.meta,
      notices: [
        {
          severity: 'warning',
          text: `Observation results truncated at the ${ceiling.toLocaleString('en-US')} row ceiling. Narrow filters or raise the ceiling (maximum 5,000).`,
        },
      ],
    };
  }
  return [frame];
}
