import type { MetricsResponse, ObservationPage, ScorePage } from './types';

type JsonObject = Record<string, unknown>;
type Guard = (value: unknown) => boolean;

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown): value is string => typeof value === 'string';
const number: Guard = (value) => typeof value === 'number' && Number.isFinite(value);
const boolean: Guard = (value) => typeof value === 'boolean';
const date: Guard = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullable =
  (guard: Guard): Guard =>
  (value) =>
    value === null || guard(value);
const strings: Guard = (value) => Array.isArray(value) && value.every(text);
const numbers: Guard = (value) => object(value) && Object.values(value).every(number);

function fields(row: JsonObject, keys: string[], guard: Guard): boolean {
  return keys.every((key) => row[key] === undefined || guard(row[key]));
}

function envelope(value: unknown): value is JsonObject & { data: JsonObject[] } {
  return object(value) && Array.isArray(value.data) && value.data.every(object);
}

function cursorMeta(value: unknown): value is JsonObject {
  return object(value) && fields(value, ['cursor'], text);
}

export function isProjectsResponse(value: unknown): value is { data: Array<{ id: string }> } {
  return (
    envelope(value) &&
    value.data.length > 0 &&
    value.data.every((row) => typeof row.id === 'string' && row.id.length > 0)
  );
}

export function isMetricsResponse(value: unknown): value is MetricsResponse {
  return envelope(value);
}

export function isObservationPage(value: unknown): value is ObservationPage {
  return (
    envelope(value) &&
    value.data.length <= 1000 &&
    cursorMeta(value.meta) &&
    value.data.every(
      (row) =>
        typeof row.id === 'string' &&
        row.id.length > 0 &&
        text(row.projectId) &&
        text(row.type) &&
        date(row.startTime) &&
        fields(
          row,
          [
            'traceId',
            'parentObservationId',
            'name',
            'statusMessage',
            'version',
            'environment',
            'userId',
            'sessionId',
            'providedModelName',
            'internalModelId',
            'usagePricingTierName',
            'promptId',
            'promptName',
            'modelId',
            'inputPrice',
            'outputPrice',
            'totalPrice',
            'traceName',
            'release',
          ],
          nullable(text)
        ) &&
        fields(row, ['endTime', 'completionStartTime'], nullable(date)) &&
        fields(row, ['createdAt', 'updatedAt'], date) &&
        fields(row, ['isRootObservation', 'bookmarked', 'public'], boolean) &&
        fields(row, ['totalCost', 'promptVersion', 'latency', 'timeToFirstToken'], nullable(number)) &&
        fields(row, ['usageDetails', 'costDetails'], numbers) &&
        fields(row, ['tags'], nullable(strings)) &&
        fields(row, ['level'], (level) => text(level) && ['DEBUG', 'DEFAULT', 'WARNING', 'ERROR'].includes(level))
    )
  );
}

function scoreSubject(value: unknown): boolean {
  if (!object(value) || !text(value.id)) {
    return false;
  }
  return (
    (text(value.kind) && ['trace', 'session', 'experiment'].includes(value.kind)) ||
    (value.kind === 'observation' && fields(value, ['traceId'], text))
  );
}

export function isScorePage(value: unknown): value is ScorePage {
  if (
    !envelope(value) ||
    value.data.length > 100 ||
    !cursorMeta(value.meta) ||
    !Number.isInteger(value.meta.limit) ||
    Number(value.meta.limit) < 1 ||
    Number(value.meta.limit) > 100
  ) {
    return false;
  }
  return value.data.every((row) => {
    const valueGuard =
      row.dataType === 'NUMERIC'
        ? number
        : row.dataType === 'BOOLEAN'
          ? boolean
          : text(row.dataType) && ['CATEGORICAL', 'TEXT', 'CORRECTION'].includes(row.dataType)
            ? text
            : undefined;
    return (
      typeof row.id === 'string' &&
      row.id.length > 0 &&
      text(row.projectId) &&
      text(row.name) &&
      text(row.source) &&
      ['API', 'EVAL', 'ANNOTATION'].includes(row.source) &&
      text(row.environment) &&
      date(row.timestamp) &&
      date(row.createdAt) &&
      date(row.updatedAt) &&
      !!valueGuard &&
      valueGuard(row.value) &&
      fields(row, ['comment', 'configId', 'authorUserId', 'queueId'], nullable(text)) &&
      fields(row, ['metadata'], object) &&
      fields(row, ['subject'], scoreSubject)
    );
  });
}
