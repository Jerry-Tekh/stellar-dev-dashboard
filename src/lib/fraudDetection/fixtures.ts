import type {
  BehavioralProfile,
  EducationTip,
  FraudAccount,
  FraudGraphEdge,
  FraudGraphNode,
  FraudModelCard,
  FraudSnapshot,
  FraudTransaction,
  PreventionAction,
  ThreatIntelEntry,
} from '../../types/fraud'
import {
  METHODOLOGY_VERSION,
  MODEL_VERSION,
  batchAssess,
  buildAlertsFromAssessments,
  evaluateDetectionQuality,
} from './analysis'

const DEMO_SOURCE = `G${'A'.repeat(55)}`
const DEMO_DESTINATION = `G${'B'.repeat(55)}`
const MALICIOUS = `G${'M'.repeat(55)}`
const WASH_PEER = `G${'W'.repeat(55)}`
const CLEAN = `G${'C'.repeat(55)}`

export function fixtureAccounts(_now = new Date()): FraudAccount[] {
  return [
    {
      address: DEMO_SOURCE,
      firstSeen: '2025-11-02',
      transactionCount: 184,
      trusted: true,
      labels: ['connected account'],
      riskScore: 18,
      regionHint: 'global',
    },
    {
      address: DEMO_DESTINATION,
      firstSeen: '2026-08-14',
      transactionCount: 9,
      trusted: false,
      labels: ['new destination'],
      riskScore: 62,
    },
    {
      address: MALICIOUS,
      firstSeen: '2026-07-01',
      transactionCount: 2418,
      trusted: false,
      labels: ['reported scam cluster'],
      riskScore: 96,
    },
    {
      address: WASH_PEER,
      firstSeen: '2026-08-10',
      transactionCount: 44,
      trusted: false,
      labels: ['circular flow peer'],
      riskScore: 54,
    },
    {
      address: CLEAN,
      firstSeen: '2024-03-12',
      transactionCount: 920,
      trusted: true,
      labels: ['known counterparty'],
      riskScore: 8,
    },
  ]
}

export function fixtureThreatIntel(now = new Date()): ThreatIntelEntry[] {
  const day = now.toISOString().slice(0, 10)
  return [
    {
      address: MALICIOUS,
      label: 'Investment scam cluster / reported',
      category: 'investment-scam',
      confidence: 0.97,
      source: 'Stellar Security Feed',
      lastUpdated: day,
      revoked: false,
      tags: ['ponzi', 'referral', 'high-volume'],
    },
    {
      address: `G${'P'.repeat(55)}`,
      label: 'Phishing lure distributor',
      category: 'phishing',
      confidence: 0.91,
      source: 'Wallet Provider Consortium',
      lastUpdated: day,
      revoked: false,
      tags: ['qr-spoof', 'fake-ui'],
    },
  ]
}

export function fixtureTransactions(
  now = new Date(),
  incident = false,
  connectedAddress?: string
): FraudTransaction[] {
  const source = connectedAddress || DEMO_SOURCE
  const base = now.getTime()
  const rows: FraudTransaction[] = [
    {
      id: 'tx-demo-1',
      source,
      destination: DEMO_DESTINATION,
      amount: 8400,
      asset: 'USDC',
      timestamp: new Date(base - 120_000).toISOString(),
      operation: 'payment',
      memo: incident ? 'guaranteed investment return claim reward' : 'investment return',
      signerCount: 1,
      fee: 0.00001,
      successful: true,
    },
    {
      id: 'tx-demo-2',
      source: DEMO_DESTINATION,
      destination: MALICIOUS,
      amount: 0.000001,
      asset: 'XLM',
      timestamp: new Date(base - 240_000).toISOString(),
      operation: 'payment',
      memo: 'airdrop claim',
      signerCount: 1,
      successful: true,
    },
    {
      id: 'tx-demo-3',
      source,
      destination: DEMO_DESTINATION,
      amount: 0.000001,
      asset: 'XLM',
      timestamp: new Date(base - 480_000).toISOString(),
      operation: 'payment',
      signerCount: 1,
      successful: true,
    },
    {
      id: 'tx-demo-4',
      source,
      destination: source,
      amount: 12,
      asset: 'XLM',
      timestamp: new Date(base - 12_600_000).toISOString(),
      operation: 'set-options',
      signerCount: 2,
      successful: true,
    },
    {
      id: 'tx-demo-5',
      source,
      destination: WASH_PEER,
      amount: 250,
      asset: 'XLM',
      timestamp: new Date(base - 900_000).toISOString(),
      operation: 'payment',
      signerCount: 1,
      successful: true,
    },
    {
      id: 'tx-demo-6',
      source: WASH_PEER,
      destination: source,
      amount: 248,
      asset: 'XLM',
      timestamp: new Date(base - 720_000).toISOString(),
      operation: 'payment',
      signerCount: 1,
      successful: true,
    },
    {
      id: 'tx-demo-7',
      source,
      destination: CLEAN,
      amount: 15,
      asset: 'XLM',
      timestamp: new Date(base - 3_600_000).toISOString(),
      operation: 'payment',
      memo: 'coffee',
      signerCount: 1,
      successful: true,
    },
    {
      id: 'tx-demo-8',
      source,
      destination: DEMO_DESTINATION,
      amount: 40,
      asset: 'USDC',
      timestamp: new Date(base - 60_000).toISOString(),
      operation: 'payment',
      memo: incident ? 'official support verify wallet immediately' : undefined,
      signerCount: 1,
      successful: true,
    },
  ]
  return rows
}

export function fixtureProfiles(connectedAddress?: string): BehavioralProfile[] {
  const address = connectedAddress || DEMO_SOURCE
  return [
    {
      address,
      baselineTxPerDay: 2,
      observedTxPerDay: 6,
      typicalAssets: ['XLM', 'USDC'],
      unusualHoursShare: 0.42,
      deviceDiversity: 0.35,
      anomalyScore: 0.72,
      windowHours: 24,
      notes: ['More night-window activity than baseline', 'New destination concentration rising'],
    },
  ]
}

export function fixtureModels(): FraudModelCard[] {
  return [
    {
      id: 'rules-core',
      name: 'Deterministic policy rules',
      kind: 'rules',
      version: 'rules-v1.3',
      accuracyEstimate: 0.91,
      falsePositiveEstimate: 0.012,
      latencyBudgetMs: 5,
      trainedOn: 'curated Stellar fraud playbooks',
      notes: 'High-precision candidate generator for known patterns.',
    },
    {
      id: 'behavior-iso',
      name: 'Behavioral anomaly detector',
      kind: 'unsupervised',
      version: 'behavior-v0.9',
      accuracyEstimate: 0.88,
      falsePositiveEstimate: 0.018,
      latencyBudgetMs: 40,
      trainedOn: 'privacy-preserving activity histograms',
      notes: 'Uses aggregated features only; no raw device identifiers leave the client.',
    },
    {
      id: 'graph-gnn',
      name: 'Fund-flow graph scorer',
      kind: 'graph',
      version: 'graph-v0.7',
      accuracyEstimate: 0.9,
      falsePositiveEstimate: 0.015,
      latencyBudgetMs: 80,
      trainedOn: 'labeled scam clusters + hop features',
      notes: 'Two-hop neighborhood features; not a full GNN in-browser.',
    },
    {
      id: 'memo-nlp',
      name: 'Memo / communication NLP',
      kind: 'nlp',
      version: 'nlp-v0.8',
      accuracyEstimate: 0.86,
      falsePositiveEstimate: 0.02,
      latencyBudgetMs: 25,
      trainedOn: 'reported scam memos and lure copy',
      notes: 'Lexicon + phrase matching; production should use calibrated transformers.',
    },
    {
      id: 'ensemble',
      name: 'Explainable ensemble',
      kind: 'ensemble',
      version: MODEL_VERSION,
      accuracyEstimate: 0.953,
      falsePositiveEstimate: 0.016,
      latencyBudgetMs: 500,
      trainedOn: 'combined labeled + synthetic fraud scenarios',
      notes: 'Combines independent sources with diversity bonus; decisions remain reviewable.',
    },
  ]
}

export function fixturePrevention(): PreventionAction[] {
  return [
    {
      id: 'prev-block-intel',
      title: 'Auto-block known fraudulent addresses',
      description: 'Outbound payments to revoked=false intel entries with ≥90% confidence are held.',
      automated: true,
      severity: 'critical',
      appliesTo: 'wallet outbound',
    },
    {
      id: 'prev-warn-dust',
      title: 'Warn on inbound dust',
      description: 'Surface education when a dust payment arrives from an unknown cluster.',
      automated: true,
      severity: 'medium',
      appliesTo: 'inbound payment',
    },
    {
      id: 'prev-review-auth',
      title: 'Require review for signer changes',
      description: 'Set-options and multi-signer jumps open an investigation card before follow-on transfers.',
      automated: false,
      severity: 'high',
      appliesTo: 'account security',
    },
    {
      id: 'prev-wallet-hook',
      title: 'Wallet provider protection hook',
      description: 'Expose assessment API so Freighter / Lobstr / other wallets can warn pre-sign.',
      automated: true,
      severity: 'high',
      appliesTo: 'third-party wallets',
    },
  ]
}

export function fixtureEducation(): EducationTip[] {
  return [
    {
      id: 'edu-seed',
      title: 'Never share a seed phrase',
      body: 'No legitimate Stellar service will ask for your secret key or recovery phrase in a memo, QR, or chat.',
      category: 'phishing',
      severity: 'critical',
    },
    {
      id: 'edu-returns',
      title: 'Guaranteed returns are a red flag',
      body: 'Promises of fixed daily profit or “double your deposit” are classic investment-scam patterns.',
      category: 'investment-scam',
      severity: 'high',
    },
    {
      id: 'edu-dust',
      title: 'Ignore unexpected dust payments',
      body: 'Tiny XLM deposits are often used to poison address books or lure follow-up phishing.',
      category: 'dust-attack',
      severity: 'medium',
    },
    {
      id: 'edu-qr',
      title: 'Verify QR codes and domains',
      body: 'Compare payment addresses character-by-character and prefer bookmarks over search ads for wallet UIs.',
      category: 'impersonation',
      severity: 'high',
    },
    {
      id: 'edu-privacy',
      title: 'Behavioral signals stay privacy-safe',
      body: 'This dashboard scores aggregated activity patterns—not personal identity, contacts, or private keys.',
      category: 'general',
      severity: 'low',
    },
  ]
}

export function fixtureGraph(accounts: FraudAccount[]): {
  nodes: FraudGraphNode[]
  edges: FraudGraphEdge[]
} {
  const nodes: FraudGraphNode[] = accounts.map((account) => ({
    id: account.address,
    label: account.labels[0] || 'account',
    risk:
      (account.riskScore || 0) >= 85
        ? 'critical'
        : (account.riskScore || 0) >= 65
          ? 'high'
          : (account.riskScore || 0) >= 35
            ? 'medium'
            : 'low',
    kind: account.labels.some((label) => label.includes('cluster')) ? 'cluster' : 'account',
  }))
  const edges: FraudGraphEdge[] = [
    {
      from: accounts[0]?.address || DEMO_SOURCE,
      to: accounts[1]?.address || DEMO_DESTINATION,
      weight: 0.7,
      reason: 'recent payment',
    },
    {
      from: accounts[1]?.address || DEMO_DESTINATION,
      to: accounts[2]?.address || MALICIOUS,
      weight: 0.95,
      reason: 'fund-flow to flagged cluster',
    },
    {
      from: accounts[0]?.address || DEMO_SOURCE,
      to: accounts[3]?.address || WASH_PEER,
      weight: 0.55,
      reason: 'circular flow candidate',
    },
  ]
  return { nodes, edges }
}

const CAVEATS = [
  'Demonstration fixtures validate workflows and explainability—not production 95% accuracy on live Stellar traffic.',
  'False positives are minimized with reviewable decisions; automated blocking only applies to high-confidence intel.',
  'Behavioral analysis uses aggregated features and never collects seed phrases, private keys, or raw device fingerprints server-side in this build.',
  'Threat intelligence freshness depends on upstream feeds; always verify critical holds with a second source.',
  'Cross-wallet protection requires wallet providers to call the assessment API before signing.',
]

export function createFraudSnapshot(
  network = 'testnet',
  options: { incident?: boolean; connectedAddress?: string; now?: Date; state?: FraudSnapshot['state'] } = {}
): FraudSnapshot {
  const now = options.now || new Date('2026-08-21T16:00:00.000Z')
  const accounts = fixtureAccounts(now)
  const threatIntel = fixtureThreatIntel(now)
  const transactions = fixtureTransactions(now, Boolean(options.incident), options.connectedAddress)
  const profiles = fixtureProfiles(options.connectedAddress)
  const assessments = batchAssess(transactions, threatIntel, profiles, now)
  const alerts = buildAlertsFromAssessments(assessments, now)
  const labeled = assessments.map((assessment) => ({
    assessment,
    isFraud: assessment.score >= 35 && assessment.subject !== 'tx-demo-7',
  }))
  const metrics = evaluateDetectionQuality(labeled)
  const highRiskCount = assessments.filter(
    (item) => item.severity === 'high' || item.severity === 'critical'
  ).length
  const averageRisk = Math.round(
    assessments.reduce((sum, item) => sum + item.score, 0) / Math.max(1, assessments.length)
  )

  return {
    generatedAt: now.toISOString(),
    state: options.state || 'simulation',
    network,
    summary: {
      openAlerts: alerts.filter((alert) => alert.status === 'open').length,
      highRiskCount,
      averageRisk,
      blockedAddresses: threatIntel.filter((entry) => !entry.revoked && entry.confidence >= 0.9)
        .length,
      monitoredTransactions: transactions.length,
      modelVersion: MODEL_VERSION,
      dataFreshnessSeconds: 12,
    },
    assessments,
    accounts,
    transactions,
    threatIntel,
    profiles,
    alerts,
    graph: fixtureGraph(accounts),
    prevention: fixturePrevention(),
    education: fixtureEducation(),
    models: fixtureModels(),
    metrics,
    caveats: CAVEATS,
    methodologyVersion: METHODOLOGY_VERSION,
  }
}

export const fixtureAccountsList = fixtureAccounts()
export const fixtureTransactionsList = fixtureTransactions()
export const fixtureThreatIntelList = fixtureThreatIntel()

/** @deprecated Prefer createFraudSnapshot / fixtureTransactions */
export const fixtureAccountsExport = fixtureAccountsList
export const fixtureTransactionsExport = fixtureTransactionsList
export const fixtureThreatIntelExport = fixtureThreatIntelList
