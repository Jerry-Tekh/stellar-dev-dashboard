import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot, CHAINS, BRIDGES } from '../src/engine.js'

describe('Bridge Monitor Engine', () => {
  it('monitors 10+ blockchain networks', () => {
    assert.ok(CHAINS.length >= 10)
  })

  it('supports major bridge protocols', () => {
    assert.ok(BRIDGES.length >= 8)
    const stellarBridges = BRIDGES.filter(b => b.supportedChains.includes('stellar'))
    assert.ok(stellarBridges.length >= 3)
  })

  it('builds a complete monitoring snapshot', () => {
    const snap = buildSnapshot()
    assert.ok(snap.timestamp)
    assert.ok(snap.activeTransfers.length > 0)
    assert.ok(snap.liquidityPools.length > 0)
    assert.ok(snap.healthScore >= 0 && snap.healthScore <= 100)
  })

  it('generates security alerts', () => {
    const snap = buildSnapshot()
    assert.ok(snap.securityAlerts.length > 0)
    assert.ok(snap.securityAlerts.some(a => a.severity === 'critical'))
  })

  it('provides routing suggestions with savings', () => {
    const snap = buildSnapshot()
    assert.ok(snap.routingSuggestions.length > 0)
    assert.ok(snap.routingSuggestions[0].savingsPct >= 20)
  })

  it('reports prediction accuracy above 80%', () => {
    const snap = buildSnapshot()
    assert.ok(snap.performanceReport.predictionAccuracyPct >= 80)
  })
})
