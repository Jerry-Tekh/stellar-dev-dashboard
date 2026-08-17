// tests/unit/lib/stellar.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as stellar from '../../../src/lib/stellar'
import type { NetworkName } from '../../../src/lib/stellar'
import * as StellarSdk from '@stellar/stellar-sdk'

// Mock Stellar SDK classes
vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk')
  class MockHorizonServer {
    constructor(public url: string, public options?: any) {}
  }
  // Shared across instances (getServer() constructs a fresh instance per call),
  // so tests can configure behavior via createMockServer() before invoking stellar.ts.
  MockHorizonServer.prototype.loadAccount = vi.fn()
  MockHorizonServer.prototype.transactions = vi.fn(function (this: any) { return this })
  MockHorizonServer.prototype.operations = vi.fn(function (this: any) { return this })
  MockHorizonServer.prototype.ledgers = vi.fn(function (this: any) { return this })
  MockHorizonServer.prototype.feeStats = vi.fn()
  // chainable methods
  MockHorizonServer.prototype.forAccount = vi.fn(function (this: any) { return this })
  MockHorizonServer.prototype.order = vi.fn(function (this: any) { return this })
  MockHorizonServer.prototype.limit = vi.fn(function (this: any) { return this })
  MockHorizonServer.prototype.cursor = vi.fn(function (this: any) { return this })
  MockHorizonServer.prototype.call = vi.fn()
  MockHorizonServer.prototype.stream = vi.fn()
  return {
    ...actual,
    Horizon: { Server: MockHorizonServer },
    SorobanRpc: { Server: MockHorizonServer },
    xdr: actual.xdr,
    Networks: actual.Networks,
  }
})

// Helper mock server
function createMockServer() {
  const server: any = new (StellarSdk as any).Horizon.Server('https://example.com')
  return server
}

beforeEach(() => {
  // Reset cache and shared SDK mock call history between tests
  stellar.clearCache()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchAccount', () => {
  it('should return account data from Horizon server', async () => {
    const mockAccount = { account_id: 'GABC', balances: [] }
    const mockServer = createMockServer()
    mockServer.loadAccount.mockResolvedValueOnce(mockAccount)

    const result = await stellar.fetchAccount('GABC', 'testnet')
    expect(result).toBe(mockAccount)
    expect(mockServer.loadAccount).toHaveBeenCalledOnce()
  })

  it('should cache account data and not call server again', async () => {
    const mockAccount = { account_id: 'GXYZ', balances: [] }
    const mockServer = createMockServer()
    mockServer.loadAccount.mockResolvedValueOnce(mockAccount)

    const first = await stellar.fetchAccount('GXYZ')
    const second = await stellar.fetchAccount('GXYZ')
    expect(first).toBe(mockAccount)
    expect(second).toBe(mockAccount)
    expect(mockServer.loadAccount).toHaveBeenCalledOnce()
  })

  it('should propagate errors from server', async () => {
    const mockServer = createMockServer()
    mockServer.loadAccount.mockRejectedValueOnce(new Error('network error'))

    await expect(stellar.fetchAccount('GFAIL')).rejects.toThrow('network error')
  })
})

describe('fetchXLMPrice', () => {
  const originalFetch = global.fetch
  beforeEach(() => {
    stellar.clearCache()
  })
  afterEach(() => {
    // @ts-ignore
    global.fetch = originalFetch
  })

  it('fetches price from CoinGecko and caches result', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ stellar: { usd: 0.123 } }),
    }
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue(mockResponse)

    const price = await stellar.fetchXLMPrice()
    expect(price).toEqual({ usd: 0.123, source: 'coingecko' })
    expect(global.fetch).toHaveBeenCalledOnce()
    // Call again to test cache
    const cached = await stellar.fetchXLMPrice()
    expect(cached).toBe(price)
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('throws when response is not ok', async () => {
    const mockResponse = { ok: false, status: 500 }
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue(mockResponse)
    await expect(stellar.fetchXLMPrice()).rejects.toThrow('XLM price request failed')
  })

  it('throws when USD price is not a finite number', async () => {
    const mockResponse = { ok: true, json: async () => ({ stellar: { usd: null } }) }
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue(mockResponse)
    await expect(stellar.fetchXLMPrice()).rejects.toThrow('XLM price data unavailable')
  })
})

describe('getOperationLabel', () => {
  it('returns known label', () => {
    expect(stellar.getOperationLabel('payment')).toBe('Payment')
  })
  it('fallbacks to title case for unknown types', () => {
    expect(stellar.getOperationLabel('custom_op')).toBe('Custom Op')
  })
})
