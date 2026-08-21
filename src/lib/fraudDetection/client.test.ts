import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearFraudCache,
  createDemonstrationFraud,
  FraudDetectionError,
  getFraudSnapshot,
} from './client'

describe('fraud detection client', () => {
  afterEach(() => {
    clearFraudCache()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns demonstration snapshots when no API is configured', async () => {
    const result = await getFraudSnapshot('testnet')
    expect(result.cached).toBe(false)
    expect(result.data.state).toBe('simulation')
    expect(result.data.assessments.length).toBeGreaterThan(0)
    expect(result.requestId).toBeTruthy()
  })

  it('serves cached snapshots within the TTL', async () => {
    const first = await getFraudSnapshot('testnet')
    const second = await getFraudSnapshot('testnet')
    expect(second.cached).toBe(true)
    expect(second.data.generatedAt).toBe(first.data.generatedAt)
  })

  it('creates incident demonstration data on demand', () => {
    const snapshot = createDemonstrationFraud('testnet', true)
    expect(snapshot.state).toBe('simulation')
    expect(snapshot.alerts.length).toBeGreaterThan(0)
    expect(snapshot.transactions.some((tx) => (tx.memo || '').includes('guaranteed'))).toBe(true)
  })

  it('maps HTTP failures to retryable FraudDetectionError', async () => {
    vi.stubEnv('VITE_FRAUD_API_URL', 'https://fraud.example.invalid')
    clearFraudCache()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(getFraudSnapshot('testnet', { force: true })).rejects.toMatchObject({
      name: 'FraudDetectionError',
      code: 'unavailable',
      retryable: true,
    })
  })

  it('returns stale degraded data when allowStale is set', async () => {
    const base = await getFraudSnapshot('public')
    vi.stubEnv('VITE_FRAUD_API_URL', 'https://fraud.example.invalid')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const degraded = await getFraudSnapshot('public', { force: true, allowStale: true })
    expect(degraded.cached).toBe(true)
    expect(degraded.data.state).toBe('degraded')
    expect(degraded.data.summary.modelVersion).toBe(base.data.summary.modelVersion)
  })

  it('constructs typed errors', () => {
    const error = new FraudDetectionError({
      code: 'timeout',
      message: 'too slow',
      retryable: true,
      requestId: 'abc',
    })
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('timeout')
    expect(error.requestId).toBe('abc')
  })
})
