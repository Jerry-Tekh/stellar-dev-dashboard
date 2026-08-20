import { useState, useEffect, useCallback, useMemo } from 'react'
import type { BridgeMonitorSnapshot } from '../types/bridge'
import { BridgeMonitorClient, bridgeMonitorClient } from '../lib/bridge/apiClient'

export interface UseBridgeMonitorOptions {
  pollIntervalMs?: number
  preferRemote?: boolean
}

export function useBridgeMonitor(options: UseBridgeMonitorOptions = {}) {
  const { pollIntervalMs = 30000, preferRemote = true } = options
  const [snapshot, setSnapshot] = useState<BridgeMonitorSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiConnected, setApiConnected] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)

  const client = useMemo(
    () => (preferRemote ? bridgeMonitorClient : new BridgeMonitorClient({ preferRemote: false })),
    [preferRemote]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const health = await client.getHealth()
      setApiConnected(health?.status === 'ok')
      const data = await client.getSnapshot()
      setSnapshot(data)
      setLastRefresh(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bridge monitor data')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    let active = true
    refresh()
    const id = setInterval(() => {
      if (active) refresh()
    }, pollIntervalMs)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [refresh, pollIntervalMs])

  const criticalAlerts = useMemo(
    () => snapshot?.securityAlerts.filter((a) => !a.resolved && a.severity === 'critical') ?? [],
    [snapshot]
  )

  const activeTransferCount = snapshot?.activeTransfers.length ?? 0

  return {
    snapshot,
    loading,
    error,
    apiConnected,
    lastRefresh,
    criticalAlerts,
    activeTransferCount,
    refresh,
  }
}

export default useBridgeMonitor
