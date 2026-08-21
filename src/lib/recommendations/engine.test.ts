import { describe, expect, it } from 'vitest';
import {
  assignRecommendationExperiment,
  generateRecommendations,
  validateRecommendationRequest,
} from './engine';
import { RECOMMENDATION_CATALOG } from './catalog';
import type { RecommendationRequest } from '../../types/recommendations';
import { DEFAULT_RECOMMENDATION_PREFERENCES } from '../../types/recommendations';

function request(patch: Partial<RecommendationRequest['profile']> = {}): RecommendationRequest {
  return {
    profile: {
      pseudonymousId: 'rec_engine-test-user',
      interests: ['soroban', 'rust'],
      heldAssets: ['xlm'],
      usedItems: [],
      feedback: [],
      preferences: {
        ...DEFAULT_RECOMMENDATION_PREFERENCES,
        goals: ['build'],
        discovery: 0.4,
        diversity: 0.75,
      },
      ...patch,
    },
    context: { network: 'testnet', online: true, hour: 12 },
    limit: 8,
  };
}

describe('hybrid recommendation engine', () => {
  it('produces deterministic and explainable rankings', () => {
    const first = generateRecommendations(request());
    const second = generateRecommendations(request());
    expect(first.recommendations.map((item) => item.item.id)).toEqual(
      second.recommendations.map((item) => item.item.id)
    );
    expect(first.recommendations).toHaveLength(8);
    expect(first.recommendations.every((item, index) => item.rank === index + 1)).toBe(true);
    expect(
      first.recommendations.every(
        (item) => item.reasons.length > 0 && item.confidence >= 0 && item.confidence <= 1
      )
    ).toBe(true);
    expect(first.processingMs).toBeGreaterThanOrEqual(0);
  });

  it('handles cold start with quality and popularity signals', () => {
    const result = generateRecommendations(
      request({ interests: [], heldAssets: [], feedback: [] })
    );
    expect(result.coldStart).toBe(true);
    expect(result.recommendations[0].item.quality).toBeGreaterThan(0.85);
    expect(result.recommendations.some((item) => item.item.metadata.verified)).toBe(true);
  });

  it('learns immediately from positive and negative feedback', () => {
    const baseline = generateRecommendations(request());
    const target = baseline.recommendations[0];
    const dismissed = generateRecommendations(
      request({
        feedback: [
          { itemId: target.item.id, value: 'dismissed', createdAt: new Date().toISOString() },
        ],
      })
    );
    expect(dismissed.recommendations.some((item) => item.item.id === target.item.id)).toBe(false);
    const lowerItem = baseline.recommendations[baseline.recommendations.length - 1];
    const saved = generateRecommendations(
      request({
        feedback: [
          { itemId: lowerItem.item.id, value: 'saved', createdAt: new Date().toISOString() },
        ],
      })
    );
    expect(
      saved.recommendations.find((item) => item.item.id === lowerItem.item.id)!.rank
    ).toBeLessThan(lowerItem.rank);
  });

  it('respects category, network, exclusions, and list limits', () => {
    const result = generateRecommendations({
      ...request(),
      category: 'contract',
      excludeIds: ['contract-token'],
      limit: 2,
    });
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations.every((item) => item.item.category === 'contract')).toBe(true);
    expect(result.recommendations.some((item) => item.item.id === 'contract-token')).toBe(false);
  });

  it('uses diversity to avoid a single-category result set', () => {
    const result = generateRecommendations(
      request({
        preferences: {
          ...DEFAULT_RECOMMENDATION_PREFERENCES,
          goals: ['build'],
          diversity: 1,
          discovery: 0.5,
        },
      })
    );
    expect(
      new Set(result.recommendations.slice(0, 6).map((item) => item.item.category)).size
    ).toBeGreaterThanOrEqual(3);
    expect(result.recommendations.some((item) => item.breakdown.diversityPenalty > 0)).toBe(true);
  });

  it('assigns stable A/B variants without account data', () => {
    expect(assignRecommendationExperiment('rec_a-stable-id')).toEqual(
      assignRecommendationExperiment('rec_a-stable-id')
    );
    const assignments = Array.from(
      { length: 100 },
      (_, index) => assignRecommendationExperiment(`rec_user-${index}`).variant
    );
    expect(new Set(assignments)).toEqual(new Set(['relevance', 'balanced', 'discovery']));
  });

  it('validates the public request contract', () => {
    expect(validateRecommendationRequest(request())).toBe(true);
    expect(validateRecommendationRequest({ ...request(), limit: 21 })).toBe(false);
    expect(validateRecommendationRequest({ profile: null, context: {} })).toBe(false);
    expect(RECOMMENDATION_CATALOG.length).toBeGreaterThan(12);
  });
});
