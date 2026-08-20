export type SentimentLabel = 'bullish' | 'neutral' | 'bearish';
export type SentimentSource =
  'x' | 'reddit' | 'discord' | 'telegram' | 'news' | 'research' | 'on-chain' | 'market';
export type SentimentSeverity = 'info' | 'warning' | 'critical';
export type SentimentDataState = 'live' | 'degraded' | 'offline' | 'simulation';

export interface SentimentDocument {
  id: string;
  source: SentimentSource;
  publishedAt: string;
  collectedAt: string;
  language: string;
  text: string;
  authorId?: string;
  authorFollowers?: number;
  engagement?: number;
  url?: string;
  verified?: boolean;
  duplicateOf?: string;
}

export interface SourceProfile {
  source: SentimentSource;
  label: string;
  enabled: boolean;
  live: boolean;
  credibility: number;
  sampleCount: number;
  lastCollectedAt?: string;
  latencySeconds?: number;
  error?: string;
}

export interface AspectSentiment {
  aspect: 'price' | 'network' | 'ecosystem' | 'defi' | 'payments' | 'regulation';
  score: number;
  mentions: number;
}

export interface EntityMention {
  entity: string;
  type: 'asset' | 'project' | 'person' | 'organization';
  mentions: number;
  score: number;
}

export interface AnalyzedSentiment extends SentimentDocument {
  score: number;
  confidence: number;
  label: SentimentLabel;
  credibility: number;
  spamProbability: number;
  influence: number;
  aspects: AspectSentiment[];
  entities: EntityMention[];
  translated: boolean;
  modelVersion: string;
  rationale: string[];
}

export interface SentimentTrendPoint {
  timestamp: string;
  score: number;
  volume: number;
  priceUsd: number;
  onChainActivity: number;
  positiveShare: number;
  negativeShare: number;
}

export interface SourceSentiment {
  source: SentimentSource;
  score: number;
  volume: number;
  credibility: number;
  change24h: number;
}

export interface LanguageSentiment {
  language: string;
  score: number;
  volume: number;
  coverage: number;
}

export interface SentimentAlert {
  id: string;
  title: string;
  message: string;
  severity: SentimentSeverity;
  status: 'active' | 'acknowledged' | 'resolved';
  createdAt: string;
  change: number;
  zScore: number;
  sources: SentimentSource[];
  recommendation: string;
}

export interface ViralSignal {
  id: string;
  topic: string;
  velocity: number;
  engagement: number;
  score: number;
  source: SentimentSource;
  detectedAt: string;
}

export interface DirectionForecast {
  direction: SentimentLabel;
  probability: number;
  confidence: number;
  horizonHours: number;
  modelVersion: string;
  drivers: string[];
  disclaimer: string;
}

export interface CorrelationResult {
  coefficient: number;
  sampleSize: number;
  lagHours: number;
  pValueEstimate: number;
  statisticallySignificant: boolean;
  interpretation: string;
}

export interface SentimentSummary {
  score: number;
  label: SentimentLabel;
  confidence: number;
  change24h: number;
  mentionVolume24h: number;
  processedToday: number;
  spamFiltered: number;
  dataFreshnessSeconds: number;
}

export interface SentimentSnapshot {
  generatedAt: string;
  state: SentimentDataState;
  network: string;
  summary: SentimentSummary;
  sources: SourceProfile[];
  sourceBreakdown: SourceSentiment[];
  languageBreakdown: LanguageSentiment[];
  aspects: AspectSentiment[];
  entities: EntityMention[];
  trend: SentimentTrendPoint[];
  recentDocuments: AnalyzedSentiment[];
  alerts: SentimentAlert[];
  viralSignals: ViralSignal[];
  forecast: DirectionForecast;
  priceCorrelation: CorrelationResult;
  retentionDays: number;
  methodologyVersion: string;
  caveats: string[];
}

export interface SentimentPreferences {
  refreshIntervalMs: number;
  minimumConfidence: number;
  includeLowCredibility: boolean;
  selectedLanguage: string;
  autoRefresh: boolean;
}

export interface SentimentApiError {
  code: 'timeout' | 'unavailable' | 'invalid-response' | 'rate-limited' | 'aborted';
  message: string;
  retryable: boolean;
  requestId?: string;
}

export interface SentimentSnapshotResponse {
  data: SentimentSnapshot;
  requestId: string;
  cached: boolean;
}
