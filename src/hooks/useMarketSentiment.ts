import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDemonstrationSentiment,
  getSentimentSnapshot,
  MarketSentimentError,
} from '../lib/marketSentiment/client';
import { updateSentimentAlert } from '../lib/marketSentiment/analysis';
import type {
  SentimentAlert,
  SentimentPreferences,
  SentimentSnapshot,
} from '../types/marketSentiment';

const KEY = 'stellar:market-sentiment:preferences',
  defaults: SentimentPreferences = {
    refreshIntervalMs: 60_000,
    minimumConfidence: 0.5,
    includeLowCredibility: false,
    selectedLanguage: 'all',
    autoRefresh: true,
  };
function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}
export default function useMarketSentiment(network: string) {
  const [snapshot, setSnapshot] = useState<SentimentSnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState<MarketSentimentError | null>(null),
    [requestId, setRequestId] = useState<string | null>(null),
    [cached, setCached] = useState(false),
    [simulation, setSimulation] = useState(false),
    [preferences, setPreferencesState] = useState<SentimentPreferences>(load);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(
    async (force = false) => {
      controller.current?.abort();
      controller.current = new AbortController();
      setError(null);
      snapshot ? setRefreshing(true) : setLoading(true);
      try {
        const result = await getSentimentSnapshot(network, {
          signal: controller.current.signal,
          force,
          allowStale: true,
        });
        setSnapshot(result.data);
        setRequestId(result.requestId);
        setCached(result.cached);
        setSimulation(false);
      } catch (cause) {
        if (!controller.current.signal.aborted)
          setError(
            cause instanceof MarketSentimentError
              ? cause
              : new MarketSentimentError({
                  code: 'unavailable',
                  message: 'Unable to load sentiment.',
                  retryable: true,
                })
          );
      } finally {
        if (!controller.current.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [network, snapshot]
  );
  useEffect(() => {
    void refresh();
    return () => controller.current?.abort();
  }, [network]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!preferences.autoRefresh || simulation) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true);
    }, preferences.refreshIntervalMs);
    return () => window.clearInterval(id);
  }, [preferences.autoRefresh, preferences.refreshIntervalMs, refresh, simulation]);
  const setPreferences = useCallback(
    (patch: Partial<SentimentPreferences>) =>
      setPreferencesState((current) => {
        const next = { ...current, ...patch };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* storage may be disabled */
        }
        return next;
      }),
    []
  );
  const simulateCrisis = useCallback(() => {
    setSnapshot(createDemonstrationSentiment(network, true));
    setSimulation(true);
    setError(null);
    setCached(false);
  }, [network]);
  const changeAlertStatus = useCallback(
    (id: string, status: SentimentAlert['status']) =>
      setSnapshot((current) =>
        current ? { ...current, alerts: updateSentimentAlert(current.alerts, id, status) } : current
      ),
    []
  );
  return {
    snapshot,
    loading,
    refreshing,
    error,
    requestId,
    cached,
    simulation,
    preferences,
    refresh,
    setPreferences,
    simulateCrisis,
    exitSimulation: () => void refresh(true),
    changeAlertStatus,
  };
}
