import { useCallback, useEffect, useRef, useState } from 'react'
import type { NetworkName } from '../lib/stellar'
import type {
  CapacityScenario,
  IntelligentAlert,
  MonitoringPreferences,
  NetworkIntelligenceSnapshot,
} from '../types/networkIntelligence'
import {
  createDemonstrationSnapshot,
  getNetworkIntelligenceSnapshot,
  NetworkMonitoringError,
  updateAlertStatus,
} from '../lib/networkIntelligence/client'
import { planCapacity } from '../lib/networkIntelligence/analysis'

const PREFERENCES_KEY = 'stellar:network-intelligence:preferences'

const DEFAULT_PREFERENCES: MonitoringPreferences = {
  refreshIntervalMs: 30_000,
  minimumSeverity: 'info',
  autoRefresh: true,
  compactView: false,
}

function loadPreferences(): MonitoringPreferences {
  try {
    const value = localStorage.getItem(PREFERENCES_KEY)
    if (!value) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(value) as Partial<MonitoringPreferences>
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      refreshIntervalMs: [15_000, 30_000, 60_000].includes(parsed.refreshIntervalMs ?? 0)
        ? parsed.refreshIntervalMs!
        : DEFAULT_PREFERENCES.refreshIntervalMs,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function useNetworkIntelligence(network: NetworkName) {
  const [snapshot, setSnapshot] = useState<NetworkIntelligenceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<NetworkMonitoringError | null>(null)
  const [lastRequestId, setLastRequestId] = useState<string | null>(null)
  const [usingCachedData, setUsingCachedData] = useState(false)
  const [demoIncident, setDemoIncident] = useState(false)
  const [preferences, setPreferencesState] = useState<MonitoringPreferences>(loadPreferences)
  const controllerRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async (force = false) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setError(null)
    if (snapshot) setRefreshing(true)
    else setLoading(true)

    try {
      const response = await getNetworkIntelligenceSnapshot(network, {
        signal: controller.signal,
        force,
        allowStale: true,
      })
      if (!controller.signal.aborted) {
        setSnapshot(response.data)
        setLastRequestId(response.requestId)
        setUsingCachedData(response.cached)
        setDemoIncident(false)
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof NetworkMonitoringError
          ? cause
          : new NetworkMonitoringError({
              code: 'unavailable',
              message: cause instanceof Error ? cause.message : 'Unable to load monitoring data.',
              retryable: true,
            }))
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [network, snapshot])

  useEffect(() => {
    void refresh()
    return () => controllerRef.current?.abort()
    // Refresh is intentionally keyed to network, rather than snapshot identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  useEffect(() => {
    if (!preferences.autoRefresh || demoIncident) return undefined
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true)
    }, preferences.refreshIntervalMs)
    return () => window.clearInterval(interval)
  }, [demoIncident, preferences.autoRefresh, preferences.refreshIntervalMs, refresh])

  const setPreferences = useCallback((patch: Partial<MonitoringPreferences>) => {
    setPreferencesState((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next))
      } catch {
        // Preferences remain available for this session when storage is blocked.
      }
      return next
    })
  }, [])

  const simulateIncident = useCallback(() => {
    setSnapshot(createDemonstrationSnapshot(network, true))
    setUsingCachedData(false)
    setError(null)
    setDemoIncident(true)
  }, [network])

  const exitSimulation = useCallback(() => {
    setDemoIncident(false)
    void refresh(true)
  }, [refresh])

  const changeAlertStatus = useCallback((
    alertId: string,
    status: IntelligentAlert['status'],
  ) => {
    setSnapshot((current) => current
      ? { ...current, alerts: updateAlertStatus(current.alerts, alertId, status) }
      : current)
  }, [])

  const capacityPlan = useCallback((scenario: CapacityScenario) => {
    if (!snapshot) return null
    return planCapacity(snapshot.current, scenario)
  }, [snapshot])

  return {
    snapshot,
    loading,
    refreshing,
    error,
    lastRequestId,
    usingCachedData,
    demoIncident,
    preferences,
    refresh,
    setPreferences,
    simulateIncident,
    exitSimulation,
    changeAlertStatus,
    capacityPlan,
  }
}

export default useNetworkIntelligence
