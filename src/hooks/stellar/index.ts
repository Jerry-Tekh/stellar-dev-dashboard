/**
 * Stellar domain hooks — barrel export.
 * All data-fetching hooks for the Stellar network live here.
 */

export { useAccount } from './useAccount'
export type { AccountResult, UseAccountOptions } from './useAccount'

export {
  useTransactions,
  useInfiniteTransactions,
  flattenTransactionPages,
} from './useTransactions'
export type { TransactionPage, InfiniteTransactionData } from './useTransactions'

export {
  useOperations,
  useInfiniteOperations,
  flattenOperationPages,
} from './useOperations'
export type { OperationPage, InfiniteOperationData } from './useOperations'

export { useNetworkStats } from './useNetworkStats'
export type { UseNetworkStatsOptions } from './useNetworkStats'

export { useXLMPrice } from './useXLMPrice'
export type { UseXLMPriceOptions } from './useXLMPrice'

export { useTransactionDetail } from './useTransactionDetail'
export type { TransactionDetail } from './useTransactionDetail'

export { useComparisonAccount } from './useComparisonAccount'
