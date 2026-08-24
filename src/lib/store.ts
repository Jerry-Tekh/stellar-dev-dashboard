import { create } from 'zustand'
import { getStoredValue, setStoredValue } from './storage'
import { syncState, onStateChange } from '../utils/stateSync'
import type {
  NetworkName,
  NetworkStats,
} from './stellar'
import type { Horizon, SorobanRpc } from '@stellar/stellar-sdk'

export interface SearchFilters {
  status: 'all' | 'success' | 'failed'
  memoOnly: boolean
  minFee: string
  maxFee: string
  type: string
  minAmount: string
  maxAmount: string
  startDate: string
  endDate: string
}

export interface ComparisonSlot {
  key: string
  data: Horizon.AccountResponse | null
  loading: boolean
  error: string | null
}

export interface Notification {
  id: string
  type: string
  title: string
  [key: string]: unknown
  read?: boolean
  timestamp?: number
}

export interface StreamLedger {
  sequence: number
  [key: string]: unknown
}

const THEME_STORAGE_KEY = 'stellar-dashboard-theme'
export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  status: 'all',
  memoOnly: false,
  minFee: '',
  maxFee: '',
  type: 'all',
  minAmount: '',
  maxAmount: '',
  startDate: '',
  endDate: '',
}

// --- System Preference Detection ---
const getInitialTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
  return 'dark';
};

export interface StoreState {
  network: NetworkName
  setNetwork: (network: NetworkName) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
  isMobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  connectedAddress: string | null
  /** Account response kept for components not yet on React Query. */
  accountData: Horizon.AccountResponse | null
  /** @deprecated — use useAccount() from hooks/stellar instead */
  accountLoading: boolean
  /** @deprecated — use useAccount() from hooks/stellar instead */
  accountError: string | null
  setConnectedAddress: (address: string | null) => void
  setAccountData: (data: Horizon.AccountResponse) => void
  /** @deprecated — no-op; React Query owns loading state */
  setAccountLoading: (loading: boolean) => void
  /** @deprecated — no-op; React Query owns error state */
  setAccountError: (error: string | null) => void

  // ── Transaction server-state — owned by React Query (useInfiniteTransactions) ──
  /** @deprecated — read from useInfiniteTransactions() */
  transactions: Horizon.ServerApi.TransactionRecord[]
  /** @deprecated — read from useInfiniteTransactions().isLoading */
  txLoading: boolean
  /** @deprecated — no-op */
  setTransactions: (txs: Horizon.ServerApi.TransactionRecord[]) => void
  /** @deprecated — no-op */
  appendTransactions: (txs: Horizon.ServerApi.TransactionRecord[]) => void
  /** @deprecated — no-op */
  setTxLoading: (v: boolean) => void
  /** @deprecated — owned by React Query cursor */
  txNextCursor: string | null
  /** @deprecated — use useInfiniteTransactions().hasNextPage */
  txHasMore: boolean
  /** @deprecated — use useInfiniteTransactions().isFetchingNextPage */
  txPagingLoading: boolean
  txScrollPosition: number
  /** @deprecated — no-op */
  setTxNextCursor: (cursor: string | null) => void
  /** @deprecated — no-op */
  setTxHasMore: (hasMore: boolean) => void
  /** @deprecated — no-op */
  setTxPagingLoading: (v: boolean) => void
  setTxScrollPosition: (pos: number) => void

  // ── Operation server-state — owned by React Query (useInfiniteOperations) ──
  /** @deprecated — read from useInfiniteOperations() */
  operations: Horizon.ServerApi.OperationRecord[]
  /** @deprecated — use useInfiniteOperations().isLoading */
  opsLoading: boolean
  /** @deprecated — no-op */
  setOperations: (ops: Horizon.ServerApi.OperationRecord[]) => void
  /** @deprecated — no-op */
  appendOperations: (ops: Horizon.ServerApi.OperationRecord[]) => void
  /** @deprecated — no-op */
  setOpsLoading: (v: boolean) => void
  /** @deprecated — owned by React Query cursor */
  opsNextCursor: string | null
  /** @deprecated — use useInfiniteOperations().hasNextPage */
  opsHasMore: boolean
  /** @deprecated — use useInfiniteOperations().isFetchingNextPage */
  opsPagingLoading: boolean
  opsScrollPosition: number
  /** @deprecated — no-op */
  setOpsNextCursor: (cursor: string | null) => void
  /** @deprecated — no-op */
  setOpsHasMore: (hasMore: boolean) => void
  /** @deprecated — no-op */
  setOpsPagingLoading: (v: boolean) => void
  setOpsScrollPosition: (pos: number) => void

  // ── Network stats — owned by React Query (useNetworkStats) ───────────────
  /** @deprecated — use useNetworkStats() */
  networkStats: NetworkStats | null
  /** @deprecated — use useNetworkStats().isLoading */
  statsLoading: boolean
  /** @deprecated — no-op; kept for backward compat */
  setNetworkStats: (stats: NetworkStats | ((prev: NetworkStats | null) => NetworkStats)) => void
  /** @deprecated — no-op */
  setStatsLoading: (v: boolean) => void

  activeTab: string
  setActiveTab: (tab: string) => void
  faucetLoading: boolean
  faucetResult: unknown
  setFaucetLoading: (v: boolean) => void
  setFaucetResult: (r: unknown) => void
  contractId: string
  contractData: SorobanRpc.Api.LedgerEntryResult | null
  contractLoading: boolean
  contractError: string | null
  setContractId: (id: string) => void
  setContractData: (data: SorobanRpc.Api.LedgerEntryResult) => void
  setContractLoading: (v: boolean) => void
  setContractError: (e: string | null) => void
  deploymentStatus: Record<string, unknown> | null
  setDeploymentStatus: (s: Record<string, unknown> | null) => void
  savedSearches: string[]
  setSavedSearches: (s: string[]) => void
  multiSigMode: boolean
  setMultiSigMode: (v: boolean) => void
  selectedTemplateId: string | null
  setSelectedTemplateId: (id: string | null) => void
  preferencesOpen: boolean
  setPreferencesOpen: (open: boolean) => void
  globalError: { message: string; category: string } | null
  setGlobalError: (err: { message: string; category: string } | null) => void

  // ── Price data — owned by React Query (useXLMPrice) ──────────────────────
  /** @deprecated — use useXLMPrice() */
  prices: Record<string, { usd: number | null; usd_24h_change: number | null }>
  /** @deprecated — use useXLMPrice().isLoading */
  pricesLoading: boolean
  /** @deprecated — use useXLMPrice().isError */
  pricesError: string | null
  /** @deprecated — no-op */
  setPrices: (prices: Record<string, { usd: number | null; usd_24h_change: number | null }>) => void
  /** @deprecated — no-op */
  setPricesLoading: (loading: boolean) => void
  /** @deprecated — no-op */
  setPricesError: (error: string | null) => void

  searchFilters: SearchFilters
  setSearchFilters: (filters: Partial<SearchFilters>) => void
  comparisonSlots: ComparisonSlot[]
  addComparisonSlot: () => void
  removeComparisonSlot: (index: number) => void
  reorderComparisonSlots: (orderedSlots: ComparisonSlot[]) => void
  setComparisonKey: (index: number, key: string) => void
  setComparisonData: (index: number, data: Horizon.AccountResponse | null) => void
  setComparisonLoading: (index: number, loading: boolean) => void
  setComparisonError: (index: number, error: string | null) => void
  walletConnected: boolean
  walletType: string | null
  walletPublicKey: string | null
  setWalletConnected: (connected: boolean, type?: string | null, publicKey?: string | null) => void
  disconnectWallet: () => void
  notifications: Notification[]
  notificationHistory: Notification[]
  unreadNotificationCount: number
  addNotification: (notification: Notification) => void
  removeNotification: (id: string) => void
  addNotificationHistory: (notification: Notification) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  clearNotificationHistory: () => void

  // Streaming (ported)
  streamStatus: string
  streamLedgers: StreamLedger[]
  streamError: string | null
  setStreamStatus: (status: string) => void
  addStreamLedger: (ledger: StreamLedger) => void
  clearStreamLedgers: () => void
  setStreamError: (e: string | null) => void
}

// ─── Persisted keys ───────────────────────────────────────────────────────────
const PERSIST_KEYS: Array<keyof StoreState> = [
  'network', 'theme', 'activeTab', 'savedSearches', 'multiSigMode', 'searchFilters',
  'notificationHistory', 'unreadNotificationCount',
]
const STORE_PERSIST_KEY = 'store:preferences'

// LocalStorage key for quick network persistence (synchronous, survives reload)
const SELECTED_NETWORK_KEY = 'stellar:selected-network'

function readInitialNetwork(): StoreState['network'] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SELECTED_NETWORK_KEY)
      if (raw === 'mainnet' || raw === 'testnet' || raw === 'futurenet' || raw === 'local' || raw === 'custom') {
        return raw
      }
    }
  } catch {
    // ignore
  }
  return 'testnet'
}

export const useStore = create<StoreState>((set, get) => ({
  // Network
  network: readInitialNetwork(),
  setNetwork: (network) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(SELECTED_NETWORK_KEY, network)
    } catch {}
    set({
      network,
      accountData: null,
      // React Query caches keyed by [entity, address, network] are automatically
      // stale once network changes — no need to clear them manually.
      txScrollPosition: 0,
      opsScrollPosition: 0,
    })
  },

  theme: getInitialTheme(),
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light'
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', newTheme)
    }
    return { theme: newTheme }
  }),
  isMobileMenuOpen: false,
  setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),

  connectedAddress: null,
  accountData: null,
  accountLoading: false,
  accountError: null,
  setConnectedAddress: (address) => set({ connectedAddress: address }),
  setAccountData: (data) => set({ accountData: data, accountError: null }),
  // Stubs — React Query owns loading/error state; kept for backward compat
  setAccountLoading: (_loading) => {},
  setAccountError: (_error) => {},

  transactions: [],
  txLoading: false,
  setTransactions: (_txs) => {},
  appendTransactions: (_txs) => {},
  setTxLoading: (_v) => {},
  txNextCursor: null,
  txHasMore: false,
  txPagingLoading: false,
  txScrollPosition: 0,
  setTxNextCursor: (_cursor) => {},
  setTxHasMore: (_hasMore) => {},
  setTxPagingLoading: (_v) => {},
  setTxScrollPosition: (pos) => set({ txScrollPosition: pos }),

  operations: [],
  opsLoading: false,
  setOperations: (_ops) => {},
  appendOperations: (_ops) => {},
  setOpsLoading: (_v) => {},
  opsNextCursor: null,
  opsHasMore: false,
  opsPagingLoading: false,
  opsScrollPosition: 0,
  setOpsNextCursor: (_cursor) => {},
  setOpsHasMore: (_hasMore) => {},
  setOpsPagingLoading: (_v) => {},
  setOpsScrollPosition: (pos) => set({ opsScrollPosition: pos }),

  networkStats: null,
  statsLoading: false,
  // Stub — React Query owns stats; kept for backward compat
  setNetworkStats: (_stats) => {},
  setStatsLoading: (_v) => {},

  activeTab: 'overview',
  setActiveTab: (tab) => set({ activeTab: tab }),

  faucetLoading: false,
  faucetResult: null,
  setFaucetLoading: (v) => set({ faucetLoading: v }),
  setFaucetResult: (r) => set({ faucetResult: r }),

  contractId: '',
  contractData: null,
  contractLoading: false,
  contractError: null,
  setContractId: (id) => set({ contractId: id }),
  setContractData: (data) => set({ contractData: data, contractError: null }),
  setContractLoading: (v) => set({ contractLoading: v }),
  setContractError: (e) => set({ contractError: e }),
  deploymentStatus: null,
  setDeploymentStatus: (s) => set({ deploymentStatus: s }),
  savedSearches: [],
  setSavedSearches: (s) => set({ savedSearches: s }),
  multiSigMode: false,
  setMultiSigMode: (v) => set({ multiSigMode: v }),

  selectedTemplateId: null,
  setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),

  preferencesOpen: false,
  setPreferencesOpen: (open) => set({ preferencesOpen: open }),

  globalError: null,
  setGlobalError: (err) => set({ globalError: err }),

  prices: {},
  pricesLoading: false,
  pricesError: null,
  // Stubs — React Query owns price state via useXLMPrice()
  setPrices: (_prices) => {},
  setPricesLoading: (_loading) => {},
  setPricesError: (_error) => {},

  searchFilters: DEFAULT_SEARCH_FILTERS,
  setSearchFilters: (filters) => set((state) => ({
    searchFilters: { ...state.searchFilters, ...filters },
  })),

  comparisonSlots: [],
  addComparisonSlot: () => set((state) => (
    state.comparisonSlots.length >= 5
      ? state
      : { comparisonSlots: [...state.comparisonSlots, { key: '', data: null, loading: false, error: null }] }
  )),
  removeComparisonSlot: (index) => set((state) => (
    state.comparisonSlots.length <= 2
      ? state
      : { comparisonSlots: state.comparisonSlots.filter((_, i) => i !== index) }
  )),
  reorderComparisonSlots: (orderedSlots) => set({ comparisonSlots: orderedSlots }),
  setComparisonKey: (index, key) => set((state) => {
    const next = [...state.comparisonSlots]
    if (next[index]) next[index].key = key
    return { comparisonSlots: next }
  }),
  setComparisonData: (index, data) => set((state) => {
    const next = [...state.comparisonSlots]
    if (next[index]) { next[index].data = data; next[index].error = null; }
    return { comparisonSlots: next }
  }),
  setComparisonLoading: (index, loading) => set((state) => {
    const next = [...state.comparisonSlots]
    if (next[index]) next[index].loading = loading
    return { comparisonSlots: next }
  }),
  setComparisonError: (index, error) => set((state) => {
    const next = [...state.comparisonSlots]
    if (next[index]) { next[index].error = error; next[index].data = null; }
    return { comparisonSlots: next }
  }),

  walletConnected: false,
  walletType: null,
  walletPublicKey: null,
  setWalletConnected: (connected, type = null, publicKey = null) => set({ walletConnected: connected, walletType: type, walletPublicKey: publicKey }),
  disconnectWallet: () => set({ walletConnected: false, walletType: null, walletPublicKey: null }),

  notifications: [],
  notificationHistory: [],
  unreadNotificationCount: 0,
  addNotification: (notification) => set((state) => ({
    notifications: [notification, ...state.notifications],
  })),
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id),
  })),
  addNotificationHistory: (notification) => set((state) => ({
    notificationHistory: [{...notification, read: false}, ...state.notificationHistory],
    unreadNotificationCount: state.unreadNotificationCount + 1
  })),
  markNotificationRead: (id) => set((state) => {
    const history = state.notificationHistory.map(n => 
      n.id === id && !n.read ? { ...n, read: true } : n
    )
    const unreadCount = history.filter(n => !n.read).length
    return { notificationHistory: history, unreadNotificationCount: unreadCount }
  }),
  markAllNotificationsRead: () => set((state) => ({
    notificationHistory: state.notificationHistory.map(n => ({ ...n, read: true })),
    unreadNotificationCount: 0
  })),
  clearNotificationHistory: () => set({
    notificationHistory: [],
    unreadNotificationCount: 0
  }),

  streamStatus: 'disconnected',
  streamLedgers: [],
  streamError: null,
  setStreamStatus: (status) => set({ streamStatus: status }),
  addStreamLedger: (l) => set((state) => (
    state.streamLedgers.some((existing) => existing.sequence === l.sequence)
      ? state
      : { streamLedgers: [l, ...state.streamLedgers].slice(0, 50) }
  )),
  clearStreamLedgers: () => set({ streamLedgers: [] }),
  setStreamError: (e) => set({ streamError: e }),
}))

// ─── Expose store for e2e testing ────────────────────────────────────────────
if (typeof window !== 'undefined') {
  (window as any).__store = useStore
}

// ─── Persistence middleware ───────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  getStoredValue(STORE_PERSIST_KEY).then((saved: Record<string, unknown> | null) => {
    if (saved && typeof saved === 'object') {
      const slice: Partial<StoreState> = {}
      for (const key of PERSIST_KEYS) {
        if (key in saved) (slice as Record<string, unknown>)[key] = saved[key as string]
      }
      if (slice.searchFilters) {
        slice.searchFilters = { ...DEFAULT_SEARCH_FILTERS, ...slice.searchFilters }
      }
      if (Object.keys(slice).length > 0) useStore.setState(slice)
    }
  }).catch(() => {})

  useStore.subscribe((state) => {
    const slice: Record<string, unknown> = {}
    for (const key of PERSIST_KEYS) slice[key] = state[key]
    syncState(STORE_PERSIST_KEY, slice).catch(() => {})
  })

  onStateChange((key: string, value: unknown) => {
    if (key === STORE_PERSIST_KEY && value && typeof value === 'object') {
      const current = useStore.getState()
      const incoming = value as Record<string, unknown>
      const patch: Partial<StoreState> = {}
      for (const k of PERSIST_KEYS) {
        if (incoming[k] !== undefined && incoming[k] !== current[k]) {
          (patch as Record<string, unknown>)[k] = incoming[k]
        }
      }
      if (Object.keys(patch).length > 0) useStore.setState(patch)
    }
  })
}
