import type {
  BridgeProtocol,
  BridgeTransfer,
  ChainId,
  LiquidityPoolSnapshot,
  TransferStatus,
} from '../../types/bridge'
import { SUPPORTED_BRIDGES, SUPPORTED_CHAINS } from './bridgeRegistry'

const ASSETS = ['USDC', 'USDT', 'XLM', 'ETH', 'WBTC']
const STATUSES: TransferStatus[] = [
  'initiated',
  'source_confirmed',
  'relaying',
  'destination_pending',
  'completed',
  'failed',
]

function pick<T>(arr: T[], index: number): T {
  return arr[index % arr.length]
}

function pseudoHash(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0
  return h
}

export function normalizeTransfer(raw: Record<string, unknown>): BridgeTransfer {
  return {
    id: String(raw.id ?? ''),
    protocol: raw.protocol as BridgeProtocol,
    sourceChain: raw.sourceChain as ChainId,
    destinationChain: raw.destinationChain as ChainId,
    asset: String(raw.asset ?? 'USDC'),
    amount: Number(raw.amount ?? 0),
    amountUsd: Number(raw.amountUsd ?? 0),
    status: (raw.status as TransferStatus) ?? 'initiated',
    initiatedAt: Number(raw.initiatedAt ?? Date.now()),
    updatedAt: Number(raw.updatedAt ?? Date.now()),
    estimatedCompletionAt: Number(raw.estimatedCompletionAt ?? Date.now() + 300_000),
    gasCostUsd: Number(raw.gasCostUsd ?? 0),
    slippageBps: Number(raw.slippageBps ?? 0),
    relayerAddress: raw.relayerAddress as string | undefined,
    sourceTxHash: raw.sourceTxHash as string | undefined,
    destinationTxHash: raw.destinationTxHash as string | undefined,
    failureReason: raw.failureReason as string | undefined,
  }
}

export function generateSyntheticTransfers(count: number, seed = Date.now()): BridgeTransfer[] {
  const transfers: BridgeTransfer[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const h = pseudoHash(`${seed}-${i}`)
    const sourceChain = pick(SUPPORTED_CHAINS, h).id
    let destChain = pick(SUPPORTED_CHAINS, h + 3).id
    if (destChain === sourceChain) destChain = pick(SUPPORTED_CHAINS, h + 5).id

    const bridge = pick(
      SUPPORTED_BRIDGES.filter(
        (b) => b.supportedChains.includes(sourceChain) && b.supportedChains.includes(destChain)
      ),
      h
    ) ?? SUPPORTED_BRIDGES[0]

    const status = pick(STATUSES, h + i)
    const initiatedAt = now - (h % 7200) * 1000
    const amountUsd = 500 + (h % 500_000)

    transfers.push({
      id: `xfer-${seed}-${i.toString(36)}`,
      protocol: bridge.id,
      sourceChain,
      destinationChain: destChain,
      asset: pick(ASSETS, h),
      amount: amountUsd / (pick([1, 0.15, 2500, 0.00003], h) as number),
      amountUsd,
      status,
      initiatedAt,
      updatedAt: initiatedAt + (h % 600) * 1000,
      estimatedCompletionAt: initiatedAt + bridge.avgTransferTimeSec * 1000,
      gasCostUsd: 1 + (h % 50),
      slippageBps: h % 200,
      relayerAddress: `GREL${(h % 99999).toString().padStart(5, '0')}STELLAR`,
      sourceTxHash: status !== 'initiated' ? `${sourceChain}-tx-${h.toString(16)}` : undefined,
      destinationTxHash:
        status === 'completed' ? `${destChain}-tx-${(h + 1).toString(16)}` : undefined,
      failureReason: status === 'failed' ? 'Relayer timeout on destination confirmation' : undefined,
    })
  }

  return transfers
}

export function generateLiquiditySnapshots(seed = Date.now()): LiquidityPoolSnapshot[] {
  const pools: LiquidityPoolSnapshot[] = []
  let idx = 0

  for (const bridge of SUPPORTED_BRIDGES) {
    for (const chain of bridge.supportedChains.slice(0, 3)) {
      const h = pseudoHash(`${seed}-${bridge.id}-${chain}`)
      pools.push({
        bridgeId: bridge.id,
        chain,
        asset: pick(ASSETS, h),
        liquidityUsd: bridge.tvlUsd / bridge.supportedChains.length + (h % 1_000_000),
        utilizationPct: 30 + (h % 65),
        change24hPct: -12 + (h % 25),
      })
      idx++
    }
  }

  return pools
}

export function aggregateTransferMetrics(transfers: BridgeTransfer[]) {
  const completed = transfers.filter((t) => t.status === 'completed')
  const failed = transfers.filter((t) => t.status === 'failed')
  const total = transfers.length

  const avgCompletionSec =
    completed.length > 0
      ? completed.reduce((sum, t) => sum + (t.updatedAt - t.initiatedAt) / 1000, 0) /
        completed.length
      : 0

  return {
    total,
    completed: completed.length,
    failed: failed.length,
    successRate: total > 0 ? completed.length / total : 0,
    avgCompletionSec,
    totalVolumeUsd: transfers.reduce((s, t) => s + t.amountUsd, 0),
    avgGasCostUsd: total > 0 ? transfers.reduce((s, t) => s + t.gasCostUsd, 0) / total : 0,
  }
}
