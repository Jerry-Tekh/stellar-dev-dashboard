import type {
  FraudApiError,
  FraudSnapshot,
  FraudSnapshotResponse,
  FraudTransaction,
  ThreatIntelEntry,
} from '../../types/fraud'
import { assessTransaction, normalizeThreatIntel } from './analysis'
import { createFraudSnapshot } from './fixtures'

const CACHE_TTL = 20_000
const cache = new Map<string, { data: FraudSnapshot; storedAt: number }>()

export class FraudDetectionError extends Error implements FraudApiError {
  code: FraudApiError['code']
  retryable: boolean
  requestId?: string
  constructor(error: FraudApiError) {
    super(error.message)
    this.name = 'FraudDetectionError'
    this.code = error.code
    this.retryable = error.retryable
    this.requestId = error.requestId
  }
}

const requestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `fraud-${Date.now()}`

const isSnapshot = (value: unknown): value is FraudSnapshot =>
  Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as FraudSnapshot).assessments) &&
      (value as FraudSnapshot).summary &&
      (value as FraudSnapshot).metrics
  )

export async function getFraudSnapshot(
  network: string,
  options: {
    signal?: AbortSignal
    force?: boolean
    allowStale?: boolean
    connectedAddress?: string
  } = {}
): Promise<FraudSnapshotResponse> {
  const id = requestId()
  const cacheKey = `${network}:${options.connectedAddress || 'anon'}`
  const existing = cache.get(cacheKey)
  if (!options.force && existing && Date.now() - existing.storedAt < CACHE_TTL) {
    return { data: existing.data, requestId: id, cached: true }
  }

  const endpoint = import.meta.env.VITE_FRAUD_API_URL as string | undefined
  if (!endpoint) {
    const data = createFraudSnapshot(network, {
      connectedAddress: options.connectedAddress,
      state: 'simulation',
    })
    cache.set(cacheKey, { data, storedAt: Date.now() })
    return { data, requestId: id, cached: false }
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), 8_000)

  try {
    const response = await fetch(
      `${endpoint.replace(/\/$/, '')}/v1/fraud/${encodeURIComponent(network)}/snapshot`,
      {
        headers: { Accept: 'application/json', 'X-Request-ID': id },
        signal: controller.signal,
      }
    )
    if (response.status === 429) {
      throw new FraudDetectionError({
        code: 'rate-limited',
        message: 'Fraud service rate limit reached.',
        retryable: true,
        requestId: id,
      })
    }
    if (!response.ok) {
      throw new FraudDetectionError({
        code: 'unavailable',
        message: `Fraud service returned HTTP ${response.status}.`,
        retryable: response.status >= 500,
        requestId: id,
      })
    }
    const payload: unknown = await response.json()
    if (!isSnapshot(payload)) {
      throw new FraudDetectionError({
        code: 'invalid-response',
        message: 'Fraud service returned an invalid snapshot.',
        retryable: true,
        requestId: id,
      })
    }
    const data = { ...payload, state: 'live' as const }
    cache.set(cacheKey, { data, storedAt: Date.now() })
    return { data, requestId: id, cached: false }
  } catch (error) {
    if (options.signal?.aborted) {
      throw new FraudDetectionError({
        code: 'aborted',
        message: 'Fraud request was cancelled.',
        retryable: false,
        requestId: id,
      })
    }
    if (options.allowStale && existing) {
      return {
        data: { ...existing.data, state: 'degraded' },
        requestId: id,
        cached: true,
      }
    }
    if (error instanceof FraudDetectionError) throw error
    throw new FraudDetectionError({
      code: controller.signal.aborted ? 'timeout' : 'unavailable',
      message: controller.signal.aborted
        ? 'Fraud service did not respond in time.'
        : 'Unable to load fraud intelligence.',
      retryable: true,
      requestId: id,
    })
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

export function createDemonstrationFraud(
  network: string,
  incident = false,
  connectedAddress?: string,
  now = new Date()
): FraudSnapshot {
  return createFraudSnapshot(network, {
    incident,
    connectedAddress,
    now,
    state: 'simulation',
  })
}

export function assessLocalTransaction(
  transaction: FraudTransaction,
  history: FraudTransaction[] = [],
  intel: ThreatIntelEntry[] = []
) {
  return assessTransaction(transaction, history, normalizeThreatIntel(intel))
}

export function clearFraudCache(): void {
  cache.clear()
}
