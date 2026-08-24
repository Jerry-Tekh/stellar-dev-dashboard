/**
 * useTransactionDetail — fetches full transaction + its operations by hash.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Horizon } from '@stellar/stellar-sdk'
import { fetchTransactionDetails, type NetworkName } from '../../lib/stellar'
import { transactionKeys } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'

export interface TransactionDetail {
  transaction: Horizon.ServerApi.TransactionRecord
  operations: Horizon.ServerApi.OperationRecord[]
}

export function useTransactionDetail(
  hash: string,
  network: NetworkName,
  enabled = true,
): UseQueryResult<TransactionDetail, Error> {
  return useQuery<TransactionDetail, Error>({
    queryKey: transactionKeys.detail(hash, network),
    queryFn: () => fetchTransactionDetails(hash, network),
    enabled: enabled && !!hash,
    staleTime: STALE_TIMES.LONG,  // transaction details are immutable once confirmed
    gcTime: 30 * 60_000,
  })
}
