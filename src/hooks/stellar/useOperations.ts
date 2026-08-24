/**
 * useOperations / useInfiniteOperations
 *
 * Mirrors useTransactions but for the Operations list.
 * Replaces opsLoading / opsNextCursor / opsHasMore / opsPagingLoading from the store.
 */

import {
  useQuery,
  useInfiniteQuery,
  type UseQueryResult,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query'
import type { Horizon } from '@stellar/stellar-sdk'
import { fetchOperations, type NetworkName } from '../../lib/stellar'
import { operationKeys } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'

export interface OperationPage {
  records: Horizon.ServerApi.OperationRecord[]
  nextCursor: string | null
  hasMore: boolean
}

// ─── Single-page ──────────────────────────────────────────────────────────────

export function useOperations(
  address: string,
  network: NetworkName,
  limit = 20,
  enabled = true,
): UseQueryResult<OperationPage, Error> {
  return useQuery<OperationPage, Error>({
    queryKey: operationKeys.page(address, network, limit),
    queryFn: ({ signal }) => fetchOperations(address, network, limit, null, signal),
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.OPERATIONS,
  })
}

// ─── Infinite scroll ──────────────────────────────────────────────────────────

export type InfiniteOperationData = InfiniteData<OperationPage, string | null>

export function useInfiniteOperations(
  address: string,
  network: NetworkName,
  limit = 50,
  enabled = true,
): UseInfiniteQueryResult<InfiniteOperationData, Error> {
  return useInfiniteQuery<OperationPage, Error, InfiniteOperationData, ReturnType<typeof operationKeys.infinite>, string | null>({
    queryKey: operationKeys.infinite(address, network, limit),
    queryFn: ({ pageParam, signal }) =>
      fetchOperations(address, network, limit, pageParam ?? null, signal),
    initialPageParam: null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.OPERATIONS,
    gcTime: 10 * 60_000,
  })
}

/** Flatten all infinite pages into a single records array */
export function flattenOperationPages(
  data: InfiniteOperationData | undefined,
): Horizon.ServerApi.OperationRecord[] {
  if (!data) return []
  return data.pages.flatMap((page) => page.records)
}
