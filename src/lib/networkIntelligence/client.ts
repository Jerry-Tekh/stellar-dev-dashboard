import { NETWORKS, type NetworkName } from '../stellar'
import type {
  IntelligentAlert,
  MonitoringApiError,
  NetworkIntelligenceSnapshot,
  ServiceStatus,
  SnapshotResponse,
} from '../../types/networkIntelligence'
import {
  assessNetworkHealth,
  buildIncident,
  calculateSlos,
  detectNetworkAnomalies,
  forecastCongestion,
  groupAlerts,
} from './analysis'
import {
  createDemoHistory,
  createDemoServices,
  createDemoValidators,
  currentFromHistory,
  ledgersToMetricHistory,
  validatorsFromLedgerContinuity,
  type HorizonLedgerRecord,
} from './fixtures'

const CACHE_TTL_MS = 15_000
const DEFAULT_TIMEOUT_MS = 8_000
const MAX_RETRIES = 2

interface HorizonLedgerPage {
  _embedded?: { records?: HorizonLedgerRecord[] }
}

interface CacheEntry {
  snapshot: NetworkIntelligenceSnapshot
  storedAt: number
}

const cache = new Map<string, CacheEntry>()

export class NetworkMonitoringError extends Error implements MonitoringApiError {
  code: MonitoringApiError['code']
  retryable: boolean
  requestId?: string

  constructor(error: MonitoringApiError) {
    super(error.message)
    this.name = 'NetworkMonitoringError'
    this.code = error.code
    this.retryable = error.retryable
    this.requestId = error.requestId
  }
}

function requestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `monitor-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isSnapshot(value: unknown): value is NetworkIntelligenceSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<NetworkIntelligenceSnapshot>
  return Boolean(
    snapshot.generatedAt &&
    snapshot.current &&
    snapshot.health &&
    Array.isArray(snapshot.history) &&
    Array.isArray(snapshot.validators) &&
    Array.isArray(snapshot.alerts),
  )
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal?.aborted) abortFromParent()
  parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  const timeout = window.setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (parentSignal?.aborted) {
      throw new NetworkMonitoringError({ code: 'aborted', message: 'Monitoring request was cancelled.', retryable: false })
    }
    if (controller.signal.aborted) {
      throw new NetworkMonitoringError({ code: 'timeout', message: 'Monitoring source did not respond in time.', retryable: true })
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }
}

async function retry<T>(operation: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (error instanceof NetworkMonitoringError && !error.retryable) throw error
      if (attempt < retries) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * 2 ** attempt))
      }
    }
  }
  throw lastError
}

function headersFor(network: NetworkName): HeadersInit {
  const config = NETWORKS[network]
  return { Accept: 'application/json', ...(config.headers ?? {}), ...(config.customHeaders ?? {}) }
}

async function probeService(
  id: string,
  label: string,
  source: ServiceStatus['source'],
  url: string | undefined,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<ServiceStatus> {
  const started = performance.now()
  if (!url) {
    return { id, label, source, state: 'unknown', latencyMs: null, error: 'Endpoint is not configured' }
  }
  try {
    const response = await fetchWithTimeout(url, {
      method: source === 'soroban-rpc' ? 'POST' : 'GET',
      headers: source === 'soroban-rpc'
        ? { ...headersFor(network), 'Content-Type': 'application/json' }
        : headersFor(network),
      body: source === 'soroban-rpc'
        ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
        : undefined,
    }, 4_000, signal)
    const latencyMs = Math.round(performance.now() - started)
    return {
      id,
      label,
      source,
      state: response.ok ? latencyMs > 1_500 ? 'degraded' : 'healthy' : 'critical',
      latencyMs,
      lastSuccessfulAt: response.ok ? new Date().toISOString() : undefined,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      id,
      label,
      source,
      state: 'critical',
      latencyMs: null,
      error: error instanceof Error ? error.message : 'Probe failed',
    }
  }
}

async function collectDirect(
  network: NetworkName,
  signal?: AbortSignal,
): Promise<NetworkIntelligenceSnapshot> {
  const config = NETWORKS[network]
  if (!config.horizonUrl) {
    throw new NetworkMonitoringError({
      code: 'unavailable',
      message: 'Configure a Horizon endpoint before opening Network Intelligence.',
      retryable: false,
    })
  }

  const started = performance.now()
  const ledgerRequest = retry(async () => {
    const response = await fetchWithTimeout(
      `${config.horizonUrl}/ledgers?order=desc&limit=36`,
      { headers: headersFor(network) },
      DEFAULT_TIMEOUT_MS,
      signal,
    )
    if (response.status === 429) {
      throw new NetworkMonitoringError({ code: 'rate-limited', message: 'Horizon rate limit reached.', retryable: true })
    }
    if (!response.ok) {
      throw new NetworkMonitoringError({
        code: 'unavailable',
        message: `Horizon returned HTTP ${response.status}.`,
        retryable: response.status >= 500,
      })
    }
    return response.json() as Promise<HorizonLedgerPage>
  })

  const [ledgerPage, horizonService, sorobanService] = await Promise.all([
    ledgerRequest,
    probeService('horizon', 'Horizon API', 'horizon', config.horizonUrl, network, signal),
    probeService('soroban', 'Soroban RPC', 'soroban-rpc', config.sorobanUrl, network, signal),
  ])
  const records = ledgerPage._embedded?.records ?? []
  const history = ledgersToMetricHistory(records)
  if (history.length < 2) {
    throw new NetworkMonitoringError({
      code: 'invalid-response',
      message: 'Horizon returned insufficient ledger history for analysis.',
      retryable: true,
    })
  }

  const now = new Date()
  const validators = validatorsFromLedgerContinuity(history, now)
  const validatorService: ServiceStatus = {
    id: 'validator-model',
    label: 'Validator model',
    source: 'validator',
    state: 'healthy',
    latencyMs: Math.round(performance.now() - started),
    lastSuccessfulAt: now.toISOString(),
  }
  const services = [horizonService, sorobanService, validatorService]
  const newestRecord = [...records].sort((left, right) => Number(right.sequence) - Number(left.sequence))[0]
  const current = currentFromHistory(history, validators, services, Number(newestRecord?.sequence ?? 0))
  const health = assessNetworkHealth(current, validators, now)
  const forecast = forecastCongestion(history, 60, 5, now)
  const anomalies = detectNetworkAnomalies(current, history, validators, now)
  const alerts = groupAlerts(anomalies, forecast, [], now)
  const incident = buildIncident(anomalies, now)
  return {
    network,
    generatedAt: now.toISOString(),
    health,
    current,
    history,
    services,
    validators,
    forecast,
    anomalies,
    incidents: incident ? [incident] : [],
    alerts,
    slos: calculateSlos(history, current),
    collectionRate: Math.round(records.length / Math.max(1, (performance.now() - started) / 1_000)),
    retentionDays: 730,
  }
}

async function collectFromMonitoringApi(
  baseUrl: string,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<NetworkIntelligenceSnapshot> {
  const id = requestId()
  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/v1/networks/${encodeURIComponent(network)}/snapshot`,
    { headers: { Accept: 'application/json', 'X-Request-Id': id } },
    DEFAULT_TIMEOUT_MS,
    signal,
  )
  if (!response.ok) {
    throw new NetworkMonitoringError({
      code: response.status === 429 ? 'rate-limited' : 'unavailable',
      message: `Monitoring API returned HTTP ${response.status}.`,
      retryable: response.status === 429 || response.status >= 500,
      requestId: response.headers.get('X-Request-Id') ?? id,
    })
  }
  const body = await response.json() as { data?: unknown }
  if (!isSnapshot(body.data)) {
    throw new NetworkMonitoringError({
      code: 'invalid-response',
      message: 'Monitoring API returned an invalid snapshot.',
      retryable: false,
      requestId: response.headers.get('X-Request-Id') ?? id,
    })
  }
  return body.data
}

export interface SnapshotOptions {
  signal?: AbortSignal
  force?: boolean
  allowStale?: boolean
}

export async function getNetworkIntelligenceSnapshot(
  network: NetworkName,
  options: SnapshotOptions = {},
): Promise<SnapshotResponse> {
  const id = requestId()
  const cached = cache.get(network)
  if (!options.force && cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    return { data: cached.snapshot, requestId: id, cached: true }
  }

  try {
    const monitoringApi = String(import.meta.env.VITE_NETWORK_MONITOR_API ?? '').trim()
    const snapshot = monitoringApi
      ? await collectFromMonitoringApi(monitoringApi, network, options.signal)
      : await collectDirect(network, options.signal)
    cache.set(network, { snapshot, storedAt: Date.now() })
    return { data: snapshot, requestId: id, cached: false }
  } catch (error) {
    if (options.allowStale !== false && cached) {
      return { data: cached.snapshot, requestId: id, cached: true }
    }
    if (error instanceof NetworkMonitoringError) {
      error.requestId = error.requestId ?? id
      throw error
    }
    throw new NetworkMonitoringError({
      code: 'unavailable',
      message: error instanceof Error ? error.message : 'Monitoring sources are unavailable.',
      retryable: true,
      requestId: id,
    })
  }
}

export function createDemonstrationSnapshot(
  network: NetworkName,
  incident = false,
  now = new Date(),
): NetworkIntelligenceSnapshot {
  const history = createDemoHistory(now, 36, incident)
  const validators = createDemoValidators(now, incident)
  const services = createDemoServices(now, incident)
  const current = currentFromHistory(history, validators, services)
  const health = assessNetworkHealth(current, validators, now)
  const forecast = forecastCongestion(history, 60, 5, now)
  const anomalies = detectNetworkAnomalies(current, history, validators, now)
  const alerts = groupAlerts(anomalies, forecast, [], now)
  const incidentRecord = buildIncident(anomalies, now)
  return {
    network,
    generatedAt: now.toISOString(),
    health,
    current,
    history,
    services,
    validators,
    forecast,
    anomalies,
    incidents: incidentRecord ? [incidentRecord] : [],
    alerts,
    slos: calculateSlos(history, current),
    collectionRate: 10_240,
    retentionDays: 730,
  }
}

export function updateAlertStatus(
  alerts: IntelligentAlert[],
  alertId: string,
  status: IntelligentAlert['status'],
): IntelligentAlert[] {
  return alerts.map((alert) => alert.id === alertId
    ? { ...alert, status, updatedAt: new Date().toISOString() }
    : alert)
}

export function clearMonitoringCache(): void {
  cache.clear()
}
