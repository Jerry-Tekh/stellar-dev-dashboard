import type { AnomalyScore, BridgeTransfer, LiquidityPoolSnapshot } from '../../types/bridge'

const ANOMALY_THRESHOLD = 2.5

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 1
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance) || 1
}

function zScore(value: number, avg: number, sd: number): number {
  return Math.abs((value - avg) / sd)
}

export function detectTransferAnomalies(transfers: BridgeTransfer[]): AnomalyScore[] {
  const amounts = transfers.map((t) => t.amountUsd)
  const gasCosts = transfers.map((t) => t.gasCostUsd)
  const avgAmount = mean(amounts)
  const sdAmount = stdDev(amounts, avgAmount)
  const avgGas = mean(gasCosts)
  const sdGas = stdDev(gasCosts, avgGas)

  return transfers.map((t) => {
    const amountZ = zScore(t.amountUsd, avgAmount, sdAmount)
    const gasZ = zScore(t.gasCostUsd, avgGas, sdGas)
    const slippageZ = t.slippageBps > 100 ? 3 : t.slippageBps / 50
    const score = Math.max(amountZ, gasZ, slippageZ)
    const isAnomaly = score >= ANOMALY_THRESHOLD

    const reasons: string[] = []
    if (amountZ >= ANOMALY_THRESHOLD) reasons.push('unusual transfer amount')
    if (gasZ >= ANOMALY_THRESHOLD) reasons.push('abnormal gas cost')
    if (slippageZ >= ANOMALY_THRESHOLD) reasons.push('elevated slippage')

    return {
      entityId: t.id,
      entityType: 'transfer' as const,
      score,
      isAnomaly,
      features: { amountZ, gasZ, slippageZ },
      explanation: isAnomaly
        ? `Anomaly detected: ${reasons.join(', ')}`
        : 'Transfer within normal parameters',
    }
  })
}

export function detectLiquidityAnomalies(pools: LiquidityPoolSnapshot[]): AnomalyScore[] {
  return pools.map((pool) => {
    const drainScore =
      pool.change24hPct < -15 ? 4 : pool.change24hPct < -8 ? 2.5 : pool.change24hPct / 10
    const utilizationScore = pool.utilizationPct > 90 ? 3.5 : pool.utilizationPct / 40
    const score = Math.max(drainScore, utilizationScore)
    const isAnomaly = score >= ANOMALY_THRESHOLD

    return {
      entityId: `${pool.bridgeId}-${pool.chain}-${pool.asset}`,
      entityType: 'pool' as const,
      score,
      isAnomaly,
      features: { drainScore, utilizationScore, change24h: pool.change24hPct },
      explanation: isAnomaly
        ? pool.change24hPct < -8
          ? 'Potential liquidity drain detected'
          : 'High pool utilization may cause transfer delays'
        : 'Liquidity levels normal',
    }
  })
}

export function detectRelayerAnomalies(
  relayerStats: Array<{ address: string; failureRate: number; avgDelaySec: number }>
): AnomalyScore[] {
  const failureRates = relayerStats.map((r) => r.failureRate)
  const avgFailure = mean(failureRates)
  const sdFailure = stdDev(failureRates, avgFailure)

  return relayerStats.map((r) => {
    const failureZ = zScore(r.failureRate, avgFailure, sdFailure)
    const delayScore = r.avgDelaySec > 600 ? 3 : r.avgDelaySec / 300
    const score = Math.max(failureZ, delayScore)
    const isAnomaly = score >= ANOMALY_THRESHOLD

    return {
      entityId: r.address,
      entityType: 'relayer' as const,
      score,
      isAnomaly,
      features: { failureZ, delayScore, failureRate: r.failureRate },
      explanation: isAnomaly
        ? 'Relayer showing suspicious failure or delay patterns'
        : 'Relayer behavior within expected range',
    }
  })
}

export function aggregateAnomalyRate(scores: AnomalyScore[]): number {
  if (scores.length === 0) return 0
  return scores.filter((s) => s.isAnomaly).length / scores.length
}
