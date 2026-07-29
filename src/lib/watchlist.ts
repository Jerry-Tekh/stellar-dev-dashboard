/**
 * watchlist.ts
 * Multi-account watchlist: tracks public keys independently of the
 * currently connected (signing) account.
 *
 * - Persistence uses the same storage.ts primitives as userPreferences.ts,
 *   so entries survive a reload without any wallet involved.
 * - Balance/activity fetching reuses stellar.ts (account/operation fetching,
 *   already cached + circuit-broken) and priceFeed.ts (USD estimates), and
 *   is gated through rateLimiter.ts so N watched accounts never fan out into
 *   N times the request budget of a single-account view.
 *
 * Watched accounts are read-only: nothing here ever exposes a signing key
 * or transaction-building capability for a watched address.
 */

import { getStoredValue, setStoredValue } from './storage'
import { fetchAccount, fetchOperations, isValidPublicKey, getOperationLabel } from './stellar'
import type { NetworkName } from './stellar'
import { rateLimiter } from './rateLimiter'
import { fetchPrices, calculatePortfolioValue } from './priceFeed'
import type { Horizon } from '@stellar/stellar-sdk'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatchlistEntry {
  address: string
  label: string
  tags: string[]
  addedAt: string
}

export interface WatchlistAssetBalance {
  assetCode: string
  assetIssuer?: string
  balance: number
  usdValue: number | null
}

export interface WatchlistAccountBalance {
  address: string
  label: string
  tags: string[]
  xlmBalance: number
  assets: WatchlistAssetBalance[]
  totalUsd: number | null
  error?: string
  rateLimited?: boolean
}

export interface WatchlistBalancesResult {
  accounts: WatchlistAccountBalance[]
  combinedXlm: number
  combinedUsd: number | null
  generatedAt: number
}

export interface WatchlistActivityItem {
  address: string
  label: string
  id: string
  type: string
  typeLabel: string
  createdAt: string
  record: Horizon.ServerApi.OperationRecord
}

export interface WatchlistActivityResult {
  items: WatchlistActivityItem[]
  rateLimitedAddresses: string[]
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const WATCHLIST_KEY = 'watchlist-v1'
const RATE_LIMIT_IDENTIFIER = 'watchlist'

export async function loadWatchlist(): Promise<WatchlistEntry[]> {
  try {
    const stored = (await getStoredValue(WATCHLIST_KEY)) as WatchlistEntry[] | null
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

async function saveWatchlist(entries: WatchlistEntry[]): Promise<WatchlistEntry[]> {
  await setStoredValue(WATCHLIST_KEY, entries)
  return entries
}

export async function addWatchlistEntry(
  input: { address: string; label?: string; tags?: string[] }
): Promise<WatchlistEntry[]> {
  const address = input.address.trim()
  if (!isValidPublicKey(address)) {
    throw new Error('Invalid Stellar public key')
  }

  const entries = await loadWatchlist()
  if (entries.some((e) => e.address === address)) return entries

  const next: WatchlistEntry[] = [
    ...entries,
    {
      address,
      label: input.label?.trim() || '',
      tags: dedupeTags(input.tags ?? []),
      addedAt: new Date().toISOString(),
    },
  ]
  return saveWatchlist(next)
}

export async function removeWatchlistEntry(address: string): Promise<WatchlistEntry[]> {
  const entries = await loadWatchlist()
  return saveWatchlist(entries.filter((e) => e.address !== address))
}

export async function updateWatchlistEntry(
  address: string,
  patch: { label?: string; tags?: string[] }
): Promise<WatchlistEntry[]> {
  const entries = await loadWatchlist()
  const next = entries.map((e) => {
    if (e.address !== address) return e
    return {
      ...e,
      label: patch.label !== undefined ? patch.label.trim() : e.label,
      tags: patch.tags !== undefined ? dedupeTags(patch.tags) : e.tags,
    }
  })
  return saveWatchlist(next)
}

export function listWatchlistTags(entries: WatchlistEntry[]): string[] {
  const tags = new Set<string>()
  for (const entry of entries) {
    for (const tag of entry.tags) tags.add(tag)
  }
  return [...tags].sort((a, b) => a.localeCompare(b))
}

export function filterEntriesByTag(entries: WatchlistEntry[], tag: string | null): WatchlistEntry[] {
  if (!tag) return entries
  return entries.filter((e) => e.tags.includes(tag))
}

function dedupeTags(tags: string[]): string[] {
  const cleaned = tags.map((t) => t.trim()).filter(Boolean)
  return [...new Set(cleaned)]
}

// ─── Rate-limit gate ────────────────────────────────────────────────────────

/** Returns true when the shared rate limiter currently allows this endpoint call. */
function isRequestAllowed(endpoint: 'accounts' | 'operations'): boolean {
  return rateLimiter.checkRequest(RATE_LIMIT_IDENTIFIER, endpoint).allowed
}

// ─── Aggregated balances ──────────────────────────────────────────────────────

async function fetchAccountBalance(
  entry: WatchlistEntry,
  network: NetworkName,
): Promise<WatchlistAccountBalance> {
  if (!isRequestAllowed('accounts')) {
    return {
      address: entry.address,
      label: entry.label,
      tags: entry.tags,
      xlmBalance: 0,
      assets: [],
      totalUsd: null,
      rateLimited: true,
    }
  }

  try {
    const account = await fetchAccount(entry.address, network)
    const balances = account.balances as unknown as Array<{
      asset_type: string
      asset_code?: string
      asset_issuer?: string
      balance: string
    }>

    const assetCodes = balances.map((b) => (b.asset_type === 'native' ? 'XLM' : b.asset_code || ''))
      .filter(Boolean)
    const prices = await fetchPrices([...new Set(assetCodes)])
    const portfolio = calculatePortfolioValue(balances, prices)

    const xlmBalance = balances.find((b) => b.asset_type === 'native')
      ? parseFloat(balances.find((b) => b.asset_type === 'native')!.balance) || 0
      : 0

    const assets: WatchlistAssetBalance[] = balances
      .filter((b) => b.asset_type !== 'native')
      .map((b) => {
        const item = portfolio?.items.find((i) => i.code === b.asset_code)
        return {
          assetCode: b.asset_code || 'UNKNOWN',
          assetIssuer: b.asset_issuer,
          balance: parseFloat(b.balance) || 0,
          usdValue: item?.valueUsd ?? null,
        }
      })

    return {
      address: entry.address,
      label: entry.label,
      tags: entry.tags,
      xlmBalance,
      assets,
      totalUsd: portfolio?.totalUsd ?? null,
    }
  } catch (error) {
    return {
      address: entry.address,
      label: entry.label,
      tags: entry.tags,
      xlmBalance: 0,
      assets: [],
      totalUsd: null,
      error: error instanceof Error ? error.message : 'Failed to load account',
    }
  }
}

/**
 * Fetches balances for every watched account and rolls up a combined total.
 * Gated per-account through the shared rate limiter's `accounts` budget so
 * a large watchlist degrades gracefully (rate-limited accounts are flagged,
 * not retried in a tight loop) instead of overrunning Horizon.
 */
export async function fetchWatchlistBalances(
  entries: WatchlistEntry[],
  network: NetworkName = 'testnet',
): Promise<WatchlistBalancesResult> {
  const accounts = await Promise.all(entries.map((entry) => fetchAccountBalance(entry, network)))

  let combinedXlm = 0
  let combinedUsd: number | null = null
  let hasUsd = false

  for (const account of accounts) {
    combinedXlm += account.xlmBalance
    if (account.totalUsd !== null) {
      hasUsd = true
      combinedUsd = (combinedUsd ?? 0) + account.totalUsd
    }
  }

  return {
    accounts,
    combinedXlm,
    combinedUsd: hasUsd ? combinedUsd : null,
    generatedAt: Date.now(),
  }
}

// ─── Merged activity feed ─────────────────────────────────────────────────────

async function fetchAccountActivity(
  entry: WatchlistEntry,
  network: NetworkName,
  limit: number,
): Promise<{ items: WatchlistActivityItem[]; rateLimited: boolean }> {
  if (!isRequestAllowed('operations')) {
    return { items: [], rateLimited: true }
  }

  try {
    const { records } = await fetchOperations(entry.address, network, limit)
    const items: WatchlistActivityItem[] = records.map((record) => ({
      address: entry.address,
      label: entry.label,
      id: record.id,
      type: record.type,
      typeLabel: getOperationLabel(record.type),
      createdAt: record.created_at,
      record,
    }))
    return { items, rateLimited: false }
  } catch {
    return { items: [], rateLimited: false }
  }
}

/**
 * Fetches recent operations for every watched account and merges them into a
 * single chronologically-ordered (newest first) feed, reusing stellar.ts's
 * cached fetchOperations for each account.
 */
export async function fetchWatchlistActivity(
  entries: WatchlistEntry[],
  network: NetworkName = 'testnet',
  limitPerAccount = 10,
): Promise<WatchlistActivityResult> {
  const results = await Promise.all(
    entries.map((entry) => fetchAccountActivity(entry, network, limitPerAccount)),
  )

  const items = results.flatMap((r) => r.items)
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const rateLimitedAddresses = entries
    .filter((_, i) => results[i].rateLimited)
    .map((e) => e.address)

  return { items, rateLimitedAddresses }
}

export function filterActivityByAddress(
  items: WatchlistActivityItem[],
  address: string | null,
): WatchlistActivityItem[] {
  if (!address) return items
  return items.filter((item) => item.address === address)
}

export function filterActivityByTag(
  items: WatchlistActivityItem[],
  entries: WatchlistEntry[],
  tag: string | null,
): WatchlistActivityItem[] {
  if (!tag) return items
  const taggedAddresses = new Set(filterEntriesByTag(entries, tag).map((e) => e.address))
  return items.filter((item) => taggedAddresses.has(item.address))
}
