import { RECOMMENDATION_CATALOG } from './catalog';
import type {
  RankedRecommendation,
  RecommendationExperiment,
  RecommendationItem,
  RecommendationRequest,
  RecommendationResponse,
  RiskTolerance,
  ScoreBreakdown,
  UserRecommendationProfile,
} from '../../types/recommendations';

export const RECOMMENDATION_MODEL_VERSION = 'hybrid-1.0.0';

const GOAL_COHORT = {
  build: 'builder',
  invest: 'investor',
  payments: 'payments',
  defi: 'defi',
  learn: 'learner',
} as const;

const VARIANT_WEIGHTS = {
  relevance: { content: 0.38, collaborative: 0.27, quality: 0.22, context: 0.06, novelty: 0.07 },
  balanced: { content: 0.3, collaborative: 0.24, quality: 0.2, context: 0.08, novelty: 0.18 },
  discovery: { content: 0.22, collaborative: 0.2, quality: 0.18, context: 0.08, novelty: 0.32 },
} as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

export function stableFraction(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function assignRecommendationExperiment(pseudonymousId: string): RecommendationExperiment {
  const bucket = stableFraction(`ecosystem-ranking-v1:${pseudonymousId}`);
  return {
    id: 'ecosystem-ranking-v1',
    variant: bucket < 0.34 ? 'relevance' : bucket < 0.67 ? 'balanced' : 'discovery',
  };
}

function setSimilarity(left: string[], right: string[]): number {
  const a = new Set(left.map((value) => value.toLowerCase()));
  const b = new Set(right.map((value) => value.toLowerCase()));
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let intersection = 0;
  a.forEach((value) => {
    if (b.has(value)) intersection += 1;
  });
  return intersection / union.size;
}

function riskAffinity(preferred: RiskTolerance, actual: RiskTolerance): number {
  const order: RiskTolerance[] = ['conservative', 'balanced', 'growth'];
  return 1 - Math.abs(order.indexOf(preferred) - order.indexOf(actual)) * 0.42;
}

function contentScore(item: RecommendationItem, profile: UserRecommendationProfile): number {
  const interests = [...profile.interests, ...profile.heldAssets];
  const tagMatch = setSimilarity(interests, item.tags);
  const goalMatch = setSimilarity(profile.preferences.goals, item.goals);
  return clamp(
    tagMatch * 0.48 +
      goalMatch * 0.38 +
      riskAffinity(profile.preferences.riskTolerance, item.risk) * 0.14
  );
}

function collaborativeScore(item: RecommendationItem, profile: UserRecommendationProfile): number {
  if (!profile.preferences.goals.length) return item.popularity;
  const scores = profile.preferences.goals.map(
    (goal) => item.collaborativeSignals[GOAL_COHORT[goal]] ?? 0
  );
  // The catalog signals are pre-computed item factors; goal cohorts form the user factor.
  // Their dot product is a compact matrix-factorization inference suitable for the browser.
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function contextualScore(item: RecommendationItem, request: RecommendationRequest): number {
  const network = item.metadata.network;
  const networkFit =
    !network || network === 'both' || network === request.context.network ? 1 : 0.12;
  const hour = request.context.hour ?? new Date().getHours();
  const timeFit =
    request.profile.preferences.goals.includes('build') && hour >= 8 && hour <= 19 ? 1 : 0.72;
  return networkFit * 0.78 + timeFit * 0.22;
}

function feedbackScore(item: RecommendationItem, profile: UserRecommendationProfile): number {
  const ownFeedback = profile.feedback.filter((entry) => entry.itemId === item.id);
  if (ownFeedback.some((entry) => entry.value === 'dismissed')) return -1;
  if (ownFeedback.some((entry) => entry.value === 'accepted')) return 0.28;
  if (ownFeedback.some((entry) => entry.value === 'saved')) return 0.18;

  const positiveTags = profile.feedback
    .filter((entry) => entry.value !== 'dismissed')
    .flatMap(
      (entry) =>
        RECOMMENDATION_CATALOG.find((candidate) => candidate.id === entry.itemId)?.tags ?? []
    );
  const negativeTags = profile.feedback
    .filter((entry) => entry.value === 'dismissed')
    .flatMap(
      (entry) =>
        RECOMMENDATION_CATALOG.find((candidate) => candidate.id === entry.itemId)?.tags ?? []
    );
  return clamp(
    setSimilarity(item.tags, positiveTags) * 0.32 - setSimilarity(item.tags, negativeTags) * 0.45,
    -0.45,
    0.32
  );
}

function scoreItem(item: RecommendationItem, request: RecommendationRequest): RankedRecommendation {
  const experiment =
    request.experiment ?? assignRecommendationExperiment(request.profile.pseudonymousId);
  const weights = VARIANT_WEIGHTS[experiment.variant];
  const breakdown: ScoreBreakdown = {
    content: contentScore(item, request.profile),
    collaborative: collaborativeScore(item, request.profile),
    quality: item.quality,
    context: contextualScore(item, request),
    novelty:
      item.novelty * request.profile.preferences.discovery +
      item.popularity * (1 - request.profile.preferences.discovery),
    feedback: feedbackScore(item, request.profile),
    diversityPenalty: 0,
  };
  const weighted =
    breakdown.content * weights.content +
    breakdown.collaborative * weights.collaborative +
    breakdown.quality * weights.quality +
    breakdown.context * weights.context +
    breakdown.novelty * weights.novelty +
    breakdown.feedback;
  return {
    item,
    score: round(clamp(weighted)),
    confidence: round(
      clamp(0.48 + item.quality * 0.25 + (breakdown.content + breakdown.collaborative) * 0.14)
    ),
    reasons: buildReasons(item, breakdown, request.profile),
    breakdown,
    rank: 0,
  };
}

function buildReasons(
  item: RecommendationItem,
  scores: ScoreBreakdown,
  profile: UserRecommendationProfile
): string[] {
  const reasons: string[] = [];
  const matchingGoals = item.goals.filter((goal) => profile.preferences.goals.includes(goal));
  const matchingInterests = item.tags.filter((tag) =>
    [...profile.interests, ...profile.heldAssets].some(
      (value) => value.toLowerCase() === tag.toLowerCase()
    )
  );
  if (matchingGoals.length)
    reasons.push(
      `Supports your ${matchingGoals.slice(0, 2).join(' and ')} goal${matchingGoals.length > 1 ? 's' : ''}`
    );
  if (matchingInterests.length)
    reasons.push(`Matches your interest in ${matchingInterests.slice(0, 2).join(' and ')}`);
  if (scores.collaborative >= 0.8) reasons.push('Popular with people pursuing similar workflows');
  if (item.metadata.securityScore && item.metadata.securityScore >= 85)
    reasons.push(`Strong ${item.metadata.securityScore}/100 security record`);
  if (item.metadata.verified) reasons.push('Verified ecosystem resource');
  if (scores.novelty >= 0.6) reasons.push('Adds something new to your usual activity');
  return reasons.slice(0, 3).length
    ? reasons.slice(0, 3)
    : ['Widely used across the Stellar ecosystem'];
}

function similarity(left: RecommendationItem, right: RecommendationItem): number {
  const category = left.category === right.category ? 0.35 : 0;
  const sector = left.metadata.sector && left.metadata.sector === right.metadata.sector ? 0.25 : 0;
  return clamp(category + sector + setSimilarity(left.tags, right.tags) * 0.4);
}

function diversify(
  candidates: RankedRecommendation[],
  limit: number,
  diversity: number
): RankedRecommendation[] {
  const remaining = [...candidates];
  const selected: RankedRecommendation[] = [];
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestUtility = -Infinity;
    remaining.forEach((candidate, index) => {
      const penalty = selected.length
        ? Math.max(...selected.map((chosen) => similarity(candidate.item, chosen.item))) *
          diversity *
          0.34
        : 0;
      const utility = candidate.score - penalty;
      if (utility > bestUtility) {
        bestUtility = utility;
        bestIndex = index;
      }
    });
    const [winner] = remaining.splice(bestIndex, 1);
    const penalty = winner.score - bestUtility;
    selected.push({
      ...winner,
      score: round(clamp(bestUtility)),
      breakdown: { ...winner.breakdown, diversityPenalty: round(penalty) },
      rank: selected.length + 1,
    });
  }
  return selected;
}

export function generateRecommendations(
  request: RecommendationRequest,
  catalog: RecommendationItem[] = RECOMMENDATION_CATALOG
): RecommendationResponse {
  const started = typeof performance === 'undefined' ? Date.now() : performance.now();
  const experiment =
    request.experiment ?? assignRecommendationExperiment(request.profile.pseudonymousId);
  const excluded = new Set([...(request.excludeIds ?? []), ...request.profile.usedItems]);
  const categories = new Set(request.profile.preferences.categories);
  const candidates = catalog
    .filter((item) => categories.has(item.category))
    .filter((item) => !request.category || item.category === request.category)
    .filter((item) => !excluded.has(item.id))
    .filter((item) => feedbackScore(item, request.profile) > -0.8)
    .map((item) => scoreItem(item, { ...request, experiment }))
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));
  const recommendations = diversify(
    candidates,
    clamp(request.limit ?? 8, 1, 20),
    request.profile.preferences.diversity
  );
  const finished = typeof performance === 'undefined' ? Date.now() : performance.now();
  return {
    recommendations,
    generatedAt: new Date().toISOString(),
    modelVersion: RECOMMENDATION_MODEL_VERSION,
    state: request.context.online ? 'local' : 'offline',
    experiment,
    processingMs: round(finished - started),
    coldStart: request.profile.feedback.length === 0 && request.profile.interests.length === 0,
  };
}

export function validateRecommendationRequest(value: unknown): value is RecommendationRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<RecommendationRequest>;
  const profile = request.profile;
  return Boolean(
    profile &&
    typeof profile.pseudonymousId === 'string' &&
    profile.pseudonymousId.length >= 8 &&
    Array.isArray(profile.interests) &&
    Array.isArray(profile.heldAssets) &&
    Array.isArray(profile.feedback) &&
    profile.preferences &&
    request.context &&
    typeof request.context.network === 'string' &&
    typeof request.context.online === 'boolean' &&
    (!request.limit ||
      (Number.isInteger(request.limit) && request.limit > 0 && request.limit <= 20))
  );
}
