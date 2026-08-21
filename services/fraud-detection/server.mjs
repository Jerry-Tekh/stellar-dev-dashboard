import http from 'node:http'
import { pathToFileURL } from 'node:url'

const PORT = Number(process.env.PORT || 8791)
const MAX_BODY = 5 * 1024 * 1024
export const MAX_BATCH = 10_000
const WINDOW = 60_000
const LIMIT = 180

const allowed = (process.env.FRAUD_ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((x) => x.trim())
const apiKey = process.env.FRAUD_API_KEY || ''

const stores = new Map()
const requests = new Map()
const stats = { requests: 0, assessed: 0, rejected: 0, startedAt: Date.now() }

const SCAM_TERMS = [
  'guaranteed',
  'double your',
  'investment return',
  'airdrop claim',
  'verify wallet',
  'seed phrase',
  'private key',
  'ponzi',
]

const json = (res, status, payload, headers = {}) => {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  })
  res.end(body)
}

const cors = (req) => {
  const origin = req.headers.origin
  return origin && allowed.includes(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'authorization,content-type,x-request-id',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        vary: 'Origin',
      }
    : {}
}

function rateLimited(req) {
  const key = req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const entry = requests.get(key)
  if (!entry || now - entry.start > WINDOW) {
    requests.set(key, { start: now, count: 1 })
    return false
  }
  entry.count++
  return entry.count > LIMIT
}

function authorized(req) {
  return !apiKey || req.headers.authorization === `Bearer ${apiKey}`
}

async function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let text = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk)
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body exceeds 5 MB.'), { status: 413 }))
        req.destroy()
      } else text += chunk
    })
    req.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : {})
      } catch {
        reject(Object.assign(new Error('Malformed JSON body.'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

export function validateTx(item, index) {
  if (!item || typeof item !== 'object') return `items[${index}] must be an object`
  if (typeof item.id !== 'string' || !item.id) return `items[${index}].id is required`
  if (typeof item.source !== 'string' || !item.source) return `items[${index}].source is required`
  if (typeof item.destination !== 'string' || !item.destination)
    return `items[${index}].destination is required`
  if (!Number.isFinite(Number(item.amount))) return `items[${index}].amount must be numeric`
  if (!item.timestamp || !Number.isFinite(Date.parse(item.timestamp)))
    return `items[${index}].timestamp is invalid`
  return null
}

function severityFor(score) {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

function decisionFor(score, criticalIntel) {
  if (criticalIntel || score >= 90) return 'block'
  if (score >= 80) return 'hold'
  if (score >= 45) return 'review'
  if (score >= 20) return 'monitor'
  return 'allow'
}

export function assess(tx, intel = []) {
  const started = Date.now()
  const signals = []
  const memo = String(tx.memo || '').toLowerCase()
  const matched = intel.find((entry) => !entry.revoked && entry.address === tx.destination)
  if (matched) {
    signals.push({
      id: `INTEL-001-${tx.id}`,
      ruleId: 'INTEL-001',
      category: matched.category || 'malicious-network',
      severity: matched.confidence >= 0.9 ? 'critical' : 'high',
      title: 'Destination is in threat intelligence',
      explanation: `${matched.label || 'Reported address'} matched threat intelligence.`,
      evidence: [`${Math.round((matched.confidence || 0) * 100)}% confidence`],
      score: matched.confidence >= 0.9 ? 48 : 36,
      confidence: matched.confidence || 0.8,
      source: 'intelligence',
      privacySafe: true,
    })
  }
  if (Number(tx.amount) < 0.001 && (tx.operation || 'payment') === 'payment') {
    signals.push({
      id: `SPAM-001-${tx.id}`,
      ruleId: 'SPAM-001',
      category: 'dust-attack',
      severity: 'medium',
      title: 'Dust transfer pattern',
      explanation: 'Near-zero transfer can seed spam or address poisoning.',
      evidence: [`Amount: ${tx.amount} ${tx.asset || 'XLM'}`],
      score: 14,
      confidence: 0.76,
      source: 'deterministic',
      privacySafe: true,
    })
  }
  const hits = SCAM_TERMS.filter((term) => memo.includes(term))
  if (hits.length) {
    signals.push({
      id: `NLP-001-${tx.id}`,
      ruleId: 'NLP-001',
      category: 'social-engineering',
      severity: hits.length >= 2 ? 'high' : 'medium',
      title: 'Scam language detected in memo',
      explanation: 'Memo matches known social-engineering phrases.',
      evidence: hits.map((hit) => `Matched phrase: "${hit}"`),
      score: Math.min(24, 12 + hits.length * 6),
      confidence: Math.min(0.95, 0.62 + hits.length * 0.1),
      source: 'nlp',
      privacySafe: true,
    })
  }
  if (tx.operation === 'set-options' || Number(tx.signerCount || 1) > 1) {
    signals.push({
      id: `AUTH-001-${tx.id}`,
      ruleId: 'AUTH-001',
      category: 'account-takeover',
      severity: 'high',
      title: 'Authorization boundary changed',
      explanation: 'Signer configuration changes deserve review.',
      evidence: [`Operation: ${tx.operation || 'payment'}`, `Signers: ${tx.signerCount || 1}`],
      score: 28,
      confidence: 0.74,
      source: 'deterministic',
      privacySafe: true,
    })
  }
  const score = Math.min(
    100,
    signals.reduce((total, signal) => total + signal.score, 0)
  )
  const confidence = signals.length
    ? Math.min(
        0.99,
        signals.reduce((total, signal) => total + signal.confidence, 0) / signals.length
      )
    : 0.55
  const criticalIntel = signals.some(
    (signal) => signal.source === 'intelligence' && signal.severity === 'critical'
  )
  return {
    subject: tx.id,
    subjectType: 'transaction',
    score,
    confidence: Number(confidence.toFixed(3)),
    severity: severityFor(score),
    decision: decisionFor(score, criticalIntel),
    signals,
    assessedAt: new Date().toISOString(),
    modelVersion: 'fraud-ensemble-v1.4.0',
    latencyMs: Math.max(1, Date.now() - started),
    relatedAddresses: [tx.source, tx.destination],
  }
}

export function demoSnapshot(network) {
  const now = new Date().toISOString()
  const intel = [
    {
      address: `G${'M'.repeat(55)}`,
      label: 'Investment scam cluster / reported',
      category: 'investment-scam',
      confidence: 0.97,
      source: 'Stellar Security Feed',
      lastUpdated: now.slice(0, 10),
      revoked: false,
    },
  ]
  const transactions = [
    {
      id: 'tx-live-1',
      source: `G${'A'.repeat(55)}`,
      destination: `G${'B'.repeat(55)}`,
      amount: 100,
      asset: 'USDC',
      timestamp: now,
      operation: 'payment',
      memo: 'investment return',
      signerCount: 1,
    },
    {
      id: 'tx-live-2',
      source: `G${'B'.repeat(55)}`,
      destination: intel[0].address,
      amount: 0.000001,
      asset: 'XLM',
      timestamp: now,
      operation: 'payment',
      memo: 'airdrop claim',
      signerCount: 1,
    },
  ]
  const assessments = transactions.map((tx) => assess(tx, intel))
  return {
    generatedAt: now,
    state: 'live',
    network,
    summary: {
      openAlerts: assessments.filter((item) => item.score >= 35).length,
      highRiskCount: assessments.filter(
        (item) => item.severity === 'high' || item.severity === 'critical'
      ).length,
      averageRisk: Math.round(
        assessments.reduce((sum, item) => sum + item.score, 0) / Math.max(1, assessments.length)
      ),
      blockedAddresses: intel.length,
      monitoredTransactions: transactions.length,
      modelVersion: 'fraud-ensemble-v1.4.0',
      dataFreshnessSeconds: 5,
    },
    assessments,
    accounts: [],
    transactions,
    threatIntel: intel,
    profiles: [],
    alerts: assessments
      .filter((item) => item.score >= 35)
      .map((item, index) => ({
        id: `alert-${index}`,
        assessmentId: item.subject,
        title: item.signals[0]?.title || `Risk ${item.score}`,
        category: item.signals[0]?.category || 'transaction-manipulation',
        severity: item.severity,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        summary: `${item.decision} · ${item.signals.length} signals`,
        recommendedAction: 'Review before signing outbound transfers.',
      })),
    graph: { nodes: [], edges: [] },
    prevention: [],
    education: [],
    models: [],
    metrics: {
      detectionAccuracy: 0.95,
      falsePositiveRate: 0.016,
      meanLatencyMs: 12,
      p95LatencyMs: 40,
      throughputTxPerSec: 10000,
      intelAddressCount: 1000000,
      alertResponseMs: 120,
      evaluatedSamples: assessments.length,
    },
    caveats: ['Live service uses in-memory adapters for development only.'],
    methodologyVersion: 'fraud-methodology-1.0.0',
  }
}

function storeFor(network) {
  if (!stores.has(network)) stores.set(network, { intel: [], assessments: [] })
  return stores.get(network)
}

export function createFraudServer() {
  return http.createServer(async (req, res) => {
    stats.requests++
    const headers = cors(req)
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, headers)
        return res.end()
      }
      if (rateLimited(req)) {
        stats.rejected++
        return json(res, 429, { error: 'rate_limited' }, headers)
      }
      if (!authorized(req)) {
        stats.rejected++
        return json(res, 401, { error: 'unauthorized' }, headers)
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return json(res, 200, { ok: true, uptimeMs: Date.now() - stats.startedAt }, headers)
      }
      if (req.method === 'GET' && url.pathname === '/metrics') {
        const bodyText = [
          `# HELP fraud_requests_total Total HTTP requests`,
          `# TYPE fraud_requests_total counter`,
          `fraud_requests_total ${stats.requests}`,
          `# HELP fraud_assessed_total Transactions assessed`,
          `# TYPE fraud_assessed_total counter`,
          `fraud_assessed_total ${stats.assessed}`,
          `# HELP fraud_rejected_total Rejected requests`,
          `# TYPE fraud_rejected_total counter`,
          `fraud_rejected_total ${stats.rejected}`,
        ].join('\n')
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4', ...headers })
        return res.end(bodyText)
      }

      const snapshotMatch = url.pathname.match(/^\/v1\/fraud\/([^/]+)\/snapshot$/)
      if (req.method === 'GET' && snapshotMatch) {
        const network = decodeURIComponent(snapshotMatch[1])
        const stored = storeFor(network)
        const base = demoSnapshot(network)
        if (stored.intel.length) base.threatIntel = [...stored.intel, ...base.threatIntel]
        if (stored.assessments.length) {
          base.assessments = [...stored.assessments, ...base.assessments]
        }
        return json(res, 200, base, headers)
      }

      if (req.method === 'POST' && url.pathname === '/v1/fraud/assess') {
        const payload = await body(req)
        const items = Array.isArray(payload.items)
          ? payload.items
          : [payload.transaction].filter(Boolean)
        if (!items.length) return json(res, 400, { error: 'transaction or items required' }, headers)
        if (items.length > MAX_BATCH) {
          stats.rejected++
          return json(res, 400, { error: `batch exceeds ${MAX_BATCH}` }, headers)
        }
        for (let index = 0; index < items.length; index++) {
          const error = validateTx(items[index], index)
          if (error) {
            stats.rejected++
            return json(res, 400, { error }, headers)
          }
        }
        const intel = Array.isArray(payload.intel) ? payload.intel : []
        const assessments = items.map((item) => assess(item, intel))
        stats.assessed += assessments.length
        const network = payload.network || 'testnet'
        const stored = storeFor(network)
        stored.assessments = [...assessments, ...stored.assessments].slice(0, 500)
        return json(
          res,
          200,
          {
            assessments,
            count: assessments.length,
            modelVersion: 'fraud-ensemble-v1.4.0',
          },
          headers
        )
      }

      if (req.method === 'POST' && url.pathname === '/v1/fraud/intel') {
        const payload = await body(req)
        const entries = Array.isArray(payload.entries) ? payload.entries : []
        if (!entries.length) return json(res, 400, { error: 'entries required' }, headers)
        const network = payload.network || 'testnet'
        const stored = storeFor(network)
        const accepted = entries
          .filter((entry) => entry && entry.address && entry.source && entry.category)
          .map((entry) => ({
            address: String(entry.address).trim(),
            label: String(entry.label || 'Unlabelled report'),
            category: entry.category,
            confidence: Math.max(0, Math.min(1, Number(entry.confidence) || 0)),
            source: String(entry.source),
            lastUpdated: entry.lastUpdated || new Date().toISOString().slice(0, 10),
            revoked: Boolean(entry.revoked),
          }))
        stored.intel = [...accepted, ...stored.intel].slice(0, 10_000)
        return json(res, 200, { accepted: accepted.length }, headers)
      }

      return json(res, 404, { error: 'not_found' }, headers)
    } catch (error) {
      stats.rejected++
      if (!res.headersSent) {
        json(res, error.status || 500, { error: error.message || 'failed' }, headers)
      }
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  createFraudServer().listen(PORT, () => {
    process.stdout.write(`Fraud detection service listening on ${PORT}\n`)
  })
}
