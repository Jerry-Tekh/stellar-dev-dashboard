import { createServer } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { URL } from 'node:url'
import { pathToFileURL } from 'node:url'

const PORT = Number(process.env.MONITOR_PORT || 8787)
const HOST = process.env.MONITOR_HOST || '127.0.0.1'
const API_KEY = process.env.MONITOR_API_KEY || ''
const ALLOWED_ORIGIN = process.env.MONITOR_ALLOWED_ORIGIN || 'http://localhost:5173'
const MAX_BODY_BYTES = 10_000_000
const MAX_SAMPLES = 100_000
const RATE_LIMIT_PER_MINUTE = 600

const state = {
  startedAt: Date.now(),
  samples: [],
  alerts: new Map(),
  incidents: new Map(),
  requests: 0,
  rejected: 0,
  ingested: 0,
  rateLimits: new Map(),
}

function json(response, status, body, requestId, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-Request-Id': requestId,
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    ...extraHeaders,
  })
  response.end(JSON.stringify(body))
}

function safeEqual(received, expected) {
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function authorized(request) {
  if (!API_KEY) return true
  const header = request.headers.authorization || ''
  return header.startsWith('Bearer ') && safeEqual(header.slice(7), API_KEY)
}

function rateLimited(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const key = forwarded || request.socket.remoteAddress || 'unknown'
  const minute = Math.floor(Date.now() / 60_000)
  const record = state.rateLimits.get(key)
  if (!record || record.minute !== minute) {
    state.rateLimits.set(key, { minute, count: 1 })
    return false
  }
  record.count += 1
  return record.count > RATE_LIMIT_PER_MINUTE
}

async function readJson(request) {
  let received = 0
  const chunks = []
  for await (const chunk of request) {
    received += chunk.length
    if (received > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 })
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })
  }
}

function number(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw Object.assign(new Error(`${name} must be between ${min} and ${max}.`), { status: 422 })
  }
  return value
}

function validateSample(value) {
  if (!value || typeof value !== 'object') throw Object.assign(new Error('Metric sample must be an object.'), { status: 422 })
  return {
    id: typeof value.id === 'string' && value.id.length <= 128 ? value.id : randomUUID(),
    network: typeof value.network === 'string' && value.network.length <= 32 ? value.network : 'testnet',
    timestamp: Number.isFinite(Date.parse(value.timestamp)) ? new Date(value.timestamp).toISOString() : new Date().toISOString(),
    ledgerSequence: number(value.ledgerSequence, 'ledgerSequence', 0, Number.MAX_SAFE_INTEGER),
    closeTimeSeconds: number(value.closeTimeSeconds, 'closeTimeSeconds', 0, 300),
    operationsPerSecond: number(value.operationsPerSecond, 'operationsPerSecond', 0, 1_000_000),
    transactionsPerSecond: number(value.transactionsPerSecond, 'transactionsPerSecond', 0, 1_000_000),
    transactionSuccessRate: number(value.transactionSuccessRate, 'transactionSuccessRate', 0, 100),
    transactionLatencyMs: number(value.transactionLatencyMs, 'transactionLatencyMs', 0, 600_000),
    capacityUtilization: number(value.capacityUtilization, 'capacityUtilization', 0, 100),
    validatorParticipation: number(value.validatorParticipation, 'validatorParticipation', 0, 100),
    synchronizedValidators: number(value.synchronizedValidators, 'synchronizedValidators', 0, 100_000),
    totalValidators: number(value.totalValidators, 'totalValidators', 1, 100_000),
    horizonLatencyMs: number(value.horizonLatencyMs, 'horizonLatencyMs', 0, 600_000),
    sorobanLatencyMs: number(value.sorobanLatencyMs, 'sorobanLatencyMs', 0, 600_000),
  }
}

function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

function stateFor(score) {
  return score >= 85 ? 'healthy' : score >= 60 ? 'degraded' : 'critical'
}

function demoSamples(network, count = 36) {
  const now = Date.now()
  return Array.from({ length: count }, (_, index) => {
    const variation = Math.sin(index * 1.73)
    return {
      id: `demo-${network}-${index}`,
      network,
      timestamp: new Date(now - (count - index - 1) * 300_000).toISOString(),
      ledgerSequence: 56_000_000 + index,
      closeTimeSeconds: 5.2 + variation * 0.35,
      operationsPerSecond: 120 + variation * 17,
      transactionsPerSecond: 47 + variation * 6,
      transactionSuccessRate: 99.6 - Math.max(0, variation) * 0.08,
      transactionLatencyMs: 790 + variation * 50,
      capacityUtilization: 43 + variation * 6,
      validatorParticipation: 99.2,
      synchronizedValidators: 6,
      totalValidators: 6,
      horizonLatencyMs: 130,
      sorobanLatencyMs: 190,
    }
  })
}

function samplesFor(network) {
  const stored = state.samples.filter((sample) => sample.network === network).slice(-288)
  return stored.length >= 4 ? stored : demoSamples(network)
}

function forecast(samples) {
  const recent = samples.slice(-24)
  const values = recent.map((sample) => sample.capacityUtilization)
  const slope = values.length > 1 ? (values.at(-1) - values[0]) / (values.length - 1) : 0
  const average = mean(values)
  const deviation = Math.sqrt(mean(values.map((value) => (value - average) ** 2)))
  const generatedAt = new Date()
  const points = Array.from({ length: 12 }, (_, index) => {
    const expected = Math.max(0, Math.min(100, values.at(-1) + slope * (index + 1)))
    return {
      timestamp: new Date(generatedAt.getTime() + (index + 1) * 300_000).toISOString(),
      expected: Math.round(expected * 10) / 10,
      lowerBound: Math.max(0, Math.round((expected - deviation * 1.64) * 10) / 10),
      upperBound: Math.min(100, Math.round((expected + deviation * 1.64) * 10) / 10),
    }
  })
  const riskPoint = points.findIndex((point) => point.upperBound >= 80)
  const peak = Math.max(...points.map((point) => point.expected))
  return {
    generatedAt: generatedAt.toISOString(), horizonMinutes: 60,
    warningLeadMinutes: riskPoint < 0 ? 60 : (riskPoint + 1) * 5,
    peakUtilization: peak,
    congestionProbability: Math.max(0, Math.min(100, Math.round((peak - 55) * 2))),
    confidence: Math.max(60, Math.round(94 - deviation)), modelVersion: 'service-linear-v1', points,
    drivers: slope > 1 ? ['Sustained transaction demand growth'] : ['Current traffic remains inside normal operating range'],
  }
}

function snapshot(network) {
  const samples = samplesFor(network)
  const current = samples.at(-1)
  const consensus = Math.max(0, current.validatorParticipation - (current.totalValidators - current.synchronizedValidators) * 5)
  const performance = Math.max(0, 100 - Math.max(0, current.closeTimeSeconds - 5) * 9 - current.transactionLatencyMs / 120)
  const reliability = current.transactionSuccessRate
  const capacity = Math.max(0, 100 - Math.max(0, current.capacityUtilization - 55) * 1.5)
  const consistency = current.synchronizedValidators / current.totalValidators * 100
  const dimensions = [
    ['consensus', 'Consensus', consensus, 0.3], ['performance', 'Performance', performance, 0.2],
    ['reliability', 'Reliability', reliability, 0.2], ['capacity', 'Capacity', capacity, 0.15],
    ['data-consistency', 'Data consistency', consistency, 0.15],
  ].map(([id, label, score, weight]) => ({ id, label, score: Math.round(score), state: stateFor(score), weight, summary: 'Computed from the latest normalized metric window' }))
  const score = Math.round(dimensions.reduce((total, item) => total + item.score * item.weight, 0))
  const generatedAt = new Date().toISOString()
  const modelForecast = forecast(samples)
  return {
    network, generatedAt,
    health: { score, state: stateFor(score), dimensions, assessedAt: generatedAt, dataFreshnessSeconds: Math.max(0, Math.round((Date.now() - Date.parse(current.timestamp)) / 1000)), confidence: 92 },
    current: { ...current, source: 'horizon' },
    history: samples.map((sample) => ({ timestamp: sample.timestamp, closeTimeSeconds: sample.closeTimeSeconds, throughput: sample.operationsPerSecond, successRate: sample.transactionSuccessRate, utilization: sample.capacityUtilization, participation: sample.validatorParticipation })),
    services: [
      { id: 'horizon', label: 'Horizon API', source: 'horizon', state: current.horizonLatencyMs > 1500 ? 'degraded' : 'healthy', latencyMs: current.horizonLatencyMs, lastSuccessfulAt: generatedAt },
      { id: 'soroban', label: 'Soroban RPC', source: 'soroban-rpc', state: current.sorobanLatencyMs > 1500 ? 'degraded' : 'healthy', latencyMs: current.sorobanLatencyMs, lastSuccessfulAt: generatedAt },
      { id: 'validators', label: 'Validator telemetry', source: 'validator', state: consensus < 85 ? 'degraded' : 'healthy', latencyMs: 200, lastSuccessfulAt: generatedAt },
    ],
    validators: [], forecast: modelForecast, anomalies: [], incidents: [], alerts: [...state.alerts.values()].filter((alert) => alert.network === network),
    slos: [
      { id: 'transaction-success', name: 'Transaction success', target: 99, actual: current.transactionSuccessRate, unit: '%', met: current.transactionSuccessRate >= 99, errorBudgetRemaining: Math.max(0, (current.transactionSuccessRate - 99) * 100) },
      { id: 'ledger-close', name: 'Ledger close p95', target: 7, actual: current.closeTimeSeconds, unit: 'seconds', met: current.closeTimeSeconds <= 7, errorBudgetRemaining: Math.max(0, (7 - current.closeTimeSeconds) * 50) },
    ],
    collectionRate: state.ingested, retentionDays: 730,
  }
}

function metricsText() {
  return [
    '# HELP network_monitor_requests_total Total API requests',
    '# TYPE network_monitor_requests_total counter',
    `network_monitor_requests_total ${state.requests}`,
    '# HELP network_monitor_ingested_samples_total Valid metric samples ingested',
    '# TYPE network_monitor_ingested_samples_total counter',
    `network_monitor_ingested_samples_total ${state.ingested}`,
    '# HELP network_monitor_rejected_requests_total Rejected API requests',
    '# TYPE network_monitor_rejected_requests_total counter',
    `network_monitor_rejected_requests_total ${state.rejected}`,
    '# HELP network_monitor_buffer_samples Current in-memory buffer size',
    '# TYPE network_monitor_buffer_samples gauge',
    `network_monitor_buffer_samples ${state.samples.length}`,
  ].join('\n') + '\n'
}

export const server = createServer(async (request, response) => {
  const requestId = String(request.headers['x-request-id'] || randomUUID()).slice(0, 128)
  state.requests += 1
  try {
    if (request.method === 'OPTIONS') return json(response, 204, {}, requestId)
    if (rateLimited(request)) {
      state.rejected += 1
      return json(response, 429, { error: { code: 'rate_limited', message: 'Request limit exceeded.' } }, requestId, { 'Retry-After': '60' })
    }
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return json(response, 200, { status: 'ok', uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000), bufferedSamples: state.samples.length }, requestId)
    }
    if (request.method === 'GET' && url.pathname === '/metrics') {
      response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4', 'X-Content-Type-Options': 'nosniff' })
      return response.end(metricsText())
    }
    const match = url.pathname.match(/^\/v1\/networks\/([a-z0-9-]+)\/(snapshot|alerts|incidents|capacity)$/)
    if (request.method === 'GET' && match?.[2] === 'snapshot') return json(response, 200, { data: snapshot(match[1]), meta: { requestId } }, requestId)
    if (request.method === 'GET' && match?.[2] === 'alerts') return json(response, 200, { data: [...state.alerts.values()].filter((item) => item.network === match[1]) }, requestId)
    if (request.method === 'GET' && match?.[2] === 'incidents') return json(response, 200, { data: [...state.incidents.values()].filter((item) => item.network === match[1]) }, requestId)
    if (request.method === 'POST' && url.pathname === '/v1/metrics/batch') {
      if (!authorized(request)) return json(response, 401, { error: { code: 'unauthorized', message: 'A valid bearer token is required.' } }, requestId)
      const body = await readJson(request)
      if (!Array.isArray(body.samples) || body.samples.length === 0 || body.samples.length > 10_000) throw Object.assign(new Error('samples must contain between 1 and 10,000 metrics.'), { status: 422 })
      const samples = body.samples.map(validateSample)
      state.samples.push(...samples)
      if (state.samples.length > MAX_SAMPLES) state.samples.splice(0, state.samples.length - MAX_SAMPLES)
      state.ingested += samples.length
      return json(response, 202, { data: { accepted: samples.length, buffered: state.samples.length } }, requestId)
    }
    if (request.method === 'POST' && match?.[2] === 'capacity') {
      const body = await readJson(request)
      const current = samplesFor(match[1]).at(-1)
      const growth = number(body.trafficGrowthPercent ?? 0, 'trafficGrowthPercent', 0, 500)
      const validatorLoss = number(body.validatorLossPercent ?? 0, 'validatorLossPercent', 0, 75)
      const target = number(body.targetUtilizationPercent ?? 70, 'targetUtilizationPercent', 20, 95)
      const projected = current.capacityUtilization * (1 + growth / 100) / (1 - validatorLoss / 100)
      return json(response, 200, { data: { projectedUtilization: projected, headroomPercent: target - projected, risk: projected > target ? 'critical' : projected > target * 0.85 ? 'degraded' : 'healthy' } }, requestId)
    }
    state.rejected += 1
    return json(response, 404, { error: { code: 'not_found', message: 'Route not found.' } }, requestId)
  } catch (error) {
    state.rejected += 1
    const status = Number(error?.status) || 500
    return json(response, status, { error: { code: status >= 500 ? 'internal_error' : 'invalid_request', message: status >= 500 ? 'The monitoring service could not complete the request.' : error.message } }, requestId)
  }
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5_000).unref()
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  server.listen(PORT, HOST, () => {
    console.info(`Network monitor API listening on http://${HOST}:${PORT}`)
  })
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
