import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createDemonstrationFraud,
  FraudDetectionError,
  getFraudSnapshot,
} from '../lib/fraudDetection/client'
import {
  batchAssess,
  buildAlertsFromAssessments,
  normalizeThreatIntel,
  updateFraudAlert,
} from '../lib/fraudDetection/analysis'
import type {
  FraudAlert,
  FraudPreferences,
  FraudSeverity,
  FraudSnapshot,
  ThreatIntelEntry,
} from '../types/fraud'

const KEY = 'stellar:fraud-detection:preferences'
const defaults: FraudPreferences = {
  refreshIntervalMs: 45_000,
  minimumSeverity: 'low',
  autoRefresh: true,
  includeLowConfidence: true,
  alertSound: false,
}

function loadPreferences(): FraudPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<FraudPreferences>
    const severities: FraudSeverity[] = ['low', 'medium', 'high', 'critical']
    return {
      ...defaults,
      ...stored,
      minimumSeverity: severities.includes(stored.minimumSeverity ?? 'low')
        ? stored.minimumSeverity!
        : defaults.minimumSeverity,
      refreshIntervalMs: [15_000, 30_000, 45_000, 60_000].includes(
        stored.refreshIntervalMs ?? 0
      )
        ? stored.refreshIntervalMs!
        : defaults.refreshIntervalMs,
    }
  } catch {
    return defaults
  }
}

export default function useFraudDetection(network: string, connectedAddress?: string | null) {
  const [snapshot, setSnapshot] = useState<FraudSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<FraudDetectionError | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [simulation, setSimulation] = useState(false)
  const [importedIntel, setImportedIntel] = useState<ThreatIntelEntry[]>([])
  const [intelMessage, setIntelMessage] = useState('')
  const [preferences, setPreferencesState] = useState<FraudPreferences>(loadPreferences)
  const controller = useRef<AbortController | null>(null)

  const refresh = useCallback(
    async (force = false) => {
      controller.current?.abort()
      const requestController = new AbortController()
      controller.current = requestController
      setError(null)
      if (snapshot) setRefreshing(true)
      else setLoading(true)
      try {
        const result = await getFraudSnapshot(network, {
          signal: requestController.signal,
          force,
          allowStale: true,
          connectedAddress: connectedAddress || undefined,
        })
        if (requestController.signal.aborted) return
        let data = result.data
        if (importedIntel.length) {
          const threatIntel = Array.from(
            new Map(
              [...importedIntel, ...data.threatIntel].map((entry) => [
                `${entry.source}:${entry.address}`,
                entry,
              ])
            ).values()
          )
          const assessments = batchAssess(data.transactions, threatIntel, data.profiles)
          const alerts = buildAlertsFromAssessments(assessments)
          data = {
            ...data,
            threatIntel,
            assessments,
            alerts,
            summary: {
              ...data.summary,
              openAlerts: alerts.filter((alert) => alert.status === 'open').length,
              highRiskCount: assessments.filter(
                (assessment) => assessment.severity === 'high' || assessment.severity === 'critical'
              ).length,
              averageRisk: Math.round(
                assessments.reduce((sum, assessment) => sum + assessment.score, 0) /
                  Math.max(1, assessments.length)
              ),
              blockedAddresses: threatIntel.filter(
                (entry) => !entry.revoked && entry.confidence >= 0.9
              ).length,
            },
          }
        }
        setSnapshot(data)
        setRequestId(result.requestId)
        setCached(result.cached)
        setSimulation(data.state === 'simulation')
      } catch (cause) {
        if (!requestController.signal.aborted) {
          setError(
            cause instanceof FraudDetectionError
              ? cause
              : new FraudDetectionError({
                  code: 'unavailable',
                  message: 'Unable to load fraud intelligence.',
                  retryable: true,
                })
          )
        }
      } finally {
        if (!requestController.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [network, connectedAddress, snapshot, importedIntel]
  )

  useEffect(() => {
    void refresh()
    return () => controller.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, connectedAddress])

  useEffect(() => {
    if (!preferences.autoRefresh || simulation) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true)
    }, preferences.refreshIntervalMs)
    return () => window.clearInterval(id)
  }, [preferences.autoRefresh, preferences.refreshIntervalMs, refresh, simulation])

  const setPreferences = useCallback((patch: Partial<FraudPreferences>) => {
    setPreferencesState((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* storage may be disabled */
      }
      return next
    })
  }, [])

  const simulateIncident = useCallback(() => {
    setSnapshot(
      createDemonstrationFraud(network, true, connectedAddress || undefined, new Date())
    )
    setSimulation(true)
    setError(null)
    setCached(false)
  }, [network, connectedAddress])

  const changeAlertStatus = useCallback((id: string, status: FraudAlert['status']) => {
    setSnapshot((current) =>
      current ? { ...current, alerts: updateFraudAlert(current.alerts, id, status) } : current
    )
  }, [])

  const importThreatIntel = useCallback((raw: unknown) => {
    try {
      const entries = normalizeThreatIntel(
        Array.isArray(raw) ? raw : ((raw as { entries?: unknown }).entries as unknown[]) || []
      )
      if (!entries.length) {
        setIntelMessage(
          'Import rejected: provide a JSON array with address, category, source and lastUpdated.'
        )
        return
      }
      setImportedIntel(entries)
      setIntelMessage(`${entries.length} validated intelligence entries loaded for the next assessment.`)
    } catch {
      setIntelMessage(
        'Import rejected: provide a JSON array with address, category, source and lastUpdated.'
      )
    }
  }, [])

  const meetsSeverity = useCallback(
    (severity: FraudSeverity) => {
      const order: FraudSeverity[] = ['low', 'medium', 'high', 'critical']
      return order.indexOf(severity) >= order.indexOf(preferences.minimumSeverity)
    },
    [preferences.minimumSeverity]
  )

  return {
    snapshot,
    loading,
    refreshing,
    error,
    requestId,
    cached,
    simulation,
    preferences,
    intelMessage,
    importedIntel,
    refresh,
    setPreferences,
    simulateIncident,
    exitSimulation: () => void refresh(true),
    changeAlertStatus,
    importThreatIntel,
    clearIntelMessage: () => setIntelMessage(''),
    meetsSeverity,
  }
}
