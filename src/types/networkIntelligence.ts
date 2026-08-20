export type HealthState = 'healthy' | 'degraded' | 'critical' | 'unknown'
export type Severity = 'info' | 'warning' | 'critical'
export type MetricSource = 'horizon' | 'soroban-rpc' | 'validator' | 'synthetic'
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved'
export type AlertStatus = 'active' | 'acknowledged' | 'resolved'

export interface MetricSample {
  id: string
  source: MetricSource
  timestamp: string
  ledgerSequence: number
  closeTimeSeconds: number
  operationsPerSecond: number
  transactionsPerSecond: number
  transactionSuccessRate: number
  transactionLatencyMs: number
  capacityUtilization: number
  validatorParticipation: number
  synchronizedValidators: number
  totalValidators: number
  horizonLatencyMs: number
  sorobanLatencyMs: number
}

export interface MetricSeriesPoint {
  timestamp: string
  closeTimeSeconds: number
  throughput: number
  successRate: number
  utilization: number
  participation: number
}

export interface ValidatorHealth {
  id: string
  name: string
  organization: string
  region: string
  status: HealthState
  participation: number
  latencyMs: number | null
  ledgerLag: number
  protocolVersion: number
  uptime30d: number
  anomalyScore: number
  lastSeenAt: string
  finding?: string
}

export interface HealthDimension {
  id: 'consensus' | 'performance' | 'reliability' | 'capacity' | 'data-consistency'
  label: string
  score: number
  state: HealthState
  weight: number
  summary: string
}

export interface NetworkHealthAssessment {
  score: number
  state: HealthState
  dimensions: HealthDimension[]
  assessedAt: string
  dataFreshnessSeconds: number
  confidence: number
}

export interface ForecastPoint {
  timestamp: string
  expected: number
  lowerBound: number
  upperBound: number
}

export interface CongestionForecast {
  generatedAt: string
  horizonMinutes: number
  warningLeadMinutes: number
  peakUtilization: number
  congestionProbability: number
  confidence: number
  modelVersion: string
  points: ForecastPoint[]
  drivers: string[]
}

export type AnomalyKind =
  | 'latency-spike'
  | 'participation-drop'
  | 'throughput-shift'
  | 'synchronization-drift'
  | 'spam-pattern'
  | 'rpc-degradation'

export interface NetworkAnomaly {
  id: string
  kind: AnomalyKind
  severity: Severity
  title: string
  description: string
  source: MetricSource
  metric: string
  observedValue: number
  expectedValue: number
  deviationScore: number
  detectedAt: string
  affectedNodes: string[]
  evidence: string[]
}

export interface RootCause {
  category: string
  summary: string
  confidence: number
  evidence: string[]
  suggestedActions: string[]
}

export interface IncidentEvent {
  id: string
  timestamp: string
  title: string
  detail: string
  kind: 'detected' | 'alerted' | 'diagnosed' | 'mitigated' | 'resolved'
}

export interface NetworkIncident {
  id: string
  title: string
  severity: Severity
  status: IncidentStatus
  startedAt: string
  resolvedAt?: string
  affectedServices: string[]
  rootCause: RootCause
  timeline: IncidentEvent[]
  meanTimeToResolutionMinutes?: number
}

export interface IntelligentAlert {
  id: string
  fingerprint: string
  title: string
  message: string
  severity: Severity
  status: AlertStatus
  createdAt: string
  updatedAt: string
  occurrences: number
  warningLeadMinutes?: number
  affectedComponents: string[]
  recommendation: string
}

export interface CapacityScenario {
  trafficGrowthPercent: number
  validatorLossPercent: number
  sorobanGrowthPercent: number
  targetUtilizationPercent: number
}

export interface CapacityPlan {
  scenario: CapacityScenario
  projectedUtilization: number
  projectedThroughput: number
  headroomPercent: number
  requiredValidatorCapacity: number
  risk: HealthState
  timeToCapacityDays: number | null
  recommendations: string[]
}

export interface SlaObjective {
  id: string
  name: string
  target: number
  actual: number
  unit: '%' | 'ms' | 'seconds'
  met: boolean
  errorBudgetRemaining: number
}

export interface ServiceStatus {
  id: string
  label: string
  source: MetricSource
  state: HealthState
  latencyMs: number | null
  lastSuccessfulAt?: string
  error?: string
}

export interface NetworkIntelligenceSnapshot {
  network: string
  generatedAt: string
  health: NetworkHealthAssessment
  current: MetricSample
  history: MetricSeriesPoint[]
  services: ServiceStatus[]
  validators: ValidatorHealth[]
  forecast: CongestionForecast
  anomalies: NetworkAnomaly[]
  incidents: NetworkIncident[]
  alerts: IntelligentAlert[]
  slos: SlaObjective[]
  collectionRate: number
  retentionDays: number
}

export interface MonitoringPreferences {
  refreshIntervalMs: number
  minimumSeverity: Severity
  autoRefresh: boolean
  compactView: boolean
}

export interface MonitoringApiError {
  code: 'timeout' | 'unavailable' | 'invalid-response' | 'rate-limited' | 'aborted'
  message: string
  retryable: boolean
  requestId?: string
}

export interface SnapshotResponse {
  data: NetworkIntelligenceSnapshot
  requestId: string
  cached: boolean
}
