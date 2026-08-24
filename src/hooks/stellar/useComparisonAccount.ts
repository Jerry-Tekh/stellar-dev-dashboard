/**
 * useComparisonAccount — fetches an account for the Account Comparison panel.
 *
 * Replaces the per-slot loading/error flags inside the Zustand comparisonSlots array.
 * Each slot calls this hook independently, so React Query deduplicates any
 * accidental duplicate keys automatically.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Horizon } from '@stellar/stellar-sdk'
import { fetchAccount, type NetworkName } from '../../lib/stellar'
import { comparisonKeys } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'

export function useComparisonAccount(
  address: string,
  network: NetworkName,
  enabled = true,
): UseQueryResult<Horizon.AccountResponse, Error> {
  return useQuery<Horizon.AccountResponse, Error>({
    queryKey: comparisonKeys.account(address, network),
    queryFn: ({ signal }) => fetchAccount(address, network, signal),
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.ACCOUNT,
    gcTime: 10 * 60_000,
  })
}
