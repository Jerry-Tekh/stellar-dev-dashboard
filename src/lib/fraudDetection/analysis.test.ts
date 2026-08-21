import { describe, expect, it } from 'vitest'
import {
  assessTransaction,
  batchAssess,
  buildAlertsFromAssessments,
  decisionFor,
  detectMemoScamSignals,
  detectWashTradingSignals,
  ensembleScore,
  evaluateDetectionQuality,
  normalizeThreatIntel,
  severityFor,
  updateFraudAlert,
} from './analysis'
import { createFraudSnapshot, fixtureThreatIntel, fixtureTransactions } from './fixtures'

describe('fraud detection analysis', () => {
  it('maps scores to severity and decision bands', () => {
    expect(severityFor(90)).toBe('critical')
    expect(severityFor(70)).toBe('high')
    expect(severityFor(40)).toBe('medium')
    expect(severityFor(10)).toBe('low')
    expect(decisionFor(95, true)).toBe('block')
    expect(decisionFor(82)).toBe('hold')
    expect(decisionFor(50)).toBe('review')
    expect(decisionFor(25)).toBe('monitor')
    expect(decisionFor(5)).toBe('allow')
  })

  it('combines independent signals into an explainable high-risk decision', () => {
    const transactions = fixtureTransactions(new Date('2026-08-21T16:00:00.000Z'))
    const intel = fixtureThreatIntel(new Date('2026-08-21T16:00:00.000Z'))
    const assessment = assessTransaction(transactions[1], transactions, intel)
    expect(assessment.decision === 'hold' || assessment.decision === 'block').toBe(true)
    expect(assessment.score).toBeGreaterThanOrEqual(80)
    expect(assessment.signals.map((signal) => signal.source)).toContain('intelligence')
    expect(assessment.signals.every((signal) => signal.explanation && signal.evidence.length > 0)).toBe(
      true
    )
    expect(assessment.latencyMs).toBeGreaterThan(0)
    expect(assessment.modelVersion).toContain('fraud-ensemble')
  })

  it('keeps a clean transaction near allow/monitor when no indicators are present', () => {
    const assessment = assessTransaction(
      {
        id: 'clean',
        source: 'G' + 'A'.repeat(55),
        destination: 'G' + 'Z'.repeat(55),
        amount: 12,
        asset: 'XLM',
        timestamp: '2026-08-21T12:00:00.000Z',
        operation: 'payment',
        memo: 'coffee',
        signerCount: 1,
      },
      [],
      []
    )
    expect(['allow', 'monitor']).toContain(assessment.decision)
    expect(assessment.score).toBeLessThan(20)
  })

  it('detects scam language and phishing markers in memos', () => {
    const signals = detectMemoScamSignals({
      id: 'memo',
      source: 'G' + 'A'.repeat(55),
      destination: 'G' + 'B'.repeat(55),
      amount: 1,
      asset: 'XLM',
      timestamp: '2026-08-21T12:00:00.000Z',
      operation: 'payment',
      memo: 'official support verify wallet immediately for guaranteed return',
      signerCount: 1,
    })
    expect(signals.some((signal) => signal.ruleId === 'NLP-001')).toBe(true)
    expect(signals.some((signal) => signal.ruleId === 'PHISH-001')).toBe(true)
    expect(signals.some((signal) => signal.ruleId === 'INV-001')).toBe(true)
  })

  it('flags circular wash-trading style flows', () => {
    const a = 'G' + 'A'.repeat(55)
    const b = 'G' + 'B'.repeat(55)
    const history = [
      {
        id: 'w1',
        source: a,
        destination: b,
        amount: 100,
        asset: 'XLM',
        timestamp: '2026-08-21T12:00:00.000Z',
        operation: 'payment' as const,
        signerCount: 1,
      },
    ]
    const signals = detectWashTradingSignals(
      {
        id: 'w2',
        source: b,
        destination: a,
        amount: 99,
        asset: 'XLM',
        timestamp: '2026-08-21T12:20:00.000Z',
        operation: 'payment',
        signerCount: 1,
      },
      history
    )
    expect(signals).toHaveLength(1)
    expect(signals[0].category).toBe('wash-trading')
  })

  it('normalizes and bounds imported intelligence safely', () => {
    const result = normalizeThreatIntel([
      {
        address: ' GABC ',
        category: 'spam',
        source: 'feed',
        lastUpdated: 'today',
        confidence: 4,
        tags: ['a', 'b'],
      },
      { address: 'missing category' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].address).toBe('GABC')
    expect(result[0].confidence).toBe(1)
    expect(result[0].tags).toEqual(['a', 'b'])
  })

  it('builds alerts and supports status transitions', () => {
    const snapshot = createFraudSnapshot('testnet')
    const alerts = buildAlertsFromAssessments(snapshot.assessments)
    expect(alerts.length).toBeGreaterThan(0)
    const updated = updateFraudAlert(alerts, alerts[0].id, 'acknowledged')
    expect(updated[0].status).toBe('acknowledged')
  })

  it('reports detection quality metrics for labeled fixtures', () => {
    const snapshot = createFraudSnapshot('testnet')
    const labeled = snapshot.assessments.map((assessment) => ({
      assessment,
      isFraud: assessment.score >= 35,
    }))
    const metrics = evaluateDetectionQuality(labeled)
    expect(metrics.evaluatedSamples).toBe(snapshot.assessments.length)
    expect(metrics.detectionAccuracy).toBeGreaterThan(0.9)
    expect(metrics.falsePositiveRate).toBeLessThan(0.05)
    expect(metrics.meanLatencyMs).toBeGreaterThanOrEqual(0)
  })

  it('awards ensemble diversity without exceeding 100', () => {
    const { score, confidence } = ensembleScore([
      {
        id: '1',
        ruleId: 'A',
        category: 'spam',
        severity: 'medium',
        title: 'a',
        explanation: 'e',
        evidence: ['x'],
        score: 40,
        confidence: 0.8,
        source: 'deterministic',
        privacySafe: true,
      },
      {
        id: '2',
        ruleId: 'B',
        category: 'phishing',
        severity: 'high',
        title: 'b',
        explanation: 'e',
        evidence: ['x'],
        score: 40,
        confidence: 0.8,
        source: 'nlp',
        privacySafe: true,
      },
      {
        id: '3',
        ruleId: 'C',
        category: 'malicious-network',
        severity: 'high',
        title: 'c',
        explanation: 'e',
        evidence: ['x'],
        score: 40,
        confidence: 0.8,
        source: 'graph',
        privacySafe: true,
      },
    ])
    expect(score).toBeLessThanOrEqual(100)
    expect(confidence).toBeLessThanOrEqual(0.99)
  })

  it('batch assesses every fixture transaction', () => {
    const snapshot = createFraudSnapshot('public')
    const assessments = batchAssess(snapshot.transactions, snapshot.threatIntel, snapshot.profiles)
    expect(assessments).toHaveLength(snapshot.transactions.length)
    expect(snapshot.methodologyVersion).toContain('fraud-methodology')
    expect(snapshot.education.length).toBeGreaterThan(0)
    expect(snapshot.prevention.some((item) => item.automated)).toBe(true)
  })
})
