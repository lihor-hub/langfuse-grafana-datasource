import { FieldType, toDataFrame, type DataFrame } from '@grafana/data';
import type { Score } from '../client/types';
import { SCORE_DATA_TYPES, type ScoreQuery } from '../queries/scores';

/** Each score type has its own frame so mixed results never coerce value types. */
export function scoresToFrames(items: Score[], definition: ScoreQuery, refId: string): DataFrame[] {
  const selected = definition.dataType?.split(',') ?? SCORE_DATA_TYPES;
  const groups = new Set(definition.fields?.split(',') ?? []);
  const names = [
    'timestamp',
    'name',
    'dataType',
    'value',
    'source',
    'environment',
    'id',
    'projectId',
    'createdAt',
    'updatedAt',
  ];
  if (groups.has('details')) {
    names.push('comment', 'configId', 'metadata');
  }
  if (groups.has('subject')) {
    names.push('subject.kind', 'subject.id', 'subject.traceId');
  }
  if (groups.has('annotation')) {
    names.push('authorUserId', 'queueId');
  }
  return SCORE_DATA_TYPES.filter((type) => selected.includes(type)).map((dataType) => {
    const rows = items.filter((item) => item.dataType === dataType);
    return toDataFrame({
      name: `Scores (${dataType})`,
      refId,
      meta: { preferredVisualisationType: 'table' },
      fields: names.map((name) => {
        const time = ['timestamp', 'createdAt', 'updatedAt'].includes(name);
        const type =
          name === 'value'
            ? dataType === 'NUMERIC'
              ? FieldType.number
              : dataType === 'BOOLEAN'
                ? FieldType.boolean
                : FieldType.string
            : name === 'metadata'
              ? FieldType.other
              : time
                ? FieldType.time
                : FieldType.string;
        return {
          name,
          type,
          values: rows.map((row) => {
            if (name === 'subject.kind') {
              return row.subject?.kind ?? null;
            }
            if (name === 'subject.id') {
              return row.subject?.id ?? null;
            }
            if (name === 'subject.traceId') {
              return row.subject?.kind === 'observation' ? (row.subject.traceId ?? null) : null;
            }
            const value = row[name as keyof Score];
            return time ? Date.parse(value as string) : (value ?? null);
          }),
        };
      }),
    });
  });
}
