/**
 * useTransactions / useInfiniteTransactions
 *
 * - useTransactions: simple first-page query (used by widgets / overview).
 * - useInfiniteTransactions: cursor-based infinite scroll (used by Transactions tab).
 *
 * Both hooks replace the manual txLoading / txNextCursor / txHasMore Zustand flags.
 */

import {
  useQuery,
  useInfiniteQuery,
  type UseQueryResult,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query'
import type { Horizon } from '@stellar/stellar-sdk'
import { fetchTransactions, type NetworkName } from '../../lib/stellar'
import { transactionKeys } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'

export interface TransactionPage {
  records: Horizon.ServerApi.TransactionRecord[]
  nextCursor: string | null
  hasMore: boolean
}

// ─── Single-page (widget / overview) ─────────────────────────────────────────

export function useTransactions(
  address: string,
  network: NetworkName,
  limit = 20,
  enabled = true,
): UseQueryResult<TransactionPage, Error> {
  return useQuery<TransactionPage, Error>({
    queryKey: transactionKeys.page(address, network, limit),
    queryFn: ({ signal }) => fetchTransactions(address, network, limit, null, signal),
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.TRANSACTIONS,
  })
}

// ─── Infinite scroll (Transactions tab) ──────────────────────────────────────

export type InfiniteTransactionData = InfiniteData<TransactionPage, string | null>

export function useInfiniteTransactions(
  address: string,
  network: NetworkName,
  limit = 50,
  enabled = true,
): UseInfiniteQueryResult<InfiniteTransactionData, Error> {
  return useInfiniteQuery<TransactionPage, Error, InfiniteTransactionData, ReturnType<typeof transactionKeys.infinite>, string | null>({
    queryKey: transactionKeys.infinite(address, network, limit),
    queryFn: ({ pageParam, signal }) =>
      fetchTransactions(address, network, limit, pageParam ?? null, signal),
    initialPageParam: null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.TRANSACTIONS,
    gcTime: 10 * 60_000,
  })
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** Flatten all infinite pages into a single records array */
export function flattenTransactionPages(
  data: InfiniteTransactionData | undefined,
): Horizon.ServerApi.TransactionRecord[] {
  if (!data) return []
  return data.pages.flatMap((page) => page.records)
}
