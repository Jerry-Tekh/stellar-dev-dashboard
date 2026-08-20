import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearMonitoringCache,
  createDemonstrationSnapshot,
  getNetworkIntelligenceSnapshot,
  NetworkMonitoringError,
  updateAlertStatus,
} from './client'

function ledgerPage(count = 36) {
  const now = new Date('2026-08-20T12:00:00.000Z').getTime()
  return {
    _embedded: {
      records: Array.from({ length: count }, (_, index) => ({
        id: `ledger-${index}`,
        sequence: 56_000_000 + index,
        closed_at: new Date(now - index * 5_000).toISOString(),
        successful_transaction_count: 90 + index,
        failed_transaction_count: index % 8 === 0 ? 1 : 0,
        operation_count: 410 + index * 2,
        protocol_version: 22,
      })),
    },
  }
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('network intelligence client', () => {
  beforeEach(() => {
    clearMonitoringCache()
    vi.restoreAllMocks()
  })

  it('collects and analyzes selected-network endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/ledgers?')) return okJson(ledgerPage())
      if (init?.method === 'POST') return okJson({ jsonrpc: '2.0', id: 1, result: { status: 'healthy' } })
      return okJson({ horizon_version: '2.32.0' })
    })

    const response = await getNetworkIntelligenceSnapshot('testnet', { allowStale: false })
    expect(response.cached).toBe(false)
    expect(response.data.network).toBe('testnet')
    expect(response.data.history).toHaveLength(36)
    expect(response.data.current.ledgerSequence).toBe(56_000_035)
    expect(response.data.health.dimensions).toHaveLength(5)
    expect(response.data.forecast.points).toHaveLength(12)
    expect(response.data.services.map((service) => service.source)).toEqual([
      'horizon',
      'soroban-rpc',
      'validator',
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('horizon-testnet.stellar.org/ledgers'),
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })

  it('returns a fresh cache entry without another network request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('/ledgers?')) return okJson(ledgerPage())
      if (init?.method === 'POST') return okJson({ result: { status: 'healthy' } })
      return okJson({ status: 'healthy' })
    })
    await getNetworkIntelligenceSnapshot('testnet')
    const calls = fetchMock.mock.calls.length
    const cached = await getNetworkIntelligenceSnapshot('testnet')
    expect(cached.cached).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  })

  it('uses stale validated data during a transient refresh failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('/ledgers?')) return okJson(ledgerPage())
      if (init?.method === 'POST') return okJson({ result: { status: 'healthy' } })
      return okJson({ status: 'healthy' })
    })
    const initial = await getNetworkIntelligenceSnapshot('testnet')
    fetchMock.mockRejectedValue(new Error('gateway offline'))

    const fallback = await getNetworkIntelligenceSnapshot('testnet', { force: true })
    expect(fallback.cached).toBe(true)
    expect(fallback.data.generatedAt).toBe(initial.data.generatedAt)
  })

  it('returns a diagnostic error when no stale data exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network offline'))
    await expect(getNetworkIntelligenceSnapshot('mainnet', { allowStale: false })).rejects.toMatchObject({
      name: 'NetworkMonitoringError',
      code: 'unavailable',
      retryable: true,
      requestId: expect.any(String),
    })
  })

  it('rejects a custom network without a Horizon endpoint', async () => {
    await expect(getNetworkIntelligenceSnapshot('custom', { allowStale: false })).rejects.toEqual(
      expect.objectContaining({
        code: 'unavailable',
        retryable: false,
        message: expect.stringContaining('Configure a Horizon endpoint'),
      }),
    )
  })

  it('rejects insufficient ledger history as an invalid response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('/ledgers?')) return okJson(ledgerPage(1))
      if (init?.method === 'POST') return okJson({ result: { status: 'healthy' } })
      return okJson({ status: 'healthy' })
    })
    await expect(getNetworkIntelligenceSnapshot('futurenet', { allowStale: false })).rejects.toMatchObject({
      code: 'invalid-response',
      retryable: true,
    })
  })
})

describe('demonstration snapshot and alert state', () => {
  it('labels a simulated incident with actionable anomalies', () => {
    const snapshot = createDemonstrationSnapshot('testnet', true, new Date('2026-08-20T12:00:00Z'))
    expect(snapshot.network).toBe('testnet')
    expect(snapshot.anomalies.length).toBeGreaterThan(0)
    expect(snapshot.incidents).toHaveLength(1)
    expect(snapshot.alerts.length).toBeGreaterThan(0)
    expect(snapshot.validators.some((validator) => validator.status === 'critical')).toBe(true)
    expect(snapshot.services.some((service) => service.state === 'degraded')).toBe(true)
  })

  it('creates a healthy demonstration snapshot by default', () => {
    const snapshot = createDemonstrationSnapshot('mainnet', false, new Date('2026-08-20T12:00:00Z'))
    expect(snapshot.health.state).toBe('healthy')
    expect(snapshot.retentionDays).toBe(730)
    expect(snapshot.collectionRate).toBeGreaterThanOrEqual(10_000)
  })

  it('updates only the requested alert status', () => {
    const snapshot = createDemonstrationSnapshot('testnet', true, new Date('2026-08-20T12:00:00Z'))
    const target = snapshot.alerts[0]
    const other = snapshot.alerts[1]
    const updated = updateAlertStatus(snapshot.alerts, target.id, 'acknowledged')
    expect(updated.find((alert) => alert.id === target.id)?.status).toBe('acknowledged')
    if (other) expect(updated.find((alert) => alert.id === other.id)?.status).toBe(other.status)
    expect(snapshot.alerts[0].status).toBe('active')
  })

  it('exposes structured errors to callers without sensitive context', () => {
    const error = new NetworkMonitoringError({
      code: 'timeout',
      message: 'Source timed out.',
      retryable: true,
      requestId: 'safe-request-id',
    })
    expect(error).toBeInstanceOf(Error)
    expect(error).toEqual(expect.objectContaining({
      name: 'NetworkMonitoringError',
      code: 'timeout',
      retryable: true,
      requestId: 'safe-request-id',
    }))
    expect(JSON.stringify(error)).not.toContain('Authorization')
  })
})
