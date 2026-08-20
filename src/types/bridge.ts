export type ChainId =
  | 'stellar'
  | 'ethereum'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'avalanche'
  | 'bnb'
  | 'solana'
  | 'cosmos'
  | 'polkadot'
  | 'near'
  | 'base'

export type TransferStatus =
  | 'initiated'
  | 'source_confirmed'
  | 'relaying'
  | 'destination_pending'
  | 'completed'
  | 'failed'
  | 'refunded'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type BridgeProtocol =
  | 'allbridge'
  | 'wormhole'
  | 'layerzero'
  | 'celer'
  | 'stargate'
  | 'portal'
  | 'debridge'
  | 'chainlink-ccip'
  | 'stellar-anchor'
  | 'pendulum'

export interface ChainNetwork {
  id: ChainId
  name: string
  nativeAsset: string
  avgBlockTimeMs: number
  rpcLatencyMs: number
  status: 'healthy' | 'degraded' | 'down'
}

export interface BridgeProtocolInfo {
  id: BridgeProtocol
  name: string
  supportedChains: ChainId[]
  tvlUsd: number
  avgTransferTimeSec: number
  successRate: number
  contractAddresses: Partial<Record<ChainId, string>>
}

export interface BridgeTransfer {
  id: string
  protocol: BridgeProtocol
  sourceChain: ChainId
  destinationChain: ChainId
  asset: string
  amount: number
  amountUsd: number
  status: TransferStatus
  initiatedAt: number
  updatedAt: number
  estimatedCompletionAt: number
  gasCostUsd: number
  slippageBps: number
  relayerAddress?: string
  sourceTxHash?: string
  destinationTxHash?: string
  failureReason?: string
}

export interface LiquidityPoolSnapshot {
  bridgeId: BridgeProtocol
  chain: ChainId
  asset: string
  liquidityUsd: number
  utilizationPct: number
  change24hPct: number
}

export interface SecurityAlert {
  id: string
  bridgeId: BridgeProtocol
  chain: ChainId
  severity: AlertSeverity
  category:
    | 'vulnerability'
    | 'anomaly'
    | 'liquidity_drain'
    | 'governance'
    | 'relayer_misbehavior'
    | 'mev'
    | 'coordinated_attack'
  title: string
  description: string
  detectedAt: number
  resolved: boolean
  cveId?: string
  confidence: number
}

export interface CongestionForecast {
  bridgeId: BridgeProtocol
  chain: ChainId
  currentLevel: number
  predictedLevel1h: number
  predictedLevel24h: number
  optimalWindowStart: number
  optimalWindowEnd: number
  confidence: number
}

export interface RoutingSuggestion {
  id: string
  sourceChain: ChainId
  destinationChain: ChainId
  asset: string
  amountUsd: number
  recommendedProtocol: BridgeProtocol
  alternativeProtocols: BridgeProtocol[]
  estimatedTimeSec: number
  estimatedCostUsd: number
  savingsPct: number
  hops: Array<{ chain: ChainId; protocol: BridgeProtocol }>
  reason: string
}

export interface TransferCompletionPrediction {
  transferId: string
  predictedCompletionAt: number
  confidence: number
  factors: string[]
}

export interface BridgePerformanceReport {
  period: string
  totalTransfers: number
  successRate: number
  avgCompletionTimeSec: number
  totalVolumeUsd: number
  securityAlertsCount: number
  costSavingsPct: number
  predictionAccuracyPct: number
  byProtocol: Record<
    BridgeProtocol,
    {
      transfers: number
      successRate: number
      avgCostUsd: number
      avgTimeSec: number
    }
  >
}

export interface BridgeMonitorSnapshot {
  timestamp: number
  networks: ChainNetwork[]
  bridges: BridgeProtocolInfo[]
  activeTransfers: BridgeTransfer[]
  liquidityPools: LiquidityPoolSnapshot[]
  securityAlerts: SecurityAlert[]
  congestionForecasts: CongestionForecast[]
  routingSuggestions: RoutingSuggestion[]
  predictions: TransferCompletionPrediction[]
  performanceReport: BridgePerformanceReport
  healthScore: number
}

export interface AnomalyScore {
  entityId: string
  entityType: 'bridge' | 'transfer' | 'relayer' | 'pool'
  score: number
  isAnomaly: boolean
  features: Record<string, number>
  explanation: string
}
