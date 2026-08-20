import { describe, expect, it } from 'vitest';
import type { BehaviorEvent, ExperimentDefinition } from '../../types/behaviorAnalytics';
import {
  assignExperiment,
  buildRecommendations,
  calculateExperimentResults,
  calculateFeatureUsage,
  detectFrictionPoints,
  identifySegment,
  summarizeBehavior,
} from './engine';

const NOW = Date.parse('2026-08-20T12:00:00.000Z');

function event(
  name: string,
  properties: BehaviorEvent['properties'],
  overrides: Partial<BehaviorEvent> = {}
): BehaviorEvent {
  return {
    id: `${name}-${Math.random()}`,
    type: 'navigation',
    name,
    occurredAt: '2026-08-20T10:00:00.000Z',
    sessionId: 'session-a',
    properties,
    ...overrides,
  };
}

describe('behavior analytics engine', () => {
  it('ranks feature usage and calculates percentages', () => {
    const usage = calculateFeatureUsage([
      event('view:builder', { tab: 'builder' }),
      event('view:builder', { tab: 'builder' }),
      event('view:overview', { tab: 'overview' }),
    ]);
    expect(usage[0]).toMatchObject({ feature: 'builder', count: 2, percentage: 67 });
    expect(usage[1]).toMatchObject({ feature: 'overview', count: 1, percentage: 33 });
  });

  it('recognizes feature_use events as usage signals', () => {
    const usage = calculateFeatureUsage([
      event('recommendation_opened', { feature: 'multisig' }, { type: 'feature_use' }),
    ]);
    expect(usage[0]?.feature).toBe('multisig');
  });

  it('identifies a developer persona from contract-oriented behavior', () => {
    const events = [
      event('view:builder', { tab: 'builder' }),
      event('view:contracts', { tab: 'contracts' }),
      event('view:contractInteraction', { tab: 'contractInteraction' }),
      event('view:faucet', { tab: 'faucet' }),
    ];
    const segment = identifySegment(events, NOW);
    expect(segment.persona).toBe('developer');
    expect(segment.confidence).toBeGreaterThan(0.7);
  });

  it('identifies trader and validator personas from their feature clusters', () => {
    expect(
      identifySegment(
        [event('view:dex', { tab: 'dex' }), event('view:portfolio', { tab: 'portfolio' })],
        NOW
      ).persona
    ).toBe('trader');
    expect(
      identifySegment(
        [event('view:network', { tab: 'network' }), event('view:realtime', { tab: 'realtime' })],
        NOW
      ).persona
    ).toBe('validator');
  });

  it('marks advanced users from diverse advanced tools and successful workflows', () => {
    const events = ['builder', 'contractInteraction', 'multisig', 'signer'].map((tab) =>
      event(`view:${tab}`, { tab })
    );
    events.push(
      ...Array.from({ length: 3 }, (_, index) =>
        event(
          `submit-${index}`,
          { workflow: 'transaction', outcome: 'success' },
          { type: 'transaction_workflow' }
        )
      )
    );
    expect(identifySegment(events, NOW).experience).toBe('advanced');
  });

  it('detects at-risk users after established activity becomes stale', () => {
    const events = Array.from({ length: 10 }, (_, index) =>
      event(`view:${index}`, { tab: 'overview' }, { occurredAt: '2026-07-30T10:00:00.000Z' })
    );
    expect(identifySegment(events, NOW).engagement).toBe('at-risk');
  });

  it('reports repeated failed and abandoned workflows as friction', () => {
    const events = [
      event(
        'payment',
        { workflow: 'payment', outcome: 'failure' },
        { type: 'transaction_workflow' }
      ),
      event(
        'payment',
        { workflow: 'payment', outcome: 'abandoned' },
        { type: 'transaction_workflow' }
      ),
      event(
        'payment',
        { workflow: 'payment', outcome: 'success' },
        { type: 'transaction_workflow' }
      ),
    ];
    expect(detectFrictionPoints(events)[0]).toMatchObject({
      workflow: 'payment',
      attempts: 3,
      failures: 1,
      severity: 'high',
    });
  });

  it('does not infer friction from a single failure', () => {
    expect(
      detectFrictionPoints([
        event(
          'payment',
          { workflow: 'payment', outcome: 'failure' },
          { type: 'transaction_workflow' }
        ),
      ])
    ).toEqual([]);
  });

  it('builds persona and friction-aware recommendations', () => {
    const events = [
      event('view:contracts', { tab: 'contracts' }),
      event(
        'payment',
        { workflow: 'payment', outcome: 'failure' },
        { type: 'transaction_workflow' }
      ),
      event(
        'payment',
        { workflow: 'payment', outcome: 'failure' },
        { type: 'transaction_workflow' }
      ),
    ];
    const recommendations = buildRecommendations(summarizeBehavior(events, NOW));
    expect(recommendations[0]?.id).toBe('resolve-payment');
    expect(recommendations.some((item) => item.id === 'try-contract-builder')).toBe(true);
  });

  it('assigns experiments deterministically and preserves existing assignment', () => {
    const experiment: ExperimentDefinition = {
      id: 'recommendation-layout',
      name: 'Recommendation layout',
      active: true,
      variants: [
        { id: 'control', weight: 1 },
        { id: 'cards', weight: 1 },
      ],
    };
    const first = assignExperiment(experiment, 'visitor-1', [], NOW);
    const second = assignExperiment(experiment, 'visitor-1', [], NOW + 5_000);
    expect(first?.variantId).toBe(second?.variantId);
    const preserved = assignExperiment(
      experiment,
      'visitor-2',
      [{ experimentId: experiment.id, variantId: 'control', assignedAt: 'old' }],
      NOW
    );
    expect(preserved?.variantId).toBe('control');
    expect(preserved?.assignedAt).toBe('old');
  });

  it('does not assign inactive or invalid experiments', () => {
    expect(
      assignExperiment(
        { id: 'x', name: 'x', active: false, variants: [{ id: 'a', weight: 1 }] },
        'visitor',
        []
      )
    ).toBeNull();
    expect(
      assignExperiment(
        { id: 'x', name: 'x', active: true, variants: [{ id: 'a', weight: 0 }] },
        'visitor',
        []
      )
    ).toBeNull();
  });

  it('calculates conversion rate for an assigned variant', () => {
    const events = [
      event(
        'experiment_exposure:layout',
        { feature: 'layout', variant: 'cards' },
        { type: 'feature_use' }
      ),
      event(
        'experiment_exposure:layout',
        { feature: 'layout', variant: 'cards' },
        { type: 'feature_use' }
      ),
      event(
        'experiment_conversion:layout',
        { feature: 'layout', variant: 'cards' },
        { type: 'feature_use' }
      ),
    ];
    const [result] = calculateExperimentResults(events, [
      { experimentId: 'layout', variantId: 'cards', assignedAt: 'now' },
    ]);
    expect(result).toMatchObject({ exposures: 2, conversions: 1, conversionRate: 0.5 });
  });
});
