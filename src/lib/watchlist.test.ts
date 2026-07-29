import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-in for the IndexedDB-backed storage layer, mirroring the
// pattern used by cacheManager.test.ts — persistence tests re-read through
// this same map to simulate "survives a reload" without a real IDB.
const memory = new Map<string, unknown>()
vi.mock('./storage', () => ({
  getStoredValue: vi.fn(async (key: string) => memory.get(key) ?? null),
  setStoredValue: vi.fn(async (key: string, value: unknown) => {
    memory.set(key, value)
  }),
  removeStoredValue: vi.fn(async (key: string) => {
    memory.delete(key)
  }),
}))

const { mockFetchAccount, mockFetchOperations, mockFetchPrices } = vi.hoisted(() => ({
  mockFetchAccount: vi.fn(),
  mockFetchOperations: vi.fn(),
  mockFetchPrices: vi.fn(),
}))

vi.mock('./stellar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stellar')>()
  return {
    ...actual,
    fetchAccount: mockFetchAccount,
    fetchOperations: mockFetchOperations,
  }
})

vi.mock('./priceFeed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./priceFeed')>()
  return {
    ...actual,
    fetchPrices: mockFetchPrices,
  }
})

import {
  addWatchlistEntry,
  removeWatchlistEntry,
  updateWatchlistEntry,
  loadWatchlist,
  listWatchlistTags,
  filterEntriesByTag,
  filterActivityByAddress,
  filterActivityByTag,
  fetchWatchlistBalances,
  fetchWatchlistActivity,
  type WatchlistEntry,
} from './watchlist'
import { rateLimiter } from './rateLimiter'
import { Keypair } from '@stellar/stellar-sdk'

// Real (but unfunded) keypairs — addWatchlistEntry validates the StrKey
// checksum, so hand-rolled "GAAA...” strings won't pass.
const [ADDR_A, ADDR_B, ADDR_C, ADDR_D, ADDR_E] = Array.from({ length: 5 }, () =>
  Keypair.random().publicKey(),
)

const PRICES: Record<string, { usd: number; usd_24h_change: number | null }> = {
  XLM: { usd: 0.5, usd_24h_change: null },
  USDC: { usd: 1, usd_24h_change: null },
  BTC: { usd: 50_000, usd_24h_change: null },
}

function balance(asset_type: string, balanceStr: string, code?: string, issuer?: string) {
  return { asset_type, balance: balanceStr, asset_code: code, asset_issuer: issuer }
}

function opRecord(id: string, type: string, created_at: string, extra: Record<string, unknown> = {}) {
  return { id, type, created_at, paging_token: id, ...extra }
}

beforeEach(() => {
  memory.clear()
  mockFetchAccount.mockReset()
  mockFetchOperations.mockReset()
  mockFetchPrices.mockReset()
  mockFetchPrices.mockImplementation(async (codes: string[]) => {
    const result: Record<string, { usd: number; usd_24h_change: number | null }> = {}
    for (const code of codes) if (PRICES[code]) result[code] = PRICES[code]
    return result
  })
  // Reset the shared rate limiter's bucket for the watchlist identifier so
  // tests don't leak budget consumption into one another.
  rateLimiter.reset('watchlist')
})

describe('watchlist persistence', () => {
  it('persists an added entry so a fresh load sees it (survives reload)', async () => {
    await addWatchlistEntry({ address: ADDR_A, label: 'Treasury', tags: ['treasury'] })

    // Simulate a page reload: nothing is cached in module state, so this
    // read goes straight back through the mocked storage layer.
    const reloaded = await loadWatchlist()
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]).toMatchObject({ address: ADDR_A, label: 'Treasury', tags: ['treasury'] })
  })

  it('rejects an invalid public key', async () => {
    await expect(addWatchlistEntry({ address: 'not-a-key' })).rejects.toThrow()
    expect(await loadWatchlist()).toHaveLength(0)
  })

  it('does not add a duplicate address', async () => {
    await addWatchlistEntry({ address: ADDR_A, label: 'First' })
    await addWatchlistEntry({ address: ADDR_A, label: 'Second' })
    const entries = await loadWatchlist()
    expect(entries).toHaveLength(1)
    expect(entries[0].label).toBe('First')
  })

  it('removes an entry', async () => {
    await addWatchlistEntry({ address: ADDR_A })
    await addWatchlistEntry({ address: ADDR_B })
    await removeWatchlistEntry(ADDR_A)
    const entries = await loadWatchlist()
    expect(entries.map((e) => e.address)).toEqual([ADDR_B])
  })

  it('updates tags on an existing entry', async () => {
    await addWatchlistEntry({ address: ADDR_A, tags: ['old'] })
    await updateWatchlistEntry(ADDR_A, { tags: ['deployer', 'hot wallet'] })
    const entries = await loadWatchlist()
    expect(entries[0].tags).toEqual(['deployer', 'hot wallet'])
  })
})

describe('tag helpers', () => {
  const entries: WatchlistEntry[] = [
    { address: ADDR_A, label: 'A', tags: ['treasury'], addedAt: '' },
    { address: ADDR_B, label: 'B', tags: ['deployer', 'hot wallet'], addedAt: '' },
    { address: ADDR_C, label: 'C', tags: [], addedAt: '' },
  ]

  it('lists the union of all tags, sorted', () => {
    expect(listWatchlistTags(entries)).toEqual(['deployer', 'hot wallet', 'treasury'])
  })

  it('filters entries by tag', () => {
    expect(filterEntriesByTag(entries, 'deployer').map((e) => e.address)).toEqual([ADDR_B])
  })

  it('returns all entries when no tag filter is set', () => {
    expect(filterEntriesByTag(entries, null)).toHaveLength(3)
  })
})

describe('fetchWatchlistBalances', () => {
  it('sums native + mixed-asset balances into a combined total across accounts', async () => {
    mockFetchAccount.mockImplementation(async (address: string) => {
      if (address === ADDR_A) {
        return { balances: [balance('native', '100'), balance('credit_alphanum4', '50', 'USDC', 'ISSUER')] }
      }
      if (address === ADDR_B) {
        return {
          balances: [
            balance('native', '200'),
            balance('credit_alphanum4', '25', 'USDC', 'ISSUER'),
            balance('credit_alphanum4', '1', 'BTC', 'ISSUER'),
          ],
        }
      }
      throw new Error('unexpected address')
    })

    const entries: WatchlistEntry[] = [
      { address: ADDR_A, label: 'A', tags: [], addedAt: '' },
      { address: ADDR_B, label: 'B', tags: [], addedAt: '' },
    ]

    const result = await fetchWatchlistBalances(entries, 'testnet')

    expect(result.combinedXlm).toBeCloseTo(300)
    // USD: (100*0.5 + 50*1) + (200*0.5 + 25*1 + 1*50000) = 100 + 50125 = 50225
    expect(result.combinedUsd).toBeCloseTo(50_225)

    const accountA = result.accounts.find((a) => a.address === ADDR_A)!
    expect(accountA.xlmBalance).toBeCloseTo(100)
    expect(accountA.assets).toEqual([
      expect.objectContaining({ assetCode: 'USDC', balance: 50, usdValue: 50 }),
    ])

    const accountB = result.accounts.find((a) => a.address === ADDR_B)!
    expect(accountB.assets).toHaveLength(2)
    expect(accountB.totalUsd).toBeCloseTo(200 * 0.5 + 25 * 1 + 1 * 50_000)
  })

  it('flags a failed account without breaking the aggregate for the rest', async () => {
    mockFetchAccount.mockImplementation(async (address: string) => {
      if (address === ADDR_A) throw new Error('account not found')
      return { balances: [balance('native', '10')] }
    })

    const entries: WatchlistEntry[] = [
      { address: ADDR_A, label: 'A', tags: [], addedAt: '' },
      { address: ADDR_B, label: 'B', tags: [], addedAt: '' },
    ]

    const result = await fetchWatchlistBalances(entries, 'testnet')
    const accountA = result.accounts.find((a) => a.address === ADDR_A)!
    expect(accountA.error).toBe('account not found')
    expect(result.combinedXlm).toBeCloseTo(10)
  })
})

describe('fetchWatchlistActivity — merged chronological feed', () => {
  it('interleaves operations from multiple accounts in newest-first order', async () => {
    mockFetchOperations.mockImplementation(async (address: string) => {
      if (address === ADDR_A) {
        return {
          records: [
            opRecord('a-2', 'payment', '2024-01-01T12:00:00Z'),
            opRecord('a-1', 'payment', '2024-01-01T10:00:00Z'),
          ],
          nextCursor: null,
          hasMore: false,
        }
      }
      if (address === ADDR_B) {
        return {
          records: [
            opRecord('b-1', 'create_account', '2024-01-01T11:00:00Z'),
          ],
          nextCursor: null,
          hasMore: false,
        }
      }
      return { records: [], nextCursor: null, hasMore: false }
    })

    const entries: WatchlistEntry[] = [
      { address: ADDR_A, label: 'A', tags: ['treasury'], addedAt: '' },
      { address: ADDR_B, label: 'B', tags: ['deployer'], addedAt: '' },
    ]

    const result = await fetchWatchlistActivity(entries, 'testnet')

    expect(result.items.map((i) => i.id)).toEqual(['a-2', 'b-1', 'a-1'])
    expect(result.items.map((i) => i.address)).toEqual([ADDR_A, ADDR_B, ADDR_A])
  })

  it('filters the merged feed by account and by tag', async () => {
    mockFetchOperations.mockImplementation(async (address: string) => ({
      records: [opRecord(`${address}-1`, 'payment', '2024-01-01T00:00:00Z')],
      nextCursor: null,
      hasMore: false,
    }))

    const entries: WatchlistEntry[] = [
      { address: ADDR_A, label: 'A', tags: ['treasury'], addedAt: '' },
      { address: ADDR_B, label: 'B', tags: ['deployer'], addedAt: '' },
    ]

    const { items } = await fetchWatchlistActivity(entries, 'testnet')

    expect(filterActivityByAddress(items, ADDR_A)).toHaveLength(1)
    expect(filterActivityByAddress(items, null)).toHaveLength(2)

    expect(filterActivityByTag(items, entries, 'treasury').map((i) => i.address)).toEqual([ADDR_A])
    expect(filterActivityByTag(items, entries, null)).toHaveLength(2)
  })
})

describe('rate limiting integration', () => {
  it('checks the shared rate limiter once per account when polling the watchlist', async () => {
    mockFetchAccount.mockResolvedValue({ balances: [balance('native', '1')] })
    const checkSpy = vi.spyOn(rateLimiter, 'checkRequest')

    const entries: WatchlistEntry[] = [ADDR_A, ADDR_B, ADDR_C, ADDR_D, ADDR_E].map((address) => ({
      address,
      label: '',
      tags: [],
      addedAt: '',
    }))

    await fetchWatchlistBalances(entries, 'testnet')

    const accountChecks = checkSpy.mock.calls.filter(([, endpoint]) => endpoint === 'accounts')
    expect(accountChecks).toHaveLength(5)
    expect(mockFetchAccount).toHaveBeenCalledTimes(5)

    checkSpy.mockRestore()
  })

  it('skips the network call and flags the account when the rate limiter denies the request', async () => {
    mockFetchAccount.mockResolvedValue({ balances: [balance('native', '1')] })
    vi.spyOn(rateLimiter, 'checkRequest').mockReturnValue({ allowed: false, remaining: 0 })

    const entries: WatchlistEntry[] = [{ address: ADDR_A, label: '', tags: [], addedAt: '' }]
    const result = await fetchWatchlistBalances(entries, 'testnet')

    expect(mockFetchAccount).not.toHaveBeenCalled()
    expect(result.accounts[0].rateLimited).toBe(true)

    vi.restoreAllMocks()
  })

  it('throttles repeated polls once the accounts endpoint budget is exhausted', async () => {
    mockFetchAccount.mockResolvedValue({ balances: [balance('native', '1')] })

    const entries: WatchlistEntry[] = [ADDR_A, ADDR_B, ADDR_C, ADDR_D, ADDR_E].map((address) => ({
      address,
      label: '',
      tags: [],
      addedAt: '',
    }))

    // Five poll cycles of five accounts would need 25 requests to serve
    // entirely from the network — more than the documented 20/min "accounts"
    // endpoint budget. The shared limiter must hold total network calls
    // below that, and surface the throttled accounts back to the caller.
    let lastResult
    for (let i = 0; i < 5; i++) {
      lastResult = await fetchWatchlistBalances(entries, 'testnet')
    }

    expect(mockFetchAccount.mock.calls.length).toBeLessThan(25)
    expect(lastResult!.accounts.some((a) => a.rateLimited)).toBe(true)
  })
})
