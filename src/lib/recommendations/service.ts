import { generateRecommendations } from './engine';
import { createPseudonymousId, removeSensitiveInterests } from './privacy';
import type {
  FeedbackValue,
  RecommendationContext,
  RecommendationFeedback,
  RecommendationPreferences,
  RecommendationRequest,
  RecommendationResponse,
  RecommendationSnapshot,
  RecommendationStorageState,
  RecommendationTelemetry,
} from '../../types/recommendations';
import { DEFAULT_RECOMMENDATION_PREFERENCES } from '../../types/recommendations';

const STORAGE_KEY = 'stellar:recommendations:v1';
const MAX_FEEDBACK = 100;
const REMOTE_TIMEOUT_MS = 160;

interface RuntimeProfile {
  interests: string[];
  heldAssets: string[];
  usedItems: string[];
  context: RecommendationContext;
}

type Listener = () => void;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function normalizePreferences(
  value?: Partial<RecommendationPreferences>
): RecommendationPreferences {
  const goals = value?.goals?.filter((goal) =>
    ['build', 'invest', 'payments', 'defi', 'learn'].includes(goal)
  );
  const categories = value?.categories?.filter((category) =>
    ['account', 'asset', 'contract', 'service'].includes(category)
  );
  return {
    goals: goals?.length ? [...new Set(goals)] : DEFAULT_RECOMMENDATION_PREFERENCES.goals,
    categories: categories?.length
      ? [...new Set(categories)]
      : DEFAULT_RECOMMENDATION_PREFERENCES.categories,
    riskTolerance: ['conservative', 'balanced', 'growth'].includes(value?.riskTolerance ?? '')
      ? value!.riskTolerance!
      : DEFAULT_RECOMMENDATION_PREFERENCES.riskTolerance,
    diversity: Math.min(
      1,
      Math.max(0, Number(value?.diversity ?? DEFAULT_RECOMMENDATION_PREFERENCES.diversity))
    ),
    discovery: Math.min(
      1,
      Math.max(0, Number(value?.discovery ?? DEFAULT_RECOMMENDATION_PREFERENCES.discovery))
    ),
    personalizationEnabled: value?.personalizationEnabled !== false,
  };
}

function loadState(): RecommendationStorageState {
  const fallback: RecommendationStorageState = {
    version: 1,
    pseudonymousId: createPseudonymousId(),
    preferences: { ...DEFAULT_RECOMMENDATION_PREFERENCES },
    feedback: [],
  };
  try {
    const parsed = JSON.parse(
      safeStorage()?.getItem(STORAGE_KEY) ?? 'null'
    ) as Partial<RecommendationStorageState> | null;
    if (!parsed || parsed.version !== 1 || typeof parsed.pseudonymousId !== 'string')
      return fallback;
    return {
      version: 1,
      pseudonymousId: parsed.pseudonymousId,
      preferences: normalizePreferences(parsed.preferences),
      feedback: Array.isArray(parsed.feedback)
        ? parsed.feedback.filter(isValidFeedback).slice(-MAX_FEEDBACK)
        : [],
    };
  } catch {
    return fallback;
  }
}

function isValidFeedback(value: unknown): value is RecommendationFeedback {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecommendationFeedback>;
  return (
    typeof entry.itemId === 'string' &&
    entry.itemId.length <= 80 &&
    ['accepted', 'dismissed', 'saved'].includes(entry.value ?? '') &&
    typeof entry.createdAt === 'string'
  );
}

function isRemoteResponse(value: unknown): value is RecommendationResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<RecommendationResponse>;
  const variants = ['relevance', 'balanced', 'discovery'];
  return Boolean(
    Array.isArray(response.recommendations) &&
    response.recommendations.length <= 20 &&
    response.recommendations.every((recommendation) => {
      if (!recommendation || typeof recommendation !== 'object') return false;
      const item = recommendation.item;
      if (
        !item ||
        typeof item.id !== 'string' ||
        typeof item.title !== 'string' ||
        typeof item.description !== 'string' ||
        typeof item.url !== 'string' ||
        !['account', 'asset', 'contract', 'service'].includes(item.category) ||
        !Number.isFinite(recommendation.score) ||
        !Array.isArray(recommendation.reasons)
      )
        return false;
      try {
        return ['http:', 'https:'].includes(new URL(item.url).protocol);
      } catch {
        return false;
      }
    }) &&
    typeof response.generatedAt === 'string' &&
    typeof response.modelVersion === 'string' &&
    typeof response.processingMs === 'number' &&
    Boolean(response.experiment && variants.includes(response.experiment.variant))
  );
}

export class RecommendationService {
  private state: RecommendationStorageState;
  private runtime: RuntimeProfile;
  private listeners = new Set<Listener>();
  private telemetry: RecommendationTelemetry[] = [];
  private latest: RecommendationResponse;

  constructor(initial?: RecommendationStorageState) {
    this.state = initial ?? loadState();
    this.runtime = {
      interests: [],
      heldAssets: [],
      usedItems: [],
      context: { network: 'testnet', online: typeof navigator === 'undefined' || navigator.onLine },
    };
    this.latest = this.rankLocally();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private persist(): void {
    try {
      safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Recommendation quality degrades gracefully if storage is unavailable.
    }
  }

  private request(): RecommendationRequest {
    const personalization = this.state.preferences.personalizationEnabled;
    return {
      profile: {
        pseudonymousId: this.state.pseudonymousId,
        interests: personalization ? this.runtime.interests : [],
        heldAssets: personalization ? this.runtime.heldAssets : [],
        usedItems: personalization ? this.runtime.usedItems : [],
        preferences: personalization
          ? this.state.preferences
          : { ...DEFAULT_RECOMMENDATION_PREFERENCES, personalizationEnabled: false },
        feedback: personalization ? this.state.feedback : [],
      },
      context: this.runtime.context,
      limit: 12,
    };
  }

  private rankLocally(): RecommendationResponse {
    return generateRecommendations(this.request());
  }

  getSnapshot(): RecommendationSnapshot {
    return {
      ...this.latest,
      preferences: this.state.preferences,
      feedbackCount: this.state.feedback.length,
    };
  }

  updateRuntime(input: Partial<RuntimeProfile>): void {
    this.runtime = {
      ...this.runtime,
      ...input,
      interests: input.interests
        ? removeSensitiveInterests(input.interests)
        : this.runtime.interests,
      heldAssets: input.heldAssets
        ? removeSensitiveInterests(input.heldAssets)
        : this.runtime.heldAssets,
      usedItems: input.usedItems
        ? [...new Set(input.usedItems.filter((value) => /^[a-z0-9-]{1,80}$/i.test(value)))].slice(
            0,
            30
          )
        : this.runtime.usedItems,
      context: input.context ? { ...this.runtime.context, ...input.context } : this.runtime.context,
    };
    this.latest = this.rankLocally();
    this.emit();
  }

  setPreferences(patch: Partial<RecommendationPreferences>): void {
    this.state = {
      ...this.state,
      preferences: normalizePreferences({ ...this.state.preferences, ...patch }),
    };
    this.persist();
    this.latest = this.rankLocally();
    this.emit();
  }

  recordFeedback(itemId: string, value: FeedbackValue, rank = 0): void {
    if (!/^[a-z0-9-]{1,80}$/i.test(itemId)) return;
    const entry: RecommendationFeedback = { itemId, value, createdAt: new Date().toISOString() };
    this.state = {
      ...this.state,
      feedback: [...this.state.feedback.filter((item) => item.itemId !== itemId), entry].slice(
        -MAX_FEEDBACK
      ),
    };
    const recommendation = this.latest.recommendations.find((item) => item.item.id === itemId);
    if (recommendation) {
      this.recordTelemetry({
        event: 'recommendation_feedback',
        category: recommendation.item.category,
        rank: rank || recommendation.rank,
        variant: this.latest.experiment.variant,
        feedback: value,
      });
      this.sendAggregateFeedback(recommendation.item.category, value);
    }
    this.persist();
    this.latest = this.rankLocally();
    this.emit();
  }

  recordImpression(category: RecommendationTelemetry['category'], rank: number): void {
    this.recordTelemetry({
      event: 'recommendation_impression',
      category,
      rank,
      variant: this.latest.experiment.variant,
    });
  }

  private recordTelemetry(event: RecommendationTelemetry): void {
    // Deliberately excludes account IDs, assets, item IDs, and free-form properties.
    this.telemetry = [...this.telemetry.slice(-199), event];
  }

  private sendAggregateFeedback(
    category: RecommendationTelemetry['category'],
    value: FeedbackValue
  ): void {
    const endpoint = import.meta.env.VITE_RECOMMENDATIONS_API_URL?.trim();
    if (!endpoint || !this.runtime.context.online) return;
    void fetch(`${endpoint.replace(/\/$/, '')}/api/v1/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        value,
        variant: this.latest.experiment.variant,
      }),
    }).catch(() => {
      // Aggregate experiment telemetry must never block ranking or feedback.
    });
  }

  getPrivateTelemetrySummary(): Record<string, number> {
    return this.telemetry.reduce<Record<string, number>>((summary, event) => {
      const key = `${event.event}:${event.category}:${event.feedback ?? 'none'}`;
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    }, {});
  }

  clearPersonalization(): void {
    this.state = {
      version: 1,
      pseudonymousId: createPseudonymousId(),
      preferences: { ...DEFAULT_RECOMMENDATION_PREFERENCES, personalizationEnabled: false },
      feedback: [],
    };
    this.runtime = { ...this.runtime, interests: [], heldAssets: [], usedItems: [] };
    this.telemetry = [];
    this.persist();
    this.latest = this.rankLocally();
    this.emit();
  }

  async refresh(signal?: AbortSignal): Promise<RecommendationResponse> {
    const endpoint = import.meta.env.VITE_RECOMMENDATIONS_API_URL?.trim();
    if (!endpoint || !this.runtime.context.online) {
      this.latest = this.rankLocally();
      this.emit();
      return this.latest;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/v1/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.request()),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Recommendation API returned ${response.status}`);
      const body: unknown = await response.json();
      if (!isRemoteResponse(body)) throw new Error('Recommendation API response was invalid');
      this.latest = { ...body, state: 'live' };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.latest = this.rankLocally();
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
    this.emit();
    return this.latest;
  }
}

export const recommendationService = new RecommendationService();
