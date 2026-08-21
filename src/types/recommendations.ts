export type RecommendationCategory = 'account' | 'asset' | 'contract' | 'service';
export type RecommendationGoal = 'build' | 'invest' | 'payments' | 'defi' | 'learn';
export type RiskTolerance = 'conservative' | 'balanced' | 'growth';
export type FeedbackValue = 'accepted' | 'dismissed' | 'saved';
export type RecommendationState = 'live' | 'local' | 'offline';

export interface RecommendationItem {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  url: string;
  tags: string[];
  goals: RecommendationGoal[];
  risk: RiskTolerance;
  popularity: number;
  quality: number;
  novelty: number;
  collaborativeSignals: Record<string, number>;
  metadata: {
    verified?: boolean;
    network?: 'mainnet' | 'testnet' | 'both';
    sector?: string;
    provider?: string;
    securityScore?: number;
  };
}

export interface RecommendationPreferences {
  goals: RecommendationGoal[];
  riskTolerance: RiskTolerance;
  categories: RecommendationCategory[];
  diversity: number;
  discovery: number;
  personalizationEnabled: boolean;
}

export interface RecommendationContext {
  network: string;
  hour?: number;
  online: boolean;
}

export interface UserRecommendationProfile {
  pseudonymousId: string;
  interests: string[];
  heldAssets: string[];
  usedItems: string[];
  preferences: RecommendationPreferences;
  feedback: RecommendationFeedback[];
}

export interface RecommendationFeedback {
  itemId: string;
  value: FeedbackValue;
  createdAt: string;
}

export interface ScoreBreakdown {
  content: number;
  collaborative: number;
  quality: number;
  context: number;
  novelty: number;
  feedback: number;
  diversityPenalty: number;
}

export interface RankedRecommendation {
  item: RecommendationItem;
  score: number;
  confidence: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
  rank: number;
}

export interface RecommendationExperiment {
  id: string;
  variant: 'relevance' | 'balanced' | 'discovery';
}

export interface RecommendationRequest {
  profile: UserRecommendationProfile;
  context: RecommendationContext;
  limit?: number;
  category?: RecommendationCategory;
  excludeIds?: string[];
  experiment?: RecommendationExperiment;
}

export interface RecommendationResponse {
  recommendations: RankedRecommendation[];
  generatedAt: string;
  modelVersion: string;
  state: RecommendationState;
  experiment: RecommendationExperiment;
  processingMs: number;
  coldStart: boolean;
}

export interface RecommendationSnapshot extends RecommendationResponse {
  preferences: RecommendationPreferences;
  feedbackCount: number;
}

export interface RecommendationServiceError {
  code: 'timeout' | 'unavailable' | 'invalid-response' | 'aborted';
  message: string;
  retryable: boolean;
}

export interface RecommendationStorageState {
  version: 1;
  pseudonymousId: string;
  preferences: RecommendationPreferences;
  feedback: RecommendationFeedback[];
}

export interface RecommendationTelemetry {
  event: 'recommendation_impression' | 'recommendation_feedback';
  category: RecommendationCategory;
  rank: number;
  variant: RecommendationExperiment['variant'];
  feedback?: FeedbackValue;
}

export const DEFAULT_RECOMMENDATION_PREFERENCES: RecommendationPreferences = {
  goals: ['learn'],
  riskTolerance: 'balanced',
  categories: ['account', 'asset', 'contract', 'service'],
  diversity: 0.65,
  discovery: 0.35,
  personalizationEnabled: false,
};
