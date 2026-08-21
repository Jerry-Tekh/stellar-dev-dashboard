export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical'
export type FraudDecision = 'allow' | 'monitor' | 'review' | 'hold' | 'block'
export type FraudDataState = 'live' | 'degraded' | 'offline' | 'simulation'
export type FraudCategory =
  | 'phishing'
  | 'impersonation'
  | 'account-takeover'
  | 'transaction-manipulation'
  | 'investment-scam'
  | 'malicious-network'
  | 'spam'
  | 'wash-trading'
  | 'dust-attack'
  | 'social-engineering'

export type FraudSignalSource =
  | 'deterministic'
  | 'behavioral'
  | 'graph'
  | 'intelligence'
  | 'nlp'
  | 'ml-ensemble'

export type FraudAlertStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'false-positive'

export interface FraudAccount {
  address: string
  firstSeen: string
  transactionCount: number
  trusted: boolean
  labels: string[]
  riskScore?: number
  regionHint?: string
}

export interface FraudTransaction {
  id: string
  source: string
  destination: string
  amount: number
  asset: string
  timestamp: string
  operation: 'payment' | 'change-trust' | 'set-options' | 'invoke' | 'path-payment' | 'create-account'
  memo?: string
  signerCount: number
  fee?: number
  successful?: boolean
}

export interface FraudSignal {
  id: string
  ruleId: string
  category: FraudCategory
  severity: FraudSeverity
  title: string
  explanation: string
  evidence: string[]
  score: number
  confidence: number
  source: FraudSignalSource
  privacySafe: boolean
}

export interface FraudRiskAssessment {
  subject: string
  subjectType: 'transaction' | 'account'
  score: number
  confidence: number
  severity: FraudSeverity
  decision: FraudDecision
  signals: FraudSignal[]
  assessedAt: string
  modelVersion: string
  latencyMs: number
  relatedAddresses: string[]
}

export interface ThreatIntelEntry {
  address: string
  label: string
  category: FraudCategory
  confidence: number
  source: string
  lastUpdated: string
  revoked: boolean
  tags?: string[]
}

export interface BehavioralProfile {
  address: string
  baselineTxPerDay: number
  observedTxPerDay: number
  typicalAssets: string[]
  unusualHoursShare: number
  deviceDiversity: number
  anomalyScore: number
  windowHours: number
  notes: string[]
}

export interface FraudGraphNode {
  id: string
  label: string
  risk: FraudSeverity
  kind: 'account' | 'cluster' | 'service'
}

export interface FraudGraphEdge {
  from: string
  to: string
  weight: number
  reason: string
}

export interface FraudAlert {
  id: string
  assessmentId: string
  title: string
  category: FraudCategory
  severity: FraudSeverity
  status: FraudAlertStatus
  createdAt: string
  updatedAt: string
  summary: string
  recommendedAction: string
}

export interface PreventionAction {
  id: string
  title: string
  description: string
  automated: boolean
  severity: FraudSeverity
  appliesTo: string
}

export interface EducationTip {
  id: string
  title: string
  body: string
  category: FraudCategory | 'general'
  severity: FraudSeverity
}

export interface FraudModelCard {
  id: string
  name: string
  kind: 'rules' | 'supervised' | 'unsupervised' | 'graph' | 'nlp' | 'ensemble'
  version: string
  accuracyEstimate: number
  falsePositiveEstimate: number
  latencyBudgetMs: number
  trainedOn: string
  notes: string
}

export interface FraudPerformanceMetrics {
  detectionAccuracy: number
  falsePositiveRate: number
  meanLatencyMs: number
  p95LatencyMs: number
  throughputTxPerSec: number
  intelAddressCount: number
  alertResponseMs: number
  evaluatedSamples: number
}

export interface FraudSummary {
  openAlerts: number
  highRiskCount: number
  averageRisk: number
  blockedAddresses: number
  monitoredTransactions: number
  modelVersion: string
  dataFreshnessSeconds: number
}

export interface FraudSnapshot {
  generatedAt: string
  state: FraudDataState
  network: string
  summary: FraudSummary
  assessments: FraudRiskAssessment[]
  accounts: FraudAccount[]
  transactions: FraudTransaction[]
  threatIntel: ThreatIntelEntry[]
  profiles: BehavioralProfile[]
  alerts: FraudAlert[]
  graph: { nodes: FraudGraphNode[]; edges: FraudGraphEdge[] }
  prevention: PreventionAction[]
  education: EducationTip[]
  models: FraudModelCard[]
  metrics: FraudPerformanceMetrics
  caveats: string[]
  methodologyVersion: string
}

export interface FraudPreferences {
  refreshIntervalMs: number
  minimumSeverity: FraudSeverity
  autoRefresh: boolean
  includeLowConfidence: boolean
  alertSound: boolean
}

export interface FraudApiError {
  code: 'timeout' | 'unavailable' | 'invalid-response' | 'rate-limited' | 'aborted'
  message: string
  retryable: boolean
  requestId?: string
}

export interface FraudSnapshotResponse {
  data: FraudSnapshot
  requestId: string
  cached: boolean
}

export interface FraudAssessRequest {
  transaction: FraudTransaction
  history?: FraudTransaction[]
  intel?: ThreatIntelEntry[]
}
