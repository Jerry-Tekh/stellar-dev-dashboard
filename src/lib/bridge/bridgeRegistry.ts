import type { BridgeProtocolInfo, ChainId, ChainNetwork } from '../../types/bridge'

export const SUPPORTED_CHAINS: ChainNetwork[] = [
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

export const SUPPORTED_BRIDGES: BridgeProtocolInfo[] = [
  {
    id: 'allbridge',
    name: 'Allbridge',
    supportedChains: ['stellar', 'ethereum', 'polygon', 'bnb', 'solana', 'near'],
    tvlUsd: 48_000_000,
    avgTransferTimeSec: 180,
    successRate: 0.987,
    contractAddresses: {
      stellar: 'CALLBRDG...STELLAR',
      ethereum: '0xAllbridgeEth001',
      polygon: '0xAllbridgePol001',
    },
  },
  {
    id: 'wormhole',
    name: 'Wormhole',
    supportedChains: ['stellar', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'solana', 'bnb', 'base'],
    tvlUsd: 1_200_000_000,
    avgTransferTimeSec: 420,
    successRate: 0.992,
    contractAddresses: {
      stellar: 'CWORMHOLE...STELLAR',
      ethereum: '0xWormholeCore001',
      solana: 'worm2Un...Sol001',
    },
  },
  {
    id: 'layerzero',
    name: 'LayerZero',
    supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'bnb', 'base'],
    tvlUsd: 890_000_000,
    avgTransferTimeSec: 300,
    successRate: 0.989,
    contractAddresses: { ethereum: '0xLayerZero001', arbitrum: '0xLayerZeroArb001' },
  },
  {
    id: 'celer',
    name: 'Celer cBridge',
    supportedChains: ['stellar', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'bnb', 'cosmos'],
    tvlUsd: 210_000_000,
    avgTransferTimeSec: 240,
    successRate: 0.985,
    contractAddresses: { stellar: 'CCELER...STELLAR', ethereum: '0xCelerBridge001' },
  },
  {
    id: 'stargate',
    name: 'Stargate',
    supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'bnb', 'base'],
    tvlUsd: 520_000_000,
    avgTransferTimeSec: 180,
    successRate: 0.991,
    contractAddresses: { ethereum: '0xStargateRouter001' },
  },
  {
    id: 'portal',
    name: 'Portal (Wormhole)',
    supportedChains: ['ethereum', 'polygon', 'solana', 'bnb', 'base'],
    tvlUsd: 340_000_000,
    avgTransferTimeSec: 360,
    successRate: 0.988,
    contractAddresses: { ethereum: '0xPortalBridge001' },
  },
  {
    id: 'debridge',
    name: 'deBridge',
    supportedChains: ['ethereum', 'polygon', 'arbitrum', 'bnb', 'solana', 'near'],
    tvlUsd: 95_000_000,
    avgTransferTimeSec: 210,
    successRate: 0.984,
    contractAddresses: { ethereum: '0xDeBridge001' },
  },
  {
    id: 'chainlink-ccip',
    name: 'Chainlink CCIP',
    supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'base'],
    tvlUsd: 780_000_000,
    avgTransferTimeSec: 480,
    successRate: 0.995,
    contractAddresses: { ethereum: '0xCCIPRouter001' },
  },
  {
    id: 'stellar-anchor',
    name: 'Stellar Anchor Bridge',
    supportedChains: ['stellar', 'ethereum', 'polygon'],
    tvlUsd: 62_000_000,
    avgTransferTimeSec: 120,
    successRate: 0.993,
    contractAddresses: { stellar: 'CANCHOR...STELLAR' },
  },
  {
    id: 'pendulum',
    name: 'Pendulum / Spacewalk',
    supportedChains: ['stellar', 'polkadot', 'near'],
    tvlUsd: 28_000_000,
    avgTransferTimeSec: 300,
    successRate: 0.981,
    contractAddresses: { stellar: 'CPENDULUM...STELLAR', polkadot: 'pendulumBridge001' },
  },
]

export function getBridgeById(id: string): BridgeProtocolInfo | undefined {
  return SUPPORTED_BRIDGES.find((b) => b.id === id)
}

export function getChainById(id: ChainId): ChainNetwork | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === id)
}

export function bridgesForRoute(source: ChainId, dest: ChainId): BridgeProtocolInfo[] {
  return SUPPORTED_BRIDGES.filter(
    (b) => b.supportedChains.includes(source) && b.supportedChains.includes(dest)
  )
}
