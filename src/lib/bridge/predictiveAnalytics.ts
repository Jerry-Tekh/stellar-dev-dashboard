import type {
  BridgeProtocol,
  ChainId,
  CongestionForecast,
  TransferCompletionPrediction,
  BridgeTransfer,
} from '../../types/bridge'
import { getBridgeById } from './bridgeRegistry'

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function forecastCongestion(
  bridgeId: BridgeProtocol,
  chain: ChainId,
  seed = Date.now()
): CongestionForecast {
  const rand = seededRandom(seed + bridgeId.length + chain.length)
  const current = 0.2 + rand() * 0.6
  const trend = (rand() - 0.5) * 0.3
  const predicted1h = Math.min(1, Math.max(0, current + trend))
  const predicted24h = Math.min(1, Math.max(0, current + trend * 2.5))
  const now = Date.now()
  const windowOffset = Math.floor(rand() * 4) * 3600_000

  return {
    bridgeId,
    chain,
    currentLevel: Math.round(current * 100) / 100,
    predictedLevel1h: Math.round(predicted1h * 100) / 100,
    predictedLevel24h: Math.round(predicted24h * 100) / 100,
    optimalWindowStart: now + windowOffset,
    optimalWindowEnd: now + windowOffset + 2 * 3600_000,
    confidence: 0.75 + rand() * 0.15,
  }
}

export function predictTransferCompletion(transfer: BridgeTransfer): TransferCompletionPrediction {
  const bridge = getBridgeById(transfer.protocol)
  const baseTimeSec = bridge?.avgTransferTimeSec ?? 300
  const elapsed = (Date.now() - transfer.initiatedAt) / 1000
  const progressFactor: Record<string, number> = {
    initiated: 0.1,
    source_confirmed: 0.35,
    relaying: 0.6,
    destination_pending: 0.85,
    completed: 1,
    failed: 1,
    refunded: 1,
  }
  const progress = progressFactor[transfer.status] ?? 0.1
  const remainingSec = Math.max(0, baseTimeSec * (1 - progress))
  const slippagePenalty = transfer.slippageBps > 50 ? 30 : 0
  const predictedCompletionAt = Date.now() + (remainingSec + slippagePenalty) * 1000

  const factors: string[] = []
  if (transfer.slippageBps > 50) factors.push('elevated slippage')
  if (transfer.status === 'relaying') factors.push('relayer confirmation pending')
  if (elapsed > baseTimeSec * 0.8) factors.push('approaching average completion time')

  const confidence = transfer.status === 'completed' ? 1 : Math.min(0.95, 0.72 + progress * 0.2)

  return {
    transferId: transfer.id,
    predictedCompletionAt,
    confidence: Math.round(confidence * 1000) / 1000,
    factors,
  }
}

export function estimateOptimalGasPrice(chain: ChainId, urgency: 'low' | 'medium' | 'high'): number {
  const baseGwei: Record<ChainId, number> = {
    stellar: 0.00001,
    ethereum: 25,
    polygon: 35,
    arbitrum: 0.15,
    optimism: 0.02,
    avalanche: 28,
    bnb: 3,
    solana: 0.000005,
    cosmos: 0.025,
    polkadot: 0.01,
    near: 0.0001,
    base: 0.02,
  }
  const multiplier = urgency === 'high' ? 1.5 : urgency === 'medium' ? 1.1 : 0.85
  return Math.round((baseGwei[chain] ?? 10) * multiplier * 1000) / 1000
}

export function forecastCapacityShortage(
  bridgeId: BridgeProtocol,
  chain: ChainId,
  utilizationPct: number
): { shortageLikely: boolean; hoursUntilShortage: number | null; confidence: number } {
  const growthRate = 0.02 + (utilizationPct / 100) * 0.05
  const hoursUntilShortage =
    utilizationPct > 85 ? Math.max(1, Math.round((100 - utilizationPct) / growthRate)) : null

  return {
    shortageLikely: utilizationPct > 75,
    hoursUntilShortage,
    confidence: utilizationPct > 85 ? 0.88 : 0.72,
  }
}
