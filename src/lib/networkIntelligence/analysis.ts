import type {
  CapacityPlan,
  CapacityScenario,
  CongestionForecast,
  HealthDimension,
  HealthState,
  IntelligentAlert,
  MetricSample,
  MetricSeriesPoint,
  NetworkAnomaly,
  NetworkHealthAssessment,
  NetworkIncident,
  RootCause,
  Severity,
  SlaObjective,
  ValidatorHealth,
} from '../../types/networkIntelligence'

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value))

const round = (value: number, digits = 1): number => {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

export function healthState(score: number): HealthState {
  if (!Number.isFinite(score)) return 'unknown'
  if (score >= 85) return 'healthy'
  if (score >= 60) return 'degraded'
  return 'critical'
}

export function severityRank(severity: Severity): number {
  return severity === 'critical' ? 3 : severity === 'warning' ? 2 : 1
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)))
}

export function linearRegression(values: number[]): { slope: number; intercept: number } {
  if (values.length < 2) return { slope: 0, intercept: values[0] ?? 0 }
  const xMean = (values.length - 1) / 2
  const yMean = mean(values)
  let numerator = 0
  let denominator = 0
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean)
    denominator += (index - xMean) ** 2
  })
  const slope = denominator === 0 ? 0 : numerator / denominator
  return { slope, intercept: yMean - slope * xMean }
}

function dimension(
  id: HealthDimension['id'],
  label: string,
  score: number,
  weight: number,
  summary: string,
): HealthDimension {
  const normalizedScore = round(clamp(score))
  return {
    id,
    label,
    score: normalizedScore,
    state: healthState(normalizedScore),
    weight,
    summary,
  }
}

export function assessNetworkHealth(
  sample: MetricSample,
  validators: ValidatorHealth[],
  now = new Date(),
): NetworkHealthAssessment {
  const validatorUptime = mean(validators.map((validator) => validator.uptime30d))
  const meanLedgerLag = mean(validators.map((validator) => validator.ledgerLag))
  const degradedServices = [sample.horizonLatencyMs, sample.sorobanLatencyMs].filter(
    (latency) => latency > 1_000,
  ).length

  const dimensions: HealthDimension[] = [
    dimension(
      'consensus',
      'Consensus',
      sample.validatorParticipation - meanLedgerLag * 4,
      0.3,
      `${sample.synchronizedValidators}/${sample.totalValidators} validators synchronized`,
    ),
    dimension(
      'performance',
      'Performance',
      100 - Math.max(0, sample.closeTimeSeconds - 5) * 9 - sample.transactionLatencyMs / 120,
      0.2,
      `${sample.closeTimeSeconds.toFixed(1)}s ledger close · ${sample.transactionLatencyMs}ms transaction latency`,
    ),
    dimension(
      'reliability',
      'Reliability',
      sample.transactionSuccessRate * 0.72 + validatorUptime * 0.28,
      0.2,
      `${sample.transactionSuccessRate.toFixed(2)}% transaction success rate`,
    ),
    dimension(
      'capacity',
      'Capacity',
      100 - Math.max(0, sample.capacityUtilization - 55) * 1.5,
      0.15,
      `${sample.capacityUtilization.toFixed(1)}% of observed operation capacity`,
    ),
    dimension(
      'data-consistency',
      'Data consistency',
      100 - meanLedgerLag * 18 - degradedServices * 12,
      0.15,
      meanLedgerLag < 0.2 ? 'Cross-node ledgers agree' : `Mean validator lag is ${meanLedgerLag.toFixed(1)} ledgers`,
    ),
  ]

  const score = round(
    dimensions.reduce((total, item) => total + item.score * item.weight, 0),
  )
  const observedAt = new Date(sample.timestamp).getTime()
  const freshness = Number.isFinite(observedAt)
    ? Math.max(0, Math.round((now.getTime() - observedAt) / 1_000))
    : 0
  const completeValidators = validators.filter((validator) => validator.latencyMs !== null).length
  const confidence = round(
    clamp(70 + Math.min(validators.length, 20) + (completeValidators / Math.max(validators.length, 1)) * 10),
  )

  return {
    score,
    state: healthState(score),
    dimensions,
    assessedAt: now.toISOString(),
    dataFreshnessSeconds: freshness,
    confidence,
  }
}

export function forecastCongestion(
  history: MetricSeriesPoint[],
  horizonMinutes = 60,
  intervalMinutes = 5,
  now = new Date(),
): CongestionForecast {
  const utilization = history.slice(-24).map((point) => point.utilization)
  const { slope, intercept } = linearRegression(utilization)
  const noise = standardDeviation(utilization)
  const pointCount = Math.max(1, Math.ceil(horizonMinutes / intervalMinutes))
  const points = Array.from({ length: pointCount }, (_, index) => {
    const modelIndex = utilization.length + index
    const expected = clamp(intercept + slope * modelIndex)
    return {
      timestamp: new Date(now.getTime() + (index + 1) * intervalMinutes * 60_000).toISOString(),
      expected: round(expected),
      lowerBound: round(clamp(expected - noise * 1.64)),
      upperBound: round(clamp(expected + noise * 1.64)),
    }
  })

  const firstCongestedIndex = points.findIndex((point) => point.upperBound >= 80)
  const warningLeadMinutes =
    firstCongestedIndex === -1 ? horizonMinutes : (firstCongestedIndex + 1) * intervalMinutes
  const peakUtilization = Math.max(...points.map((point) => point.expected))
  const projectedUpperPeak = Math.max(...points.map((point) => point.upperBound))
  const congestionProbability = clamp(
    (projectedUpperPeak - 55) * 2 + Math.max(0, slope) * 8,
  )

  const drivers: string[] = []
  if (slope > 1) drivers.push('Sustained transaction demand growth')
  if (noise > 8) drivers.push('High short-term utilization volatility')
  const recentThroughput = history.slice(-6).map((point) => point.throughput)
  if (recentThroughput.length > 1 && linearRegression(recentThroughput).slope > 0.5) {
    drivers.push('Operation throughput is accelerating')
  }
  if (drivers.length === 0) drivers.push('Current traffic remains inside normal operating range')

  return {
    generatedAt: now.toISOString(),
    horizonMinutes,
    warningLeadMinutes,
    peakUtilization: round(peakUtilization),
    congestionProbability: round(congestionProbability),
    confidence: round(clamp(94 - noise * 1.2 - Math.max(0, 12 - utilization.length))),
    modelVersion: 'robust-linear-v1',
    points,
    drivers,
  }
}

function anomaly(
  partial: Omit<NetworkAnomaly, 'id' | 'detectedAt'>,
  now: Date,
): NetworkAnomaly {
  const fingerprint = `${partial.kind}-${partial.metric}-${partial.affectedNodes.join('-')}`
  return {
    ...partial,
    id: `anomaly-${fingerprint}`,
    detectedAt: now.toISOString(),
  }
}

export function detectNetworkAnomalies(
  current: MetricSample,
  history: MetricSeriesPoint[],
  validators: ValidatorHealth[],
  now = new Date(),
): NetworkAnomaly[] {
  const baseline = history.slice(0, -1).slice(-24)
  if (baseline.length < 4) return []
  const anomalies: NetworkAnomaly[] = []

  const evaluate = (
    observed: number,
    historical: number[],
    minimumDeviation: number,
  ): { expected: number; score: number; unusual: boolean } => {
    const expected = mean(historical)
    const deviation = standardDeviation(historical)
    const score = deviation < 0.01 ? Math.abs(observed - expected) / minimumDeviation : Math.abs(observed - expected) / deviation
    return { expected, score, unusual: score >= 2.5 && Math.abs(observed - expected) >= minimumDeviation }
  }

  const latency = evaluate(
    current.closeTimeSeconds,
    baseline.map((point) => point.closeTimeSeconds),
    1.5,
  )
  if (latency.unusual && current.closeTimeSeconds > latency.expected) {
    anomalies.push(anomaly({
      kind: 'latency-spike',
      severity: current.closeTimeSeconds >= 10 ? 'critical' : 'warning',
      title: 'Ledger close latency outside baseline',
      description: `Ledger close time is ${round(current.closeTimeSeconds - latency.expected)}s above its rolling baseline.`,
      source: 'horizon',
      metric: 'ledger_close_seconds',
      observedValue: current.closeTimeSeconds,
      expectedValue: round(latency.expected),
      deviationScore: round(latency.score, 2),
      affectedNodes: [],
      evidence: ['Robust z-score exceeds 2.5', 'Observed close time is above the absolute latency guardrail'],
    }, now))
  }

  const participation = evaluate(
    current.validatorParticipation,
    baseline.map((point) => point.participation),
    2,
  )
  if (participation.unusual && current.validatorParticipation < participation.expected) {
    const affectedNodes = validators
      .filter((validator) => validator.status !== 'healthy' || validator.ledgerLag > 0)
      .map((validator) => validator.name)
    anomalies.push(anomaly({
      kind: 'participation-drop',
      severity: current.validatorParticipation < 80 ? 'critical' : 'warning',
      title: 'Validator participation has dropped',
      description: `${round(participation.expected - current.validatorParticipation)} percentage points below baseline.`,
      source: 'validator',
      metric: 'validator_participation_percent',
      observedValue: current.validatorParticipation,
      expectedValue: round(participation.expected),
      deviationScore: round(participation.score, 2),
      affectedNodes,
      evidence: [`${current.synchronizedValidators}/${current.totalValidators} validators synchronized`],
    }, now))
  }

  const throughput = evaluate(
    current.operationsPerSecond,
    baseline.map((point) => point.throughput),
    25,
  )
  if (throughput.unusual) {
    anomalies.push(anomaly({
      kind: 'throughput-shift',
      severity: current.capacityUtilization > 85 ? 'critical' : 'warning',
      title: 'Unusual operation throughput pattern',
      description: `Operation rate deviated ${round(throughput.score, 2)}σ from the rolling baseline.`,
      source: 'horizon',
      metric: 'operations_per_second',
      observedValue: current.operationsPerSecond,
      expectedValue: round(throughput.expected),
      deviationScore: round(throughput.score, 2),
      affectedNodes: [],
      evidence: [`Capacity utilization is ${current.capacityUtilization.toFixed(1)}%`],
    }, now))
  }

  const lagging = validators.filter((validator) => validator.ledgerLag >= 2)
  if (lagging.length > 0) {
    anomalies.push(anomaly({
      kind: 'synchronization-drift',
      severity: lagging.length >= Math.ceil(validators.length / 3) ? 'critical' : 'warning',
      title: 'Cross-node synchronization drift',
      description: `${lagging.length} monitored validator${lagging.length === 1 ? '' : 's'} lag the latest ledger.`,
      source: 'validator',
      metric: 'validator_ledger_lag',
      observedValue: Math.max(...lagging.map((validator) => validator.ledgerLag)),
      expectedValue: 0,
      deviationScore: round(mean(lagging.map((validator) => validator.anomalyScore)), 2),
      affectedNodes: lagging.map((validator) => validator.name),
      evidence: lagging.map((validator) => `${validator.name}: ${validator.ledgerLag} ledgers behind`),
    }, now))
  }

  if (current.horizonLatencyMs > 1_500 || current.sorobanLatencyMs > 1_500) {
    const source = current.sorobanLatencyMs > current.horizonLatencyMs ? 'soroban-rpc' : 'horizon'
    const observed = Math.max(current.horizonLatencyMs, current.sorobanLatencyMs)
    anomalies.push(anomaly({
      kind: 'rpc-degradation',
      severity: observed > 3_000 ? 'critical' : 'warning',
      title: `${source === 'horizon' ? 'Horizon' : 'Soroban RPC'} response degradation`,
      description: `Observed API latency reached ${observed}ms.`,
      source,
      metric: 'rpc_latency_ms',
      observedValue: observed,
      expectedValue: 500,
      deviationScore: round(observed / 500, 2),
      affectedNodes: [source],
      evidence: ['Endpoint latency exceeded the 1.5 second operational guardrail'],
    }, now))
  }

  return anomalies.sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
}

export function diagnoseRootCause(anomalies: NetworkAnomaly[]): RootCause {
  if (anomalies.length === 0) {
    return {
      category: 'No active incident',
      summary: 'No correlated anomalous signals require diagnosis.',
      confidence: 100,
      evidence: [],
      suggestedActions: ['Continue normal monitoring'],
    }
  }

  const kinds = new Set(anomalies.map((item) => item.kind))
  if (kinds.has('participation-drop') && kinds.has('synchronization-drift')) {
    return {
      category: 'Validator synchronization failure',
      summary: 'Consensus participation loss correlates with validators falling behind the network ledger.',
      confidence: 92,
      evidence: anomalies.flatMap((item) => item.evidence).slice(0, 6),
      suggestedActions: [
        'Inspect affected validators for disk, peer, and overlay connectivity saturation',
        'Compare quorum set reachability before restarting nodes',
        'Fail traffic over to synchronized validator infrastructure',
      ],
    }
  }

  if (kinds.has('throughput-shift') && kinds.has('latency-spike')) {
    return {
      category: 'Network capacity pressure',
      summary: 'A throughput surge is increasing ledger close time and consuming available operation capacity.',
      confidence: 88,
      evidence: anomalies.flatMap((item) => item.evidence).slice(0, 6),
      suggestedActions: [
        'Apply submission rate limits to non-critical transaction sources',
        'Increase Horizon and RPC worker capacity',
        'Review fee distribution for spam-like transaction bursts',
      ],
    }
  }

  const primary = anomalies[0]
  return {
    category: primary.kind.replace(/-/g, ' '),
    summary: primary.description,
    confidence: round(clamp(65 + primary.deviationScore * 5)),
    evidence: primary.evidence,
    suggestedActions: [
      `Inspect ${primary.source} telemetry around ${primary.detectedAt}`,
      primary.affectedNodes.length ? `Validate ${primary.affectedNodes.join(', ')}` : 'Compare the signal with peer nodes',
      'Monitor the signal through the next three ledger closes',
    ],
  }
}

export function groupAlerts(
  anomalies: NetworkAnomaly[],
  forecast: CongestionForecast,
  existing: IntelligentAlert[] = [],
  now = new Date(),
): IntelligentAlert[] {
  const candidates: IntelligentAlert[] = anomalies.map((item) => ({
    id: `alert-${item.id}`,
    fingerprint: `${item.kind}:${item.source}:${item.affectedNodes.sort().join(',')}`,
    title: item.title,
    message: item.description,
    severity: item.severity,
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    occurrences: 1,
    affectedComponents: item.affectedNodes.length ? item.affectedNodes : [item.source],
    recommendation: diagnoseRootCause([item]).suggestedActions[0],
  }))

  if (forecast.congestionProbability >= 65) {
    candidates.push({
      id: 'alert-predicted-congestion',
      fingerprint: 'forecast:network:congestion',
      title: 'Network congestion predicted',
      message: `${forecast.congestionProbability}% probability of capacity pressure within ${forecast.warningLeadMinutes} minutes.`,
      severity: forecast.congestionProbability >= 85 ? 'critical' : 'warning',
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      occurrences: 1,
      warningLeadMinutes: forecast.warningLeadMinutes,
      affectedComponents: ['Stellar network'],
      recommendation: 'Review the capacity scenario and prepare submission rate limits.',
    })
  }

  const merged = new Map(existing.map((alert) => [alert.fingerprint, alert]))
  candidates.forEach((candidate) => {
    const previous = merged.get(candidate.fingerprint)
    merged.set(candidate.fingerprint, previous
      ? {
          ...candidate,
          id: previous.id,
          createdAt: previous.createdAt,
          occurrences: previous.occurrences + 1,
          status: previous.status === 'resolved' ? 'active' : previous.status,
        }
      : candidate)
  })
  return [...merged.values()].sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
}

export function buildIncident(
  anomalies: NetworkAnomaly[],
  now = new Date(),
): NetworkIncident | null {
  if (anomalies.length === 0) return null
  const rootCause = diagnoseRootCause(anomalies)
  const severity: Severity = anomalies.some((item) => item.severity === 'critical') ? 'critical' : 'warning'
  const startedAt = anomalies
    .map((item) => new Date(item.detectedAt).getTime())
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0] ?? now.getTime()
  return {
    id: `incident-${new Date(startedAt).toISOString().slice(0, 16)}`,
    title: rootCause.category,
    severity,
    status: 'identified',
    startedAt: new Date(startedAt).toISOString(),
    affectedServices: [...new Set(anomalies.flatMap((item) =>
      item.affectedNodes.length ? item.affectedNodes : [item.source],
    ))],
    rootCause,
    timeline: [
      {
        id: 'detected',
        timestamp: new Date(startedAt).toISOString(),
        title: `${anomalies.length} correlated signal${anomalies.length === 1 ? '' : 's'} detected`,
        detail: anomalies.map((item) => item.title).join('; '),
        kind: 'detected',
      },
      {
        id: 'diagnosed',
        timestamp: now.toISOString(),
        title: 'Probable root cause identified',
        detail: rootCause.summary,
        kind: 'diagnosed',
      },
    ],
  }
}

export function planCapacity(
  current: MetricSample,
  scenario: CapacityScenario,
): CapacityPlan {
  const trafficMultiplier = 1 + clamp(scenario.trafficGrowthPercent, 0, 500) / 100
  const sorobanMultiplier = 1 + clamp(scenario.sorobanGrowthPercent, 0, 500) / 100
  const remainingValidators = Math.max(0.25, 1 - clamp(scenario.validatorLossPercent, 0, 75) / 100)
  const weightedDemand = trafficMultiplier * 0.7 + sorobanMultiplier * 0.3
  const projectedUtilization = current.capacityUtilization * weightedDemand / remainingValidators
  const projectedThroughput = current.operationsPerSecond * weightedDemand
  const target = clamp(scenario.targetUtilizationPercent, 20, 95)
  const headroomPercent = target - projectedUtilization
  const requiredValidatorCapacity = Math.max(
    current.totalValidators,
    Math.ceil(current.totalValidators * projectedUtilization / target),
  )
  const dailyGrowth = scenario.trafficGrowthPercent / 365
  const timeToCapacityDays = dailyGrowth <= 0 || current.capacityUtilization >= target
    ? current.capacityUtilization >= target ? 0 : null
    : Math.max(0, Math.floor((target - current.capacityUtilization) / dailyGrowth))
  const recommendations: string[] = []
  if (headroomPercent < 0) {
    recommendations.push(`Provision capacity equivalent to ${requiredValidatorCapacity - current.totalValidators} additional validators`)
  }
  if (scenario.sorobanGrowthPercent >= 50) {
    recommendations.push('Scale Soroban RPC simulation workers and ledger-entry cache independently')
  }
  if (scenario.validatorLossPercent >= 20) {
    recommendations.push('Validate quorum resilience and regional failover before applying this scenario')
  }
  if (recommendations.length === 0) {
    recommendations.push('Current capacity satisfies this scenario with the configured safety margin')
  }

  return {
    scenario,
    projectedUtilization: round(projectedUtilization),
    projectedThroughput: round(projectedThroughput),
    headroomPercent: round(headroomPercent),
    requiredValidatorCapacity,
    risk: healthState(clamp(100 - Math.max(0, projectedUtilization - 50) * 2)),
    timeToCapacityDays,
    recommendations,
  }
}

export function calculateSlos(
  history: MetricSeriesPoint[],
  current: MetricSample,
): SlaObjective[] {
  const successRate = mean(history.map((point) => point.successRate)) || current.transactionSuccessRate
  const closeTime = mean(history.map((point) => point.closeTimeSeconds)) || current.closeTimeSeconds
  const availability = current.validatorParticipation
  return [
    {
      id: 'transaction-success',
      name: 'Transaction success',
      target: 99,
      actual: round(successRate, 2),
      unit: '%',
      met: successRate >= 99,
      errorBudgetRemaining: round(clamp((successRate - 99) / 1 * 100)),
    },
    {
      id: 'ledger-close',
      name: 'Ledger close p95',
      target: 7,
      actual: round(closeTime, 2),
      unit: 'seconds',
      met: closeTime <= 7,
      errorBudgetRemaining: round(clamp((7 - closeTime) / 2 * 100)),
    },
    {
      id: 'validator-availability',
      name: 'Validator participation',
      target: 95,
      actual: round(availability, 2),
      unit: '%',
      met: availability >= 95,
      errorBudgetRemaining: round(clamp((availability - 95) / 5 * 100)),
    },
  ]
}
