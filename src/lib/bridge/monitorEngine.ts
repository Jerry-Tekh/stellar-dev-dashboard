import type { BridgeMonitorSnapshot, BridgePerformanceReport, BridgeProtocol } from '../../types/bridge'
import { detectLiquidityAnomalies, detectTransferAnomalies } from './anomalyDetection'
import {
  forecastCongestion,
  predictTransferCompletion,
} from './predictiveAnalytics'
import {
  analyzeTransferPatterns,
  computeSecurityScore,
  detectCoordinatedAttack,
  detectMevActivity,
  scanBridgeContracts,
} from './securityAnalysis'
import { suggestAllRoutes, compareBridgePerformance } from './routingOptimizer'
import {
  aggregateTransferMetrics,
  generateLiquiditySnapshots,
  generateSyntheticTransfers,
} from './dataPipeline'
import { SUPPORTED_BRIDGES, SUPPORTED_CHAINS } from './bridgeRegistry'

let cachedSnapshot: BridgeMonitorSnapshot | null = null
let lastRefresh = 0
const CACHE_TTL_MS = 30_000

function buildPerformanceReport(transfers: ReturnType<typeof generateSyntheticTransfers>): BridgePerformanceReport {
  const metrics = aggregateTransferMetrics(transfers)
  const byProtocol = {} as BridgePerformanceReport['byProtocol']

  for (const bridge of SUPPORTED_BRIDGES) {
    const protocolTransfers = transfers.filter((t) => t.protocol === bridge.id)
    const protocolMetrics = aggregateTransferMetrics(protocolTransfers)
    byProtocol[bridge.id] = {
      transfers: protocolTransfers.length,
      successRate: protocolMetrics.successRate,
      avgCostUsd: protocolMetrics.avgGasCostUsd,
      avgTimeSec: protocolMetrics.avgCompletionSec || bridge.avgTransferTimeSec,
    }
  }

  return {
    period: '24h',
    totalTransfers: metrics.total,
    successRate: metrics.successRate,
    avgCompletionTimeSec: metrics.avgCompletionSec || 240,
    totalVolumeUsd: metrics.totalVolumeUsd,
    securityAlertsCount: 0,
    costSavingsPct: 22,
    predictionAccuracyPct: 84,
    byProtocol,
  }
}

export function buildMonitorSnapshot(transferCount = 48): BridgeMonitorSnapshot {
  const now = Date.now()
  const transfers = generateSyntheticTransfers(transferCount, now)
  const liquidityPools = generateLiquiditySnapshots(now)

  const transferAnomalies = detectTransferAnomalies(transfers)
  const poolAnomalies = detectLiquidityAnomalies(liquidityPools)

  const securityAlerts = [
    ...scanBridgeContracts('wormhole', 'ethereum'),
    ...scanBridgeContracts('allbridge', 'stellar'),
    ...analyzeTransferPatterns(transfers),
    detectMevActivity('stargate', 'ethereum'),
    detectMevActivity('celer', 'polygon'),
  ].filter(Boolean) as BridgeMonitorSnapshot['securityAlerts']

  const alertCounts = new Map<BridgeProtocol, number>()
  for (const alert of securityAlerts) {
    alertCounts.set(alert.bridgeId, (alertCounts.get(alert.bridgeId) ?? 0) + 1)
  }
  const coordinated = detectCoordinatedAttack(alertCounts)
  if (coordinated) securityAlerts.push(coordinated)

  for (const score of [...transferAnomalies, ...poolAnomalies]) {
    if (score.isAnomaly && score.entityType === 'transfer') {
      const transfer = transfers.find((t) => t.id === score.entityId)
      if (transfer) {
        securityAlerts.push({
          id: `anomaly-${score.entityId}`,
          bridgeId: transfer.protocol,
          chain: transfer.sourceChain,
          severity: score.score > 3.5 ? 'high' : 'medium',
          category: 'anomaly',
          title: 'ML anomaly detected on transfer',
          description: score.explanation,
          detectedAt: now,
          resolved: false,
          confidence: Math.min(0.95, 0.6 + score.score * 0.1),
        })
      }
    }
  }

  const congestionForecasts = SUPPORTED_BRIDGES.slice(0, 6).flatMap((b) =>
    b.supportedChains.slice(0, 2).map((chain) => forecastCongestion(b.id, chain, now))
  )

  const routingSuggestions = suggestAllRoutes([
    { source: 'stellar', dest: 'ethereum', asset: 'USDC', amountUsd: 50_000 },
    { source: 'stellar', dest: 'polygon', asset: 'USDC', amountUsd: 10_000 },
    { source: 'ethereum', dest: 'stellar', asset: 'USDC', amountUsd: 25_000 },
    { source: 'arbitrum', dest: 'stellar', asset: 'ETH', amountUsd: 5_000 },
  ])

  const activeTransfers = transfers.filter((t) =>
    ['initiated', 'source_confirmed', 'relaying', 'destination_pending'].includes(t.status)
  )

  const predictions = activeTransfers.map(predictTransferCompletion)
  const performanceReport = buildPerformanceReport(transfers)
  performanceReport.securityAlertsCount = securityAlerts.filter((a) => !a.resolved).length

  const securityScore = computeSecurityScore(securityAlerts)
  const networkHealth =
    SUPPORTED_CHAINS.filter((c) => c.status === 'healthy').length / SUPPORTED_CHAINS.length
  const successFactor = performanceReport.successRate
  const healthScore = Math.round(
    securityScore * 0.35 + networkHealth * 100 * 0.25 + successFactor * 100 * 0.4
  )

  return {
    timestamp: now,
    networks: SUPPORTED_CHAINS.map((c) => ({ ...c })),
    bridges: SUPPORTED_BRIDGES.map((b) => ({ ...b })),
    activeTransfers,
    liquidityPools,
    securityAlerts,
    congestionForecasts,
    routingSuggestions,
    predictions,
    performanceReport,
    healthScore,
  }
}

export function getMonitorSnapshot(forceRefresh = false): BridgeMonitorSnapshot {
  const now = Date.now()
  if (!forceRefresh && cachedSnapshot && now - lastRefresh < CACHE_TTL_MS) {
    return cachedSnapshot
  }
  cachedSnapshot = buildMonitorSnapshot()
  lastRefresh = now
  return cachedSnapshot
}

export function resetMonitorCache(): void {
  cachedSnapshot = null
  lastRefresh = 0
}

export { compareBridgePerformance }
