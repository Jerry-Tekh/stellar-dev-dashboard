import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecommendationService } from './service';
import { DEFAULT_RECOMMENDATION_PREFERENCES } from '../../types/recommendations';

function service() {
  return new RecommendationService({
    version: 1,
    pseudonymousId: 'rec_service-test',
    preferences: {
      ...DEFAULT_RECOMMENDATION_PREFERENCES,
      goals: ['build'],
      personalizationEnabled: true,
    },
    feedback: [],
  });
}

describe('RecommendationService', () => {
  beforeEach(() => localStorage.clear());

  it('updates runtime features without retaining wallet-shaped values', () => {
    const instance = service(),
      key = `G${'A'.repeat(55)}`;
    instance.updateRuntime({
      interests: ['soroban', key],
      heldAssets: ['xlm'],
      context: { network: 'testnet', online: true },
    });
    expect(
      instance
        .getSnapshot()
        .recommendations.some((item) => item.reasons.some((reason) => reason.includes(key)))
    ).toBe(false);
    expect(JSON.stringify(instance.getSnapshot())).not.toContain(key);
  });

  it('persists bounded feedback and updates results online', () => {
    const instance = service(),
      first = instance.getSnapshot().recommendations[0];
    instance.recordFeedback(first.item.id, 'dismissed', first.rank);
    expect(
      instance.getSnapshot().recommendations.some((item) => item.item.id === first.item.id)
    ).toBe(false);
    expect(instance.getSnapshot().feedbackCount).toBe(1);
    expect(localStorage.getItem('stellar:recommendations:v1')).toContain('dismissed');
  });

  it('notifies subscribers for preference changes', () => {
    const instance = service(),
      listener = vi.fn(),
      unsubscribe = instance.subscribe(listener);
    instance.setPreferences({ discovery: 0.9, riskTolerance: 'growth' });
    expect(instance.getSnapshot().preferences.discovery).toBe(0.9);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    instance.setPreferences({ discovery: 0.2 });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('records only coarse private telemetry aggregates', () => {
    const instance = service(),
      first = instance.getSnapshot().recommendations[0];
    instance.recordImpression(first.item.category, first.rank);
    instance.recordFeedback(first.item.id, 'saved', first.rank);
    const summary = instance.getPrivateTelemetrySummary();
    expect(summary[`recommendation_impression:${first.item.category}:none`]).toBe(1);
    expect(Object.keys(summary).join(' ')).not.toContain(first.item.id);
  });

  it('clears feedback, disables personalization, and rotates the identifier', () => {
    const instance = service(),
      variant = instance.getSnapshot().experiment;
    instance.recordFeedback(instance.getSnapshot().recommendations[0].item.id, 'saved');
    instance.clearPersonalization();
    expect(instance.getSnapshot().feedbackCount).toBe(0);
    expect(instance.getSnapshot().preferences.personalizationEnabled).toBe(false);
    expect(instance.getSnapshot().experiment.id).toBe(variant.id);
  });
});
