import type { DataFrame, DataQueryRequest, TimeRange } from '@grafana/data';
import { LangfuseClientError } from '../client/errors';
import type { LangfuseObservabilityClient, Score, ScoreRequest } from '../client/types';
import { scoresToFrames } from '../transformers/scores';
import type { LangfuseQuery } from '../types';

export const SCORE_DATA_TYPES = ['NUMERIC', 'BOOLEAN', 'CATEGORICAL', 'TEXT', 'CORRECTION'] as const;
export const SCORE_FIELD_GROUPS = ['details', 'subject', 'annotation'] as const;
export const SCORE_STRING_FILTERS = [
  'id',
  'name',
  'source',
  'dataType',
  'environment',
  'configId',
  'queueId',
  'authorUserId',
  'traceId',
  'observationId',
  'sessionId',
  'experimentId',
  'value',
] as const;
export type ScoreQuery = Omit<ScoreRequest, 'limit' | 'cursor'> & { ceiling?: number };
export const DEFAULT_SCORES_QUERY = JSON.stringify({ ceiling: 500 }, null, 2);

const split = (text: string) => text.split(',').map((value) => value.trim());
const invalid = (message: string): never => {
  throw new Error(`Invalid score query: ${message}`);
};

export function parseScoreQuery(text = DEFAULT_SCORES_QUERY): ScoreQuery {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return invalid('enter a JSON object.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('enter a JSON object.');
  }
  const object = value as Record<string, unknown>;
  const allowed = new Set<string>([
    ...SCORE_STRING_FILTERS,
    'fields',
    'valueMin',
    'valueMax',
    'ceiling',
    'fromTimestamp',
    'toTimestamp',
  ]);
  if (Object.keys(object).some((key) => !allowed.has(key))) {
    return invalid('unsupported property; use only documented Scores v3 filters and ceiling.');
  }
  for (const key of [...SCORE_STRING_FILTERS, 'fields', 'fromTimestamp', 'toTimestamp']) {
    if (object[key] !== undefined && typeof object[key] !== 'string') {
      return invalid(`${key} must be a string (comma-separated for multiple values).`);
    }
  }
  const definition = { ...object } as ScoreQuery;
  for (const key of SCORE_STRING_FILTERS.filter((key) => key !== 'value')) {
    if (definition[key] !== undefined && split(definition[key]).some((item) => !item)) {
      return invalid(`${key} must not contain empty filter values.`);
    }
  }
  if (
    definition.source &&
    split(definition.source).some((source) => !['API', 'ANNOTATION', 'EVAL'].includes(source.toUpperCase()))
  ) {
    return invalid('source must contain API, ANNOTATION or EVAL.');
  }
  const ceiling = definition.ceiling ?? 500;
  if (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 5000) {
    return invalid('ceiling must be an integer from 1 to 5,000.');
  }
  const types = definition.dataType ? split(definition.dataType).map((type) => type.toUpperCase()) : [];
  if (types.some((type) => !SCORE_DATA_TYPES.some((allowedType) => allowedType === type))) {
    return invalid('dataType must contain NUMERIC, BOOLEAN, CATEGORICAL, TEXT or CORRECTION.');
  }
  if (types.length) {
    definition.dataType = types.join(',');
  }
  if (
    definition.fields &&
    split(definition.fields).some((group) => !SCORE_FIELD_GROUPS.some((allowedGroup) => allowedGroup === group))
  ) {
    return invalid('fields must contain details, subject or annotation.');
  }
  if (definition.fields) {
    definition.fields = split(definition.fields).join(',');
  }
  const has = (key: keyof ScoreQuery) => Boolean(definition[key]);
  if (
    Number(has('traceId')) + Number(has('sessionId')) + Number(has('experimentId')) > 1 ||
    (has('observationId') && !has('traceId'))
  ) {
    return invalid('choose trace/observation, session, or experiment exclusively; observationId requires traceId.');
  }
  if (definition.value !== undefined) {
    if (types.length !== 1 || !['NUMERIC', 'BOOLEAN', 'CATEGORICAL'].includes(types[0])) {
      return invalid('exact value requires a single NUMERIC, BOOLEAN or CATEGORICAL dataType.');
    }
    const values = split(definition.value);
    if (types[0] === 'NUMERIC' && values.some((item) => item === '' || !Number.isFinite(Number(item)))) {
      return invalid('numeric exact values must be finite numbers.');
    }
    if (types[0] === 'BOOLEAN' && values.some((item) => item !== 'true' && item !== 'false')) {
      return invalid('boolean exact values must be true or false.');
    }
  }
  for (const bound of ['valueMin', 'valueMax'] as const) {
    if (
      definition[bound] !== undefined &&
      (types.length !== 1 ||
        types[0] !== 'NUMERIC' ||
        typeof definition[bound] !== 'number' ||
        !Number.isFinite(definition[bound]))
    ) {
      return invalid(`${bound} requires a finite number and dataType=NUMERIC.`);
    }
  }
  if (
    definition.valueMin !== undefined &&
    definition.valueMax !== undefined &&
    definition.valueMin > definition.valueMax
  ) {
    return invalid('valueMin must not exceed valueMax.');
  }
  return definition;
}

export function buildScoreRequest(target: LangfuseQuery, range: TimeRange): ScoreRequest {
  const { ceiling = 500, ...definition } = parseScoreQuery(target.scoresQuery);
  const from = range.from.valueOf();
  const to = range.to.valueOf();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return invalid('Grafana time range must be valid and increasing.');
  }
  return {
    ...definition,
    limit: Math.min(100, ceiling),
    fromTimestamp: range.from.toISOString(),
    toTimestamp: range.to.toISOString(),
  };
}

const incompatible = (): never => {
  throw new LangfuseClientError('malformed-response', 'Incompatible Scores v3 response or repeated pagination cursor.');
};
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function validScore(value: unknown): value is Score {
  if (!record(value)) {
    return false;
  }
  for (const key of ['id', 'projectId', 'name', 'source', 'environment', 'timestamp', 'createdAt', 'updatedAt']) {
    if (typeof value[key] !== 'string') {
      return false;
    }
  }
  if (!['timestamp', 'createdAt', 'updatedAt'].every((key) => Number.isFinite(Date.parse(value[key] as string)))) {
    return false;
  }
  switch (value.dataType) {
    case 'NUMERIC':
      if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
        return false;
      }
      break;
    case 'BOOLEAN':
      if (typeof value.value !== 'boolean') {
        return false;
      }
      break;
    case 'CATEGORICAL':
    case 'TEXT':
    case 'CORRECTION':
      if (typeof value.value !== 'string') {
        return false;
      }
      break;
    default:
      return false;
  }
  for (const key of ['comment', 'configId', 'authorUserId', 'queueId']) {
    if (value[key] != null && typeof value[key] !== 'string') {
      return false;
    }
  }
  if (value.metadata !== undefined && !record(value.metadata)) {
    return false;
  }
  if (value.subject !== undefined) {
    if (
      !record(value.subject) ||
      !['trace', 'observation', 'session', 'experiment'].includes(value.subject.kind as string) ||
      typeof value.subject.id !== 'string'
    ) {
      return false;
    }
    if (value.subject.traceId !== undefined && typeof value.subject.traceId !== 'string') {
      return false;
    }
  }
  return true;
}

export async function runScoreQuery(
  client: LangfuseObservabilityClient,
  target: LangfuseQuery,
  request: DataQueryRequest<LangfuseQuery>,
  signal: AbortSignal
): Promise<DataFrame[]> {
  const definition = parseScoreQuery(target.scoresQuery);
  const ceiling = definition.ceiling ?? 500;
  const base = buildScoreRequest(target, request.range);
  const items: Score[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let truncated = false;
  const checkCancelled = () => {
    if (signal.aborted) {
      throw new LangfuseClientError('cancelled', 'Score query cancelled.');
    }
  };
  do {
    checkCancelled();
    const limit = Math.min(100, ceiling - items.length);
    const page = await client.listScores({ ...base, limit, ...(cursor ? { cursor } : {}) }, signal);
    checkCancelled();
    if (
      !record(page) ||
      !Array.isArray(page.data) ||
      !record(page.meta) ||
      !Number.isInteger(page.meta.limit) ||
      page.meta.limit < 1 ||
      page.meta.limit > 100 ||
      (page.meta.cursor !== undefined && (typeof page.meta.cursor !== 'string' || !page.meta.cursor)) ||
      page.data.length > limit ||
      (page.data.length === 0 && Boolean(page.meta.cursor)) ||
      !page.data.every(validScore)
    ) {
      incompatible();
    }
    if (definition.dataType && page.data.some((item) => !definition.dataType!.split(',').includes(item.dataType))) {
      incompatible();
    }
    items.push(...page.data);
    cursor = page.meta.cursor;
    if (cursor) {
      if (cursors.has(cursor)) {
        incompatible();
      }
      cursors.add(cursor);
    }
    if (items.length >= ceiling) {
      // At an exact full page without a cursor the endpoint has confirmed completion.
      truncated = Boolean(cursor);
      break;
    }
  } while (cursor);
  const frames = scoresToFrames(items, definition, target.refId);
  if (truncated) {
    for (const frame of frames) {
      frame.meta = {
        ...frame.meta,
        notices: [
          {
            severity: 'warning',
            text: `Score ceiling of ${ceiling} reached; results are truncated. Narrow filters or raise the ceiling (maximum 5,000).`,
          },
        ],
      };
    }
  }
  return frames;
}
