import { describe, expect, it } from 'vitest'
import type { CapacityScenario, MetricSeriesPoint } from '../../types/networkIntelligence'
import {
  assessNetworkHealth,
  buildIncident,
  calculateSlos,
  detectNetworkAnomalies,
  diagnoseRootCause,
  forecastCongestion,
  groupAlerts,
  healthState,
  linearRegression,
  mean,
  planCapacity,
  standardDeviation,
} from './analysis'
import {
  createDemoHistory,
  createDemoServices,
  createDemoValidators,
  currentFromHistory,
  ledgersToMetricHistory,
} from './fixtures'

const NOW = new Date('2026-08-20T12:00:00.000Z')

describe('network intelligence statistics', () => {
  it('calculates common descriptive values', () => {
    expect(mean([])).toBe(0)
    expect(mean([2, 4, 6])).toBe(4)
    expect(standardDeviation([5])).toBe(0)
    expect(standardDeviation([2, 2, 2])).toBe(0)
    expect(standardDeviation([1, 2, 3])).toBeCloseTo(0.816, 2)
  })

  it('calculates a stable linear regression', () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0 })
    expect(linearRegression([8])).toEqual({ slope: 0, intercept: 8 })
    expect(linearRegression([2, 4, 6, 8])).toEqual({ slope: 2, intercept: 2 })
  })

  it('classifies score boundaries', () => {
    expect(healthState(Number.NaN)).toBe('unknown')
    expect(healthState(59.9)).toBe('critical')
    expect(healthState(60)).toBe('degraded')
    expect(healthState(84.9)).toBe('degraded')
    expect(healthState(85)).toBe('healthy')
  })
})

describe('health assessment', () => {
  it('weights five independent health dimensions', () => {
    const history = createDemoHistory(NOW)
    const validators = createDemoValidators(NOW)
    const current = currentFromHistory(history, validators, createDemoServices(NOW))
    const assessment = assessNetworkHealth(current, validators, NOW)

    expect(assessment.dimensions.map((item) => item.id)).toEqual([
      'consensus',
      'performance',
      'reliability',
      'capacity',
      'data-consistency',
    ])
    expect(assessment.dimensions.reduce((total, item) => total + item.weight, 0)).toBeCloseTo(1)
    expect(assessment.score).toBeGreaterThan(80)
    expect(assessment.state).toBe('healthy')
    expect(assessment.confidence).toBeGreaterThanOrEqual(85)
    expect(assessment.dataFreshnessSeconds).toBe(0)
  })

  it('marks consensus and consistency down when validators lag', () => {
    const history = createDemoHistory(NOW, 36, true)
    const validators = createDemoValidators(NOW, true)
    const current = currentFromHistory(history, validators, createDemoServices(NOW, true))
    const assessment = assessNetworkHealth(current, validators, NOW)
    const consensus = assessment.dimensions.find((item) => item.id === 'consensus')!
    const consistency = assessment.dimensions.find((item) => item.id === 'data-consistency')!

    expect(consensus.score).toBeLessThan(95)
    expect(consistency.score).toBeLessThan(90)
    expect(assessment.score).toBeLessThan(95)
  })

  it('does not produce negative dimension scores from extreme samples', () => {
    const history = createDemoHistory(NOW)
    const validators = createDemoValidators(NOW, true).map((item) => ({ ...item, ledgerLag: 50 }))
    const current = {
      ...currentFromHistory(history, validators, createDemoServices(NOW, true)),
      closeTimeSeconds: 300,
      capacityUtilization: 100,
      transactionLatencyMs: 500_000,
    }
    const assessment = assessNetworkHealth(current, validators, NOW)
    expect(assessment.dimensions.every((item) => item.score >= 0 && item.score <= 100)).toBe(true)
    expect(assessment.state).toBe('critical')
  })
})

describe('congestion forecasting', () => {
  it('creates a complete forecast horizon with confidence bounds', () => {
    const forecast = forecastCongestion(createDemoHistory(NOW), 60, 5, NOW)
    expect(forecast.points).toHaveLength(12)
    expect(forecast.points[0].timestamp).toBe('2026-08-20T12:05:00.000Z')
    expect(forecast.points.every((point) => point.lowerBound <= point.expected)).toBe(true)
    expect(forecast.points.every((point) => point.upperBound >= point.expected)).toBe(true)
    expect(forecast.confidence).toBeGreaterThan(75)
    expect(forecast.modelVersion).toBe('robust-linear-v1')
  })

  it('warns ahead of steadily growing capacity demand', () => {
    const history: MetricSeriesPoint[] = Array.from({ length: 24 }, (_, index) => ({
      timestamp: new Date(NOW.getTime() - (23 - index) * 300_000).toISOString(),
      closeTimeSeconds: 5,
      throughput: 100 + index * 2,
      successRate: 99.9,
      utilization: 45 + index * 1.5,
      participation: 99,
    }))
    const forecast = forecastCongestion(history, 60, 5, NOW)
    expect(forecast.warningLeadMinutes).toBeLessThanOrEqual(30)
    expect(forecast.congestionProbability).toBeGreaterThan(65)
    expect(forecast.drivers).toContain('Sustained transaction demand growth')
  })

  it('handles an empty history without invalid values', () => {
    const forecast = forecastCongestion([], 30, 5, NOW)
    expect(forecast.points).toHaveLength(6)
    expect(forecast.points.every((point) => Number.isFinite(point.expected))).toBe(true)
    expect(forecast.warningLeadMinutes).toBe(30)
  })
})

describe('anomaly detection and diagnosis', () => {
  it('returns no anomaly before enough baseline points exist', () => {
    const history = createDemoHistory(NOW, 4)
    const validators = createDemoValidators(NOW)
    const current = currentFromHistory(history, validators, createDemoServices(NOW))
    expect(detectNetworkAnomalies(current, history, validators, NOW)).toEqual([])
  })

  it('detects correlated latency, throughput, synchronization, and RPC signals', () => {
    const history = createDemoHistory(NOW, 30)
    const validators = createDemoValidators(NOW, true)
    const services = createDemoServices(NOW, true)
    const current = {
      ...currentFromHistory(history, validators, services),
      closeTimeSeconds: 13,
      operationsPerSecond: 500,
      capacityUtilization: 94,
      validatorParticipation: 72,
      sorobanLatencyMs: 2_200,
    }
    const anomalies = detectNetworkAnomalies(current, history, validators, NOW)
    const kinds = anomalies.map((item) => item.kind)

    expect(kinds).toContain('latency-spike')
    expect(kinds).toContain('throughput-shift')
    expect(kinds).toContain('participation-drop')
    expect(kinds).toContain('synchronization-drift')
    expect(kinds).toContain('rpc-degradation')
    expect(anomalies[0].severity).toBe('critical')
    expect(anomalies.every((item) => item.evidence.length > 0)).toBe(true)
  })

  it('diagnoses validator synchronization failures from correlated signals', () => {
    const history = createDemoHistory(NOW, 30)
    const validators = createDemoValidators(NOW, true)
    const current = {
      ...currentFromHistory(history, validators, createDemoServices(NOW)),
      validatorParticipation: 70,
    }
    const anomalies = detectNetworkAnomalies(current, history, validators, NOW)
    const diagnosis = diagnoseRootCause(anomalies)
    expect(diagnosis.category).toBe('Validator synchronization failure')
    expect(diagnosis.confidence).toBeGreaterThanOrEqual(90)
    expect(diagnosis.suggestedActions.length).toBeGreaterThanOrEqual(3)
  })

  it('returns a healthy diagnosis for no signals', () => {
    expect(diagnoseRootCause([])).toEqual(expect.objectContaining({
      category: 'No active incident',
      confidence: 100,
    }))
  })
})

describe('alerts and incidents', () => {
  it('groups duplicate alerts and preserves acknowledgement', () => {
    const history = createDemoHistory(NOW, 30)
    const validators = createDemoValidators(NOW, true)
    const current = { ...currentFromHistory(history, validators, createDemoServices(NOW)), validatorParticipation: 70 }
    const anomalies = detectNetworkAnomalies(current, history, validators, NOW)
    const forecast = forecastCongestion(history, 60, 5, NOW)
    const first = groupAlerts(anomalies, forecast, [], NOW)
    const acknowledged = first.map((alert, index) => index === 0 ? { ...alert, status: 'acknowledged' as const } : alert)
    const second = groupAlerts(anomalies, forecast, acknowledged, new Date(NOW.getTime() + 60_000))

    expect(second).toHaveLength(first.length)
    expect(second.find((alert) => alert.id === first[0].id)?.occurrences).toBe(2)
    expect(second.find((alert) => alert.id === first[0].id)?.status).toBe('acknowledged')
  })

  it('adds a predictive alert when forecast risk is high', () => {
    const history: MetricSeriesPoint[] = Array.from({ length: 24 }, (_, index) => ({
      timestamp: new Date(NOW.getTime() - (23 - index) * 300_000).toISOString(),
      closeTimeSeconds: 5,
      throughput: 100 + index * 4,
      successRate: 99.9,
      utilization: 50 + index * 1.8,
      participation: 99,
    }))
    const alerts = groupAlerts([], forecastCongestion(history, 60, 5, NOW), [], NOW)
    expect(alerts).toContainEqual(expect.objectContaining({
      fingerprint: 'forecast:network:congestion',
      warningLeadMinutes: expect.any(Number),
    }))
  })

  it('builds an incident timeline and root cause', () => {
    const history = createDemoHistory(NOW, 30)
    const validators = createDemoValidators(NOW, true)
    const current = { ...currentFromHistory(history, validators, createDemoServices(NOW)), validatorParticipation: 70 }
    const incident = buildIncident(detectNetworkAnomalies(current, history, validators, NOW), NOW)
    expect(incident).not.toBeNull()
    expect(incident?.status).toBe('identified')
    expect(incident?.timeline.map((item) => item.kind)).toEqual(['detected', 'diagnosed'])
    expect(incident?.affectedServices.length).toBeGreaterThan(0)
  })

  it('does not create an incident without anomalies', () => {
    expect(buildIncident([], NOW)).toBeNull()
  })
})

describe('capacity planning and SLOs', () => {
  const history = createDemoHistory(NOW)
  const validators = createDemoValidators(NOW)
  const current = currentFromHistory(history, validators, createDemoServices(NOW))

  it('projects demand, headroom, and validator equivalents', () => {
    const scenario: CapacityScenario = {
      trafficGrowthPercent: 100,
      sorobanGrowthPercent: 150,
      validatorLossPercent: 25,
      targetUtilizationPercent: 70,
    }
    const plan = planCapacity(current, scenario)
    expect(plan.projectedUtilization).toBeGreaterThan(current.capacityUtilization)
    expect(plan.projectedThroughput).toBeGreaterThan(current.operationsPerSecond)
    expect(plan.requiredValidatorCapacity).toBeGreaterThanOrEqual(current.totalValidators)
    expect(plan.recommendations).toContain('Scale Soroban RPC simulation workers and ledger-entry cache independently')
    expect(plan.recommendations).toContain('Validate quorum resilience and regional failover before applying this scenario')
  })

  it('reports safe headroom for a no-growth scenario', () => {
    const plan = planCapacity(current, {
      trafficGrowthPercent: 0,
      sorobanGrowthPercent: 0,
      validatorLossPercent: 0,
      targetUtilizationPercent: 80,
    })
    expect(plan.headroomPercent).toBeGreaterThan(0)
    expect(plan.timeToCapacityDays).toBeNull()
    expect(plan.recommendations).toEqual(['Current capacity satisfies this scenario with the configured safety margin'])
  })

  it('computes SLO attainment without values leaving valid bounds', () => {
    const slos = calculateSlos(history, current)
    expect(slos).toHaveLength(3)
    expect(slos.every((slo) => slo.errorBudgetRemaining >= 0 && slo.errorBudgetRemaining <= 100)).toBe(true)
    expect(slos.find((slo) => slo.id === 'transaction-success')?.met).toBe(true)
  })
})

describe('Horizon ledger normalization', () => {
  it('sorts ledger records and derives rates from close intervals', () => {
    const history = ledgersToMetricHistory([
      { sequence: 2, closed_at: '2026-08-20T12:00:05Z', successful_transaction_count: 9, failed_transaction_count: 1, operation_count: 50 },
      { sequence: 1, closed_at: '2026-08-20T12:00:00Z', successful_transaction_count: 10, failed_transaction_count: 0, operation_count: 40 },
    ])
    expect(history).toHaveLength(2)
    expect(history[0].timestamp).toBe('2026-08-20T12:00:00Z')
    expect(history[1]).toEqual(expect.objectContaining({
      closeTimeSeconds: 5,
      throughput: 10,
      successRate: 90,
      utilization: 5,
    }))
  })

  it('handles empty records', () => {
    expect(ledgersToMetricHistory([])).toEqual([])
  })
})
