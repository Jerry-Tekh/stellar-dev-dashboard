/**
 * useXLMPrice — fetches the current XLM/USD price from CoinGecko.
 *
 * Replaces pricesLoading / pricesError / setPrices from the Zustand store.
 * Falls back to null gracefully so the UI can show "—" without crashing.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchXLMPrice, type XLMPrice } from '../../lib/stellar'
import { priceKeys } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'

export interface UseXLMPriceOptions {
  /** Auto-polling interval in ms. Defaults to 60 s. Pass false to disable. */
  refetchInterval?: number | false
  enabled?: boolean
}

/**
 * Returns the current XLM/USD price.
 * Errors are silenced — the query result's `isError` flag is still set
 * so the UI can show a fallback without throwing.
 *
 * @example
 * const { data: price } = useXLMPrice()
 * // price?.usd → 0.109
 */
export function useXLMPrice(
  options: UseXLMPriceOptions = {},
): UseQueryResult<XLMPrice, Error> {
  const { refetchInterval = 60_000, enabled = true } = options

  return useQuery<XLMPrice, Error>({
    queryKey: priceKeys.xlm(),
    queryFn: () => fetchXLMPrice(),
    staleTime: STALE_TIMES.PRICE,
    gcTime: 5 * 60_000,
    refetchInterval,
    // Keep stale price visible while refreshing
    placeholderData: (prev) => prev,
    // Retry is handled by the global shouldRetry in queryClient.ts,
    // which already skips retries for rate-limit and 4xx errors.
    enabled,
  })
}
