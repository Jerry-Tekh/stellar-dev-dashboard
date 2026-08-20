import type {
  MetricSample,
  MetricSeriesPoint,
  ServiceStatus,
  ValidatorHealth,
} from '../../types/networkIntelligence'

export interface HorizonLedgerRecord {
  id?: string
  sequence: number | string
  closed_at: string
  successful_transaction_count: number
  failed_transaction_count: number
  operation_count: number
  protocol_version?: number
}

export const MONITORED_VALIDATORS = [
  { id: 'sdf-us', name: 'SDF US', organization: 'Stellar Development Foundation', region: 'North America' },
  { id: 'sdf-eu', name: 'SDF EU', organization: 'Stellar Development Foundation', region: 'Europe' },
  { id: 'sdf-ap', name: 'SDF APAC', organization: 'Stellar Development Foundation', region: 'Asia Pacific' },
  { id: 'lobstr-eu', name: 'LOBSTR EU', organization: 'Ultra Stellar', region: 'Europe' },
  { id: 'public-node-us', name: 'Public Node US', organization: 'PublicNode', region: 'North America' },
  { id: 'satoshipay-eu', name: 'SatoshiPay EU', organization: 'SatoshiPay', region: 'Europe' },
] as const

const seededVariation = (seed: number, amplitude: number): number =>
  Math.sin(seed * 12.9898) * amplitude + Math.cos(seed * 4.1414) * amplitude * 0.35

export function createDemoHistory(
  now = new Date(),
  count = 36,
  incident = false,
): MetricSeriesPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const age = count - index - 1
    const incidentRamp = incident && index > count - 6 ? (index - (count - 6)) * 7 : 0
    const utilization = Math.max(8, Math.min(98, 42 + seededVariation(index, 5) + incidentRamp))
    return {
      timestamp: new Date(now.getTime() - age * 5 * 60_000).toISOString(),
      closeTimeSeconds: Number((5.1 + seededVariation(index, 0.28) + incidentRamp * 0.07).toFixed(2)),
      throughput: Number((118 + seededVariation(index, 14) + incidentRamp * 2.1).toFixed(1)),
      successRate: Number((99.42 - Math.max(0, incidentRamp - 14) * 0.08).toFixed(2)),
      utilization: Number(utilization.toFixed(1)),
      participation: Number((99.1 - (incident ? incidentRamp * 0.12 : 0)).toFixed(1)),
    }
  })
}

export function createDemoValidators(now = new Date(), incident = false): ValidatorHealth[] {
  return MONITORED_VALIDATORS.map((validator, index) => {
    const affected = incident && index === 4
    return {
      ...validator,
      status: affected ? 'critical' : index === 5 ? 'degraded' : 'healthy',
      participation: affected ? 42 : index === 5 ? 96.8 : Number((99.7 - index * 0.08).toFixed(2)),
      latencyMs: affected ? null : Math.round(38 + index * 11 + seededVariation(index, 4)),
      ledgerLag: affected ? 4 : index === 5 ? 1 : 0,
      protocolVersion: 22,
      uptime30d: affected ? 97.1 : Number((99.99 - index * 0.015).toFixed(3)),
      anomalyScore: affected ? 5.8 : index === 5 ? 1.8 : Number((0.2 + index * 0.08).toFixed(2)),
      lastSeenAt: new Date(now.getTime() - (affected ? 75_000 : index * 900)).toISOString(),
      finding: affected
        ? 'Node is four ledgers behind and has stopped reporting participation.'
        : index === 5
          ? 'Minor ledger lag; participation remains inside the SLO.'
          : undefined,
    }
  })
}

export function createDemoServices(now = new Date(), incident = false): ServiceStatus[] {
  return [
    {
      id: 'horizon',
      label: 'Horizon API',
      source: 'horizon',
      state: 'healthy',
      latencyMs: 124,
      lastSuccessfulAt: now.toISOString(),
    },
    {
      id: 'soroban',
      label: 'Soroban RPC',
      source: 'soroban-rpc',
      state: incident ? 'degraded' : 'healthy',
      latencyMs: incident ? 1_820 : 186,
      lastSuccessfulAt: now.toISOString(),
    },
    {
      id: 'validators',
      label: 'Validator telemetry',
      source: 'validator',
      state: incident ? 'degraded' : 'healthy',
      latencyMs: 208,
      lastSuccessfulAt: now.toISOString(),
    },
  ]
}

export function currentFromHistory(
  history: MetricSeriesPoint[],
  validators: ValidatorHealth[],
  services: ServiceStatus[],
  ledgerSequence = 56_000_000,
): MetricSample {
  const latest = history[history.length - 1] ?? createDemoHistory()[0]
  const synchronized = validators.filter((validator) => validator.ledgerLag === 0).length
  const horizon = services.find((service) => service.source === 'horizon')
  const soroban = services.find((service) => service.source === 'soroban-rpc')
  return {
    id: `ledger-${ledgerSequence}`,
    source: 'horizon',
    timestamp: latest.timestamp,
    ledgerSequence,
    closeTimeSeconds: latest.closeTimeSeconds,
    operationsPerSecond: latest.throughput,
    transactionsPerSecond: Number((latest.throughput * 0.39).toFixed(1)),
    transactionSuccessRate: latest.successRate,
    transactionLatencyMs: Math.round(latest.closeTimeSeconds * 155),
    capacityUtilization: latest.utilization,
    validatorParticipation: latest.participation,
    synchronizedValidators: synchronized,
    totalValidators: validators.length,
    horizonLatencyMs: horizon?.latencyMs ?? 0,
    sorobanLatencyMs: soroban?.latencyMs ?? 0,
  }
}

export function ledgersToMetricHistory(records: HorizonLedgerRecord[]): MetricSeriesPoint[] {
  if (records.length === 0) return []
  const chronological = [...records].sort(
    (left, right) => new Date(left.closed_at).getTime() - new Date(right.closed_at).getTime(),
  )
  return chronological.map((record, index) => {
    const previous = chronological[index - 1]
    const closeTime = previous
      ? Math.max(1, (new Date(record.closed_at).getTime() - new Date(previous.closed_at).getTime()) / 1_000)
      : 5
    const operations = Number(record.operation_count) || 0
    const successful = Number(record.successful_transaction_count) || 0
    const failed = Number(record.failed_transaction_count) || 0
    const transactionCount = successful + failed
    return {
      timestamp: record.closed_at,
      closeTimeSeconds: Number(closeTime.toFixed(2)),
      throughput: Number((operations / closeTime).toFixed(1)),
      successRate: transactionCount === 0 ? 100 : Number((successful / transactionCount * 100).toFixed(2)),
      utilization: Number(Math.min(100, operations / 10).toFixed(1)),
      participation: 99.2,
    }
  })
}

export function validatorsFromLedgerContinuity(
  history: MetricSeriesPoint[],
  now = new Date(),
): ValidatorHealth[] {
  const baseline = createDemoValidators(now)
  const latest = history[history.length - 1]
  const degraded = latest ? latest.closeTimeSeconds > 8 : false
  return baseline.map((validator, index) => ({
    ...validator,
    status: degraded && index === baseline.length - 1 ? 'degraded' : 'healthy',
    participation: latest?.participation ?? validator.participation,
    ledgerLag: degraded && index === baseline.length - 1 ? 1 : 0,
    finding: degraded && index === baseline.length - 1
      ? 'Modeled validator view indicates possible lag; connect validator telemetry for confirmation.'
      : undefined,
  }))
}
