/**
 * Bridge monitoring engine — server-side mirror of src/lib/bridge logic.
 * Uses deterministic simulation for multi-chain bridge data.
 */

const CHAINS = [
  { id: 'stellar', name: 'Stellar', nativeAsset: 'XLM', avgBlockTimeMs: 5000, rpcLatencyMs: 120, status: 'healthy' },
  { id: 'ethereum', name: 'Ethereum', nativeAsset: 'ETH', avgBlockTimeMs: 12000, rpcLatencyMs: 180, status: 'healthy' },
  { id: 'polygon', name: 'Polygon', nativeAsset: 'MATIC', avgBlockTimeMs: 2000, rpcLatencyMs: 95, status: 'healthy' },
  { id: 'arbitrum', name: 'Arbitrum', nativeAsset: 'ETH', avgBlockTimeMs: 250, rpcLatencyMs: 110, status: 'healthy' },
  { id: 'optimism', name: 'Optimism', nativeAsset: 'ETH', avgBlockTimeMs: 2000, rpcLatencyMs: 105, status: 'healthy' },
  { id: 'avalanche', name: 'Avalanche', nativeAsset: 'AVAX', avgBlockTimeMs: 2000, rpcLatencyMs: 130, status: 'degraded' },
  { id: 'bnb', name: 'BNB Chain', nativeAsset: 'BNB', avgBlockTimeMs: 3000, rpcLatencyMs: 90, status: 'healthy' },
  { id: 'solana', name: 'Solana', nativeAsset: 'SOL', avgBlockTimeMs: 400, rpcLatencyMs: 75, status: 'healthy' },
  { id: 'cosmos', name: 'Cosmos Hub', nativeAsset: 'ATOM', avgBlockTimeMs: 6000, rpcLatencyMs: 140, status: 'healthy' },
  { id: 'polkadot', name: 'Polkadot', nativeAsset: 'DOT', avgBlockTimeMs: 6000, rpcLatencyMs: 150, status: 'healthy' },
  { id: 'near', name: 'NEAR', nativeAsset: 'NEAR', avgBlockTimeMs: 1000, rpcLatencyMs: 85, status: 'healthy' },
  { id: 'base', name: 'Base', nativeAsset: 'ETH', avgBlockTimeMs: 2000, rpcLatencyMs: 100, status: 'healthy' },
]

const BRIDGES = [
  { id: 'allbridge', name: 'Allbridge', supportedChains: ['stellar', 'ethereum', 'polygon', 'bnb', 'solana', 'near'], tvlUsd: 48000000, avgTransferTimeSec: 180, successRate: 0.987 },
  { id: 'wormhole', name: 'Wormhole', supportedChains: ['stellar', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'solana', 'bnb', 'base'], tvlUsd: 1200000000, avgTransferTimeSec: 420, successRate: 0.992 },
  { id: 'layerzero', name: 'LayerZero', supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'bnb', 'base'], tvlUsd: 890000000, avgTransferTimeSec: 300, successRate: 0.989 },
  { id: 'celer', name: 'Celer cBridge', supportedChains: ['stellar', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'bnb', 'cosmos'], tvlUsd: 210000000, avgTransferTimeSec: 240, successRate: 0.985 },
  { id: 'stargate', name: 'Stargate', supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'bnb', 'base'], tvlUsd: 520000000, avgTransferTimeSec: 180, successRate: 0.991 },
  { id: 'portal', name: 'Portal', supportedChains: ['ethereum', 'polygon', 'solana', 'bnb', 'base'], tvlUsd: 340000000, avgTransferTimeSec: 360, successRate: 0.988 },
  { id: 'debridge', name: 'deBridge', supportedChains: ['ethereum', 'polygon', 'arbitrum', 'bnb', 'solana', 'near'], tvlUsd: 95000000, avgTransferTimeSec: 210, successRate: 0.984 },
  { id: 'chainlink-ccip', name: 'Chainlink CCIP', supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'base'], tvlUsd: 780000000, avgTransferTimeSec: 480, successRate: 0.995 },
  { id: 'stellar-anchor', name: 'Stellar Anchor Bridge', supportedChains: ['stellar', 'ethereum', 'polygon'], tvlUsd: 62000000, avgTransferTimeSec: 120, successRate: 0.993 },
  { id: 'pendulum', name: 'Pendulum / Spacewalk', supportedChains: ['stellar', 'polkadot', 'near'], tvlUsd: 28000000, avgTransferTimeSec: 300, successRate: 0.981 },
]

const ASSETS = ['USDC', 'USDT', 'XLM', 'ETH', 'WBTC']
const STATUSES = ['initiated', 'source_confirmed', 'relaying', 'destination_pending', 'completed', 'failed']

function pick(arr, i) { return arr[i % arr.length] }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }

function generateTransfers(count, seed) {
  const now = Date.now()
  const transfers = []
  for (let i = 0; i < count; i++) {
    const h = hash(`${seed}-${i}`)
    const sourceChain = pick(CHAINS, h).id
    let destChain = pick(CHAINS, h + 3).id
    if (destChain === sourceChain) destChain = pick(CHAINS, h + 5).id
    const eligible = BRIDGES.filter(b => b.supportedChains.includes(sourceChain) && b.supportedChains.includes(destChain))
    const bridge = pick(eligible.length ? eligible : BRIDGES, h)
    const status = pick(STATUSES, h + i)
    const initiatedAt = now - (h % 7200) * 1000
    const amountUsd = 500 + (h % 500000)
    transfers.push({
      id: `xfer-${seed}-${i.toString(36)}`,
      protocol: bridge.id,
      sourceChain,
      destinationChain: destChain,
      asset: pick(ASSETS, h),
      amount: amountUsd,
      amountUsd,
      status,
      initiatedAt,
      updatedAt: initiatedAt + (h % 600) * 1000,
      estimatedCompletionAt: initiatedAt + bridge.avgTransferTimeSec * 1000,
      gasCostUsd: 1 + (h % 50),
      slippageBps: h % 200,
      relayerAddress: `GREL${(h % 99999).toString().padStart(5, '0')}STELLAR`,
    })
  }
  return transfers
}

function generateLiquidity(seed) {
  const pools = []
  for (const bridge of BRIDGES) {
    for (const chain of bridge.supportedChains.slice(0, 3)) {
      const h = hash(`${seed}-${bridge.id}-${chain}`)
      pools.push({
        bridgeId: bridge.id,
        chain,
        asset: pick(ASSETS, h),
        liquidityUsd: bridge.tvlUsd / bridge.supportedChains.length + (h % 1000000),
        utilizationPct: 30 + (h % 65),
        change24hPct: -12 + (h % 25),
      })
    }
  }
  return pools
}

function generateAlerts(transfers) {
  const alerts = [{
    id: `scan-${Date.now()}`,
    bridgeId: 'wormhole',
    chain: 'ethereum',
    severity: 'critical',
    category: 'vulnerability',
    title: 'Reentrancy in lock/unlock flow',
    description: 'Bridge lock contract may allow reentrant calls during token release.',
    detectedAt: Date.now(),
    resolved: false,
    cveId: 'CVE-2024-BR001',
    confidence: 0.92,
  }]
  for (const t of transfers.filter(x => x.amountUsd > 500000 && x.slippageBps > 150)) {
    alerts.push({
      id: `pattern-${t.id}`,
      bridgeId: t.protocol,
      chain: t.sourceChain,
      severity: 'high',
      category: 'anomaly',
      title: 'Unusual large transfer with high slippage',
      description: `Transfer ${t.id} of $${t.amountUsd} shows ${t.slippageBps}bps slippage.`,
      detectedAt: Date.now(),
      resolved: false,
      confidence: 0.85,
    })
  }
  return alerts
}

function generateRouting() {
  return [
    { id: 'route-stellar-eth', sourceChain: 'stellar', destinationChain: 'ethereum', asset: 'USDC', amountUsd: 50000, recommendedProtocol: 'allbridge', alternativeProtocols: ['wormhole', 'celer'], estimatedTimeSec: 180, estimatedCostUsd: 2.5, savingsPct: 24, hops: [{ chain: 'stellar', protocol: 'allbridge' }, { chain: 'ethereum', protocol: 'allbridge' }], reason: 'Optimal route saves ~24% vs slowest option' },
    { id: 'route-stellar-poly', sourceChain: 'stellar', destinationChain: 'polygon', asset: 'USDC', amountUsd: 10000, recommendedProtocol: 'stellar-anchor', alternativeProtocols: ['allbridge'], estimatedTimeSec: 120, estimatedCostUsd: 1.5, savingsPct: 22, hops: [{ chain: 'stellar', protocol: 'stellar-anchor' }, { chain: 'polygon', protocol: 'stellar-anchor' }], reason: 'Fastest reliable path via stellar-anchor' },
  ]
}

let cachedSnapshot = null
let lastRefresh = 0

export function buildSnapshot() {
  const now = Date.now()
  if (cachedSnapshot && now - lastRefresh < 30000) return cachedSnapshot

  const transfers = generateTransfers(48, now)
  const activeTransfers = transfers.filter(t => ['initiated', 'source_confirmed', 'relaying', 'destination_pending'].includes(t.status))
  const alerts = generateAlerts(transfers)
  const completed = transfers.filter(t => t.status === 'completed')

  cachedSnapshot = {
    timestamp: now,
    networks: CHAINS,
    bridges: BRIDGES,
    activeTransfers,
    allTransfers: transfers,
    liquidityPools: generateLiquidity(now),
    securityAlerts: alerts,
    congestionForecasts: BRIDGES.slice(0, 4).flatMap(b => b.supportedChains.slice(0, 2).map(c => ({
      bridgeId: b.id, chain: c, currentLevel: 0.45, predictedLevel1h: 0.52, predictedLevel24h: 0.38,
      optimalWindowStart: now + 3600000, optimalWindowEnd: now + 7200000, confidence: 0.82,
    }))),
    routingSuggestions: generateRouting(),
    predictions: activeTransfers.map(t => ({
      transferId: t.id,
      predictedCompletionAt: t.estimatedCompletionAt,
      confidence: 0.84,
      factors: ['relayer confirmation pending'],
    })),
    performanceReport: {
      period: '24h',
      totalTransfers: transfers.length,
      successRate: completed.length / transfers.length,
      avgCompletionTimeSec: 240,
      totalVolumeUsd: transfers.reduce((s, t) => s + t.amountUsd, 0),
      securityAlertsCount: alerts.length,
      costSavingsPct: 22,
      predictionAccuracyPct: 84,
    },
    healthScore: 87,
  }
  lastRefresh = now
  return cachedSnapshot
}

export { CHAINS, BRIDGES }
