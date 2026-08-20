export type AnalyticsEventType =
  | 'navigation'
  | 'feature_use'
  | 'transaction_workflow'
  | 'preference_change'
  | 'learning_progress'
  | 'collaboration'
  | 'feedback';

export type AnalyticsProperty = string | number | boolean;

export interface BehaviorEvent {
  id: string;
  type: AnalyticsEventType;
  name: string;
  occurredAt: string;
  sessionId: string;
  properties: Record<string, AnalyticsProperty>;
}

export type ConsentStatus = 'pending' | 'granted' | 'denied';

export interface AnalyticsConsent {
  status: ConsentStatus;
  usage: boolean;
  personalization: boolean;
  updatedAt: string | null;
  policyVersion: number;
}

export type UserPersona = 'developer' | 'trader' | 'validator' | 'researcher' | 'explorer';
export type ExperienceLevel = 'new' | 'intermediate' | 'advanced';
export type EngagementLevel = 'casual' | 'regular' | 'power' | 'at-risk';

export interface UserSegment {
  persona: UserPersona;
  experience: ExperienceLevel;
  engagement: EngagementLevel;
  confidence: number;
  signals: string[];
  updatedAt: string;
}

export interface FeatureUsage {
  feature: string;
  count: number;
  percentage: number;
  lastUsedAt: string;
}

export interface FrictionPoint {
  workflow: string;
  attempts: number;
  failures: number;
  abandonmentRate: number;
  severity: 'low' | 'medium' | 'high';
}

export interface BehaviorSummary {
  eventCount: number;
  sessionCount: number;
  activeDays: number;
  topFeatures: FeatureUsage[];
  frictionPoints: FrictionPoint[];
  segment: UserSegment;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export type RecommendationKind = 'feature' | 'learning' | 'workflow' | 'retention';

export interface PersonalizationRecommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  reason: string;
  actionTab: string;
  priority: number;
}

export interface ExperimentVariant {
  id: string;
  weight: number;
}

export interface ExperimentDefinition {
  id: string;
  name: string;
  variants: ExperimentVariant[];
  active: boolean;
}

export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  assignedAt: string;
}

export interface ExperimentResult {
  experimentId: string;
  variantId: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

export interface PrivateAggregate {
  metric: string;
  value: number;
  noiseApplied: boolean;
  epsilon: number;
}

export interface AnalyticsSnapshot {
  consent: AnalyticsConsent;
  summary: BehaviorSummary;
  recommendations: PersonalizationRecommendation[];
  experiments: ExperimentResult[];
  privateAggregates: PrivateAggregate[];
  storageBytes: number;
  retainedUntil: string | null;
}

export interface AnalyticsExport {
  schemaVersion: 1;
  exportedAt: string;
  consent: AnalyticsConsent;
  events: BehaviorEvent[];
  assignments: ExperimentAssignment[];
}

export interface TrackEventInput {
  type: AnalyticsEventType;
  name: string;
  properties?: Record<string, unknown>;
}

export interface AnalyticsStorageState {
  schemaVersion: 1;
  pseudonymousId: string;
  consent: AnalyticsConsent;
  events: BehaviorEvent[];
  assignments: ExperimentAssignment[];
}
