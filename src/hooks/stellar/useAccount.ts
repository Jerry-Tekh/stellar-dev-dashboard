/**
 * useAccount — fetches and caches a Stellar account via TanStack Query.
 *
 * Features:
 *  - Automatic background refetch on window focus / network reconnect
 *  - Offline-aware: serves IndexedDB fallback when navigator.onLine is false
 *  - Smart retry using AppError.retryable (no retry on 404 / auth errors)
 *  - Exposes typed loading / error / data states — no manual Zustand flags needed
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Horizon } from '@stellar/stellar-sdk'
import { fetchAccount, resolveAddress, type NetworkName } from '../../lib/stellar'
import { stellarCacheManager } from '../../lib/cacheManager'
import { getOnlineStatus } from '../../utils/offline'
import { accountKeys } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'

export interface UseAccountOptions {
  /** When false the query is paused (e.g. address not yet entered). */
  enabled?: boolean
  /**
   * When true, resolve the address first (federated / muxed support).
   * Set to false if you already hold a canonical G… address.
   */
  resolve?: boolean
}

export interface AccountResult {
  /** The resolved canonical G… address (after federated/muxed resolution) */
  resolvedAddress: string | null
  account: Horizon.AccountResponse | null
}

export async function fetchAccountWithFallback(
  address: string,
  network: NetworkName,
  resolve: boolean,
  signal?: AbortSignal,
): Promise<AccountResult> {
  // 1. Optionally resolve federated / muxed addresses
  let resolvedAddress = address
  if (resolve) {
    const resolved = await resolveAddress(address, network)
    if (!resolved) throw new Error(`Could not resolve address: ${address}`)
    resolvedAddress = resolved.accountId
  }

  const online = getOnlineStatus()
  const cacheKey = `account:${resolvedAddress}:${network}`

  // 2. Offline path — serve from IndexedDB, skip network
  if (!online) {
    const fallback = await stellarCacheManager.getWithFallback<Horizon.AccountResponse>(cacheKey)
    if (fallback.value) return { resolvedAddress, account: fallback.value }
    throw new Error('You are offline and no cached data is available for this account.')
  }

  // 3. Online path — fetch from Horizon, write-through to IDB
  const account = await fetchAccount(resolvedAddress, network, signal)
  stellarCacheManager
    .set(cacheKey, account, 300_000, ['account'])
    .catch(() => {})

  return { resolvedAddress, account }
}

/**
 * Primary account hook.
 *
 * @example
 * const { data, isLoading, isError, error } = useAccount('G...', 'testnet')
 */
export function useAccount(
  address: string,
  network: NetworkName,
  options: UseAccountOptions = {},
): UseQueryResult<AccountResult, Error> {
  const { enabled = true, resolve = false } = options

  return useQuery<AccountResult, Error>({
    queryKey: accountKeys.detail(address, network),
    queryFn: ({ signal }) =>
      fetchAccountWithFallback(address, network, resolve, signal),
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.ACCOUNT,
    gcTime: 10 * 60_000,
  })
}
