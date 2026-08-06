import type { ObservationV2, ScoreV3 } from '@langfuse/core';

import type { Observation, ObservationPage, Score, ScorePage } from './types';

type IsExact<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <Value>() => Value extends Expected ? 1 : 2
    ? (<Value>() => Value extends Expected ? 1 : 2) extends <Value>() => Value extends Actual ? 1 : 2
      ? true
      : false
    : false;

const observationSchemaIsExact: IsExact<Observation, ObservationV2> = true;
const scoreSchemaIsExact: IsExact<Score, ScoreV3> = true;

const observationPage: ObservationPage = {
  data: [
    {
      id: 'observation-1',
      traceId: null,
      startTime: '2026-08-05T12:00:00.000Z',
      endTime: null,
      projectId: 'project-1',
      parentObservationId: null,
      type: 'GENERATION',
      isRootObservation: true,
      name: null,
      level: 'DEFAULT',
      statusMessage: null,
      version: null,
      environment: 'production',
      bookmarked: false,
      public: false,
      userId: null,
      sessionId: null,
      completionStartTime: null,
      createdAt: '2026-08-05T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:01.000Z',
      input: { prompt: 'Hello' },
      output: { answer: 'World' },
      metadata: { region: 'eu' },
      providedModelName: null,
      internalModelId: null,
      modelParameters: { temperature: 0 },
      usageDetails: { input: 2, output: 1 },
      costDetails: { input: 0.001, output: 0.002 },
      totalCost: null,
      usagePricingTierName: null,
      promptId: null,
      promptName: null,
      promptVersion: null,
      latency: null,
      timeToFirstToken: null,
      modelId: null,
      inputPrice: null,
      outputPrice: null,
      totalPrice: null,
      traceName: null,
      tags: null,
      release: null,
    },
  ],
  meta: {},
};

const scorePage: ScorePage = {
  data: [
    {
      id: 'score-numeric',
      projectId: 'project-1',
      name: 'quality',
      source: 'EVAL',
      timestamp: '2026-08-05T12:00:00.000Z',
      environment: 'production',
      createdAt: '2026-08-05T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:01.000Z',
      dataType: 'NUMERIC',
      value: 0.95,
      comment: null,
      configId: null,
      metadata: { evaluator: 'judge' },
      authorUserId: null,
      queueId: null,
      subject: { kind: 'observation', id: 'observation-1', traceId: 'trace-1' },
    },
    {
      id: 'score-boolean',
      projectId: 'project-1',
      name: 'accepted',
      source: 'ANNOTATION',
      timestamp: '2026-08-05T12:00:02.000Z',
      environment: 'default',
      createdAt: '2026-08-05T12:00:02.000Z',
      updatedAt: '2026-08-05T12:00:03.000Z',
      dataType: 'BOOLEAN',
      value: true,
      comment: 'Reviewed',
      configId: 'config-1',
      metadata: {},
      authorUserId: 'user-1',
      queueId: 'queue-1',
      subject: { kind: 'trace', id: 'trace-1' },
    },
    {
      id: 'score-categorical',
      projectId: 'project-1',
      name: 'tone',
      source: 'API',
      timestamp: '2026-08-05T12:00:04.000Z',
      environment: 'staging',
      createdAt: '2026-08-05T12:00:04.000Z',
      updatedAt: '2026-08-05T12:00:05.000Z',
      dataType: 'CATEGORICAL',
      value: 'friendly',
    },
    {
      id: 'score-text',
      projectId: 'project-1',
      name: 'feedback',
      source: 'ANNOTATION',
      timestamp: '2026-08-05T12:00:06.000Z',
      environment: 'production',
      createdAt: '2026-08-05T12:00:06.000Z',
      updatedAt: '2026-08-05T12:00:07.000Z',
      dataType: 'TEXT',
      value: 'Concise response',
    },
    {
      id: 'score-correction',
      projectId: 'project-1',
      name: 'correction',
      source: 'ANNOTATION',
      timestamp: '2026-08-05T12:00:08.000Z',
      environment: 'production',
      createdAt: '2026-08-05T12:00:08.000Z',
      updatedAt: '2026-08-05T12:00:09.000Z',
      dataType: 'CORRECTION',
      value: 'Corrected answer',
      subject: { kind: 'session', id: 'session-1' },
    },
  ],
  meta: { limit: 5 },
};

function renderScoreValue(score: Score): string {
  switch (score.dataType) {
    case 'NUMERIC':
      return score.value.toFixed(2);
    case 'BOOLEAN':
      return score.value ? 'true' : 'false';
    case 'CATEGORICAL':
    case 'TEXT':
    case 'CORRECTION':
      return score.value;
  }
}

describe('Langfuse v4 response types', () => {
  it('accepts the complete nullable Observations v2 shape', () => {
    expect(observationSchemaIsExact).toBe(true);
    expect(observationPage.data[0]).toEqual(
      expect.objectContaining({ traceId: null, endTime: null, parentObservationId: null })
    );
  });

  it('narrows each Scores v3 value from its dataType', () => {
    expect(scoreSchemaIsExact).toBe(true);
    expect(scorePage.data.map(renderScoreValue)).toEqual([
      '0.95',
      'true',
      'friendly',
      'Concise response',
      'Corrected answer',
    ]);
  });
});
