/**
 * QueryClient configuration.
 *
 * Strategy:
 *  - staleTime per domain mirrors existing TTL constants so the existing
 *    in-memory LRU stays the authoritative L1 cache while React Query
 *    owns the lifecycle (loading / error / background refetch states).
 *  - retry logic re-uses the AppError.retryable flag for smart back-off.
 *  - Window-focus refetch enabled globally; streaming components opt out.
 *  - gcTime (formerly cacheTime) is generous to keep navigating back fast.
 */

import { QueryClient, type QueryCache, type MutationCache } from '@tanstack/react-query'
import { AppError, ErrorCategory } from './errorHandling'

// ─── Per-domain stale times (ms) ─────────────────────────────────────────────

export const STALE_TIMES = {
  ACCOUNT:      60_000,   // 1 min — matches TTL.ACCOUNT
  TRANSACTIONS: 30_000,   // 30 s  — matches TTL.TRANSACTIONS
  OPERATIONS:   30_000,   // 30 s  — matches TTL.OPERATIONS
  NETWORK:       5_000,   // 5 s   — matches TTL.LEDGER (live stats)
  PRICE:        30_000,   // 30 s  — matches TTL.PRICE
  CONTRACT:     60_000,   // 1 min — contracts are relatively stable
  LONG:      3_600_000,   // 1 hr  — creation date, offers, etc.
} as const

// ─── Retry predicate ──────────────────────────────────────────────────────────

/**
 * Returns true when the query should be retried.
 * - Non-retryable AppErrors (validation, auth, not-found) skip retries.
 * - AbortErrors are never retried.
 * - All other errors retry up to `count < 3`.
 */
export function shouldRetry(count: number, error: unknown): boolean {
  if (count >= 3) return false

  // Never retry aborts
  if (error instanceof DOMException && error.name === 'AbortError') return false

  // Respect AppError.retryable flag
  if (error instanceof AppError) {
    if (!error.retryable) return false
    // Rate-limit: first retry only
    if (error.category === ErrorCategory.RateLimit && count >= 1) return false
  }

  // HTTP 4xx errors — only 429 is retryable
  if (error instanceof Error) {
    const status = (error as Error & { statusCode?: number }).statusCode
    if (status && status >= 400 && status < 500 && status !== 429) return false
  }

  return true
}

/**
 * Exponential backoff in ms, capped at 30 s.
 */
export function retryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 30_000)
}

// ─── QueryClient singleton ────────────────────────────────────────────────────

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Conservative defaults — individual hooks override per domain
      staleTime: STALE_TIMES.ACCOUNT,
      gcTime: 5 * 60_000,          // keep inactive data 5 min
      retry: shouldRetry,
      retryDelay,
      refetchOnWindowFocus: true,  // re-validates on tab switch
      refetchOnReconnect: true,    // re-validates on network restore
      // Never throw to the nearest error boundary by default;
      // let components decide via `useQuery({ throwOnError: true })`.
      throwOnError: false,
    },
    mutations: {
      retry: false,                // mutations never auto-retry
    },
  },
})
