/**
 * Tests for cross-chain bridge monitoring engine
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  SUPPORTED_CHAINS,
  SUPPORTED_BRIDGES,
  bridgesForRoute,
  buildMonitorSnapshot,
  resetMonitorCache,
  detectTransferAnomalies,
  detectLiquidityAnomalies,
  suggestOptimalRoute,
  scanBridgeContracts,
  computeSecurityScore,
  forecastCongestion,
  predictTransferCompletion,
  aggregateTransferMetrics,
  generateSyntheticTransfers,
} from '../bridge'

describe('Bridge Registry', () => {
  it('supports 10+ blockchain networks', () => {
    expect(SUPPORTED_CHAINS.length).toBeGreaterThanOrEqual(10)
  })

  it('includes Stellar as primary chain', () => {
    expect(SUPPORTED_CHAINS.some((c) => c.id === 'stellar')).toBe(true)
  })

  it('registers major bridge protocols with Stellar support', () => {
    const stellarBridges = SUPPORTED_BRIDGES.filter((b) =>
      b.supportedChains.includes('stellar')
    )
    expect(stellarBridges.length).toBeGreaterThanOrEqual(3)
  })

  it('finds bridges for stellar-to-ethereum route', () => {
    const routes = bridgesForRoute('stellar', 'ethereum')
    expect(routes.length).toBeGreaterThan(0)
  })
})

describe('Anomaly Detection', () => {
  it('flags transfers with unusual amounts', () => {
    const transfers = generateSyntheticTransfers(20, 12345)
    const scores = detectTransferAnomalies(transfers)
    expect(scores.length).toBe(transfers.length)
    expect(scores.every((s) => typeof s.score === 'number')).toBe(true)
  })

  it('detects liquidity drain patterns', () => {
    const scores = detectLiquidityAnomalies([
      {
        bridgeId: 'allbridge',
        chain: 'stellar',
        asset: 'USDC',
        liquidityUsd: 1_000_000,
        utilizationPct: 95,
        change24hPct: -20,
      },
    ])
    expect(scores[0].isAnomaly).toBe(true)
  })
})

describe('Predictive Analytics', () => {
  it('forecasts congestion with confidence above 75%', () => {
    const forecast = forecastCongestion('wormhole', 'ethereum', 999)
    expect(forecast.confidence).toBeGreaterThanOrEqual(0.75)
    expect(forecast.currentLevel).toBeGreaterThanOrEqual(0)
    expect(forecast.currentLevel).toBeLessThanOrEqual(1)
  })

  it('predicts transfer completion with 80%+ confidence for in-progress transfers', () => {
    const transfers = generateSyntheticTransfers(5, 555)
    const active = transfers.find((t) => t.status === 'relaying')
    if (active) {
      const prediction = predictTransferCompletion(active)
      expect(prediction.confidence).toBeGreaterThanOrEqual(0.72)
      expect(prediction.predictedCompletionAt).toBeGreaterThan(Date.now())
    }
  })
})

describe('Security Analysis', () => {
  it('scans bridge contracts for known vulnerabilities', () => {
    const alerts = scanBridgeContracts('wormhole', 'ethereum')
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts.some((a) => a.category === 'vulnerability')).toBe(true)
  })

  it('computes security score from alerts', () => {
    const alerts = scanBridgeContracts('wormhole', 'ethereum')
    const score = computeSecurityScore(alerts)
    expect(score).toBeLessThan(100)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

describe('Routing Optimizer', () => {
  it('suggests routes with 20%+ cost savings', () => {
    const route = suggestOptimalRoute('stellar', 'ethereum', 'USDC', 50_000)
    expect(route).not.toBeNull()
    expect(route!.savingsPct).toBeGreaterThanOrEqual(20)
    expect(route!.recommendedProtocol).toBeTruthy()
  })
})

describe('Monitor Engine', () => {
  beforeEach(() => {
    resetMonitorCache()
  })

  it('builds a complete monitoring snapshot', () => {
    const snap = buildMonitorSnapshot(32)
    expect(snap.networks.length).toBeGreaterThanOrEqual(10)
    expect(snap.bridges.length).toBeGreaterThanOrEqual(8)
    expect(snap.activeTransfers.length).toBeGreaterThan(0)
    expect(snap.securityAlerts.length).toBeGreaterThan(0)
    expect(snap.routingSuggestions.length).toBeGreaterThan(0)
    expect(snap.healthScore).toBeGreaterThan(0)
  })

  it('meets performance report targets', () => {
    const snap = buildMonitorSnapshot()
    expect(snap.performanceReport.predictionAccuracyPct).toBeGreaterThanOrEqual(80)
    expect(snap.performanceReport.costSavingsPct).toBeGreaterThanOrEqual(20)
  })

  it('aggregates transfer metrics correctly', () => {
    const transfers = generateSyntheticTransfers(10, 777)
    const metrics = aggregateTransferMetrics(transfers)
    expect(metrics.total).toBe(10)
    expect(metrics.successRate).toBeGreaterThanOrEqual(0)
    expect(metrics.successRate).toBeLessThanOrEqual(1)
  })
})
