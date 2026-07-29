import type { BridgeMonitorSnapshot, BridgeTransfer, RoutingSuggestion, SecurityAlert } from '../../types/bridge'
import { getMonitorSnapshot } from './monitorEngine'

const DEFAULT_API_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_BRIDGE_MONITOR_URL
    ? String(import.meta.env.VITE_BRIDGE_MONITOR_URL)
    : 'http://localhost:3099'

export interface BridgeMonitorClientOptions {
  baseUrl?: string
  preferRemote?: boolean
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export class BridgeMonitorClient {
  private baseUrl: string
  private preferRemote: boolean

  constructor(options: BridgeMonitorClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_URL).replace(/\/$/, '')
    this.preferRemote = options.preferRemote ?? true
  }

  async getHealth(): Promise<{ status: string; latencyMs: number } | null> {
    return fetchJson(`${this.baseUrl}/health`)
  }

  async getSnapshot(): Promise<BridgeMonitorSnapshot> {
    if (this.preferRemote) {
      const remote = await fetchJson<BridgeMonitorSnapshot>(`${this.baseUrl}/api/v1/snapshot`)
      if (remote) return remote
    }
    return getMonitorSnapshot()
  }

  async getTransfers(): Promise<BridgeTransfer[]> {
    if (this.preferRemote) {
      const remote = await fetchJson<{ transfers: BridgeTransfer[] }>(
        `${this.baseUrl}/api/v1/transfers`
      )
      if (remote?.transfers) return remote.transfers
    }
    return getMonitorSnapshot().activeTransfers
  }

  async getAlerts(): Promise<SecurityAlert[]> {
    if (this.preferRemote) {
      const remote = await fetchJson<{ alerts: SecurityAlert[] }>(`${this.baseUrl}/api/v1/alerts`)
      if (remote?.alerts) return remote.alerts
    }
    return getMonitorSnapshot().securityAlerts
  }

  async getRoutingSuggestions(): Promise<RoutingSuggestion[]> {
    if (this.preferRemote) {
      const remote = await fetchJson<{ suggestions: RoutingSuggestion[] }>(
        `${this.baseUrl}/api/v1/routing/suggestions`
      )
      if (remote?.suggestions) return remote.suggestions
    }
    return getMonitorSnapshot().routingSuggestions
  }

  async getReport(): Promise<BridgeMonitorSnapshot['performanceReport']> {
    if (this.preferRemote) {
      const remote = await fetchJson<{ report: BridgeMonitorSnapshot['performanceReport'] }>(
        `${this.baseUrl}/api/v1/reports/performance`
      )
      if (remote?.report) return remote.report
    }
    return getMonitorSnapshot().performanceReport
  }
}

export const bridgeMonitorClient = new BridgeMonitorClient()
