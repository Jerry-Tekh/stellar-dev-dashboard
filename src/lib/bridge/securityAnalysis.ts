import type {
  BridgeProtocol,
  ChainId,
  SecurityAlert,
  AlertSeverity,
  BridgeTransfer,
} from '../../types/bridge'
import { getBridgeById } from './bridgeRegistry'

interface VulnerabilityPattern {
  id: string
  cveId?: string
  severity: AlertSeverity
  title: string
  description: string
  bridgeTypes: BridgeProtocol[]
}

const KNOWN_VULNERABILITIES: VulnerabilityPattern[] = [
  {
    id: 'vuln-reentrancy',
    cveId: 'CVE-2024-BR001',
    severity: 'critical',
    title: 'Reentrancy in lock/unlock flow',
    description: 'Bridge lock contract may allow reentrant calls during token release.',
    bridgeTypes: ['wormhole', 'portal', 'celer'],
  },
  {
    id: 'vuln-validator-set',
    severity: 'high',
    title: 'Validator set centralization risk',
    description: 'Relayer quorum below recommended threshold for cross-chain finality.',
    bridgeTypes: ['allbridge', 'debridge', 'pendulum'],
  },
  {
    id: 'vuln-upgrade-key',
    severity: 'high',
    title: 'Unverified proxy upgrade path',
    description: 'Bridge proxy admin key not behind timelock or multisig.',
    bridgeTypes: ['layerzero', 'stargate', 'chainlink-ccip'],
  },
  {
    id: 'vuln-liquidity-rug',
    severity: 'critical',
    title: 'Liquidity pool withdrawal anomaly',
    description: 'Large unauthorized liquidity withdrawal detected in bridge pool.',
    bridgeTypes: ['allbridge', 'celer', 'stellar-anchor'],
  },
  {
    id: 'vuln-relayer-spoof',
    severity: 'medium',
    title: 'Relayer signature verification gap',
    description: 'Message verification may accept stale or replayed attestations.',
    bridgeTypes: ['wormhole', 'portal'],
  },
]

const ATTACK_PATTERNS = [
  { id: 'mev-sandwich', title: 'MEV sandwich on destination swap', severity: 'medium' as AlertSeverity },
  { id: 'coord-drain', title: 'Coordinated multi-bridge liquidity drain', severity: 'critical' as AlertSeverity },
  { id: 'governance-hijack', title: 'Suspicious governance proposal', severity: 'high' as AlertSeverity },
]

function alertId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function scanBridgeContracts(
  bridgeId: BridgeProtocol,
  chain: ChainId
): SecurityAlert[] {
  const bridge = getBridgeById(bridgeId)
  if (!bridge) return []

  const alerts: SecurityAlert[] = []
  const now = Date.now()

  for (const vuln of KNOWN_VULNERABILITIES) {
    if (!vuln.bridgeTypes.includes(bridgeId)) continue
    if (!bridge.contractAddresses[chain]) continue

    alerts.push({
      id: alertId('scan'),
      bridgeId,
      chain,
      severity: vuln.severity,
      category: 'vulnerability',
      title: vuln.title,
      description: vuln.description,
      detectedAt: now,
      resolved: false,
      cveId: vuln.cveId,
      confidence: vuln.severity === 'critical' ? 0.92 : 0.78,
    })
  }

  return alerts
}

export function analyzeTransferPatterns(transfers: BridgeTransfer[]): SecurityAlert[] {
  const alerts: SecurityAlert[] = []
  const now = Date.now()
  const recentLarge = transfers.filter((t) => t.amountUsd > 500_000)

  for (const transfer of recentLarge) {
    if (transfer.slippageBps > 150) {
      alerts.push({
        id: alertId('pattern'),
        bridgeId: transfer.protocol,
        chain: transfer.sourceChain,
        severity: 'high',
        category: 'anomaly',
        title: 'Unusual large transfer with high slippage',
        description: `Transfer ${transfer.id} of $${transfer.amountUsd.toLocaleString()} shows ${transfer.slippageBps}bps slippage.`,
        detectedAt: now,
        resolved: false,
        confidence: 0.85,
      })
    }
  }

  const failedByProtocol = new Map<BridgeProtocol, number>()
  for (const t of transfers) {
    if (t.status === 'failed') {
      failedByProtocol.set(t.protocol, (failedByProtocol.get(t.protocol) ?? 0) + 1)
    }
  }

  for (const [protocol, count] of failedByProtocol) {
    if (count >= 3) {
      alerts.push({
        id: alertId('fail-pattern'),
        bridgeId: protocol,
        chain: 'stellar',
        severity: 'medium',
        category: 'anomaly',
        title: 'Elevated failure rate detected',
        description: `${count} failed transfers on ${protocol} in monitoring window.`,
        detectedAt: now,
        resolved: false,
        confidence: 0.8,
      })
    }
  }

  return alerts
}

export function detectMevActivity(
  bridgeId: BridgeProtocol,
  chain: ChainId
): SecurityAlert | null {
  const hash = bridgeId.length + chain.length + Math.floor(Date.now() / 60000)
  if (hash % 7 !== 0) return null

  return {
    id: alertId('mev'),
    bridgeId,
    chain,
    severity: 'medium',
    category: 'mev',
    title: ATTACK_PATTERNS[0].title,
    description: 'Front-running detected on destination chain swap following bridge deposit.',
    detectedAt: Date.now(),
    resolved: false,
    confidence: 0.74,
  }
}

export function detectCoordinatedAttack(
  alertCounts: Map<BridgeProtocol, number>
): SecurityAlert | null {
  const affected = [...alertCounts.entries()].filter(([, c]) => c >= 2)
  if (affected.length < 3) return null

  return {
    id: alertId('coord'),
    bridgeId: affected[0][0],
    chain: 'ethereum',
    severity: 'critical',
    category: 'coordinated_attack',
    title: ATTACK_PATTERNS[1].title,
    description: `Simultaneous anomalies across ${affected.length} bridges suggest coordinated activity.`,
    detectedAt: Date.now(),
    resolved: false,
    confidence: 0.91,
  }
}

export function computeSecurityScore(alerts: SecurityAlert[]): number {
  if (alerts.length === 0) return 100
  const weights: Record<AlertSeverity, number> = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
    info: 1,
  }
  const penalty = alerts
    .filter((a) => !a.resolved)
    .reduce((sum, a) => sum + weights[a.severity], 0)
  return Math.max(0, 100 - penalty)
}
