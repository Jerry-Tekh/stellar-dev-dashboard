import { useState, useEffect, useCallback } from 'react';
import {
  localQAEngine,
  type QAStats,
  type TestRun,
  type FlakyTest,
  type SelfHealingLog,
  type GeneratedTestSuite
} from '../lib/qa';

const DEFAULT_API_URL = 'http://localhost:3100';
const API_URL = import.meta.env.VITE_QA_SERVICE_URL || DEFAULT_API_URL;

export function useQASystem() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);
  const [selfHealingLogs, setSelfHealingLogs] = useState<SelfHealingLog[]>([]);

  // Check if API service is alive
  const checkConnection = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(1000) });
      return res.ok;
    } catch {
      return false;
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const connected = await checkConnection();

    if (connected) {
      setIsOfflineMode(false);
      try {
        const [snapshotRes, runsRes, flakyRes, shRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/qa/snapshot`),
          fetch(`${API_URL}/api/v1/qa/runs`),
          fetch(`${API_URL}/api/v1/qa/flaky`),
          fetch(`${API_URL}/api/v1/qa/self-healing`)
        ]);

        if (!snapshotRes.ok || !runsRes.ok || !flakyRes.ok || !shRes.ok) {
          throw new Error('Failed to fetch data from QA service');
        }

        const snapshotData = await snapshotRes.json();
        const runsData = await runsRes.json();
        const flakyData = await flakyRes.json();
        const shData = await shRes.json();

        setStats(snapshotData);
        setRuns(runsData);
        setFlakyTests(flakyData);
        setSelfHealingLogs(shData);
      } catch (err) {
        // Fallback to local on error
        setIsOfflineMode(true);
        const snapshot = localQAEngine.getSnapshot();
        setStats(snapshot);
        setRuns(localQAEngine.getTestRuns());
        setFlakyTests(localQAEngine.getFlakyTests());
        setSelfHealingLogs(localQAEngine.getSelfHealingLogs());
      }
    } else {
      setIsOfflineMode(true);
      const snapshot = localQAEngine.getSnapshot();
      setStats(snapshot);
      setRuns(localQAEngine.getTestRuns());
      setFlakyTests(localQAEngine.getFlakyTests());
      setSelfHealingLogs(localQAEngine.getSelfHealingLogs());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // Poll for status updates (e.g. running test runs) every 3 seconds
    const interval = setInterval(() => {
      loadData();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const triggerRun = async (triggerType: 'manual' | 'git-push' | 'cron' = 'manual') => {
    if (isOfflineMode) {
      const newRun = localQAEngine.triggerTestRun(triggerType);
      setRuns([newRun, ...runs]);
      return newRun;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/qa/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: triggerType })
      });
      if (!res.ok) throw new Error('Failed to trigger test run');
      const newRun = await res.json();
      setRuns(prev => [newRun, ...prev]);
      return newRun;
    } catch (err) {
      // Fallback
      const newRun = localQAEngine.triggerTestRun(triggerType);
      setRuns(prev => [newRun, ...prev]);
      return newRun;
    }
  };

  const updateFlakyStatus = async (id: string, newStatus: 'active' | 'quarantined') => {
    if (isOfflineMode) {
      const updated = localQAEngine.updateFlakyTestStatus(id, newStatus);
      if (updated) {
        setFlakyTests(prev => prev.map(t => (t.id === id ? updated : t)));
      }
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/qa/flaky/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Failed to update flaky test status');
      const updated = await res.json();
      setFlakyTests(prev => prev.map(t => (t.id === id ? updated : t)));
    } catch (err) {
      // Fallback
      const updated = localQAEngine.updateFlakyTestStatus(id, newStatus);
      if (updated) {
        setFlakyTests(prev => prev.map(t => (t.id === id ? updated : t)));
      }
    }
  };

  const generateTests = async (filePath: string): Promise<GeneratedTestSuite | null> => {
    if (isOfflineMode) {
      return localQAEngine.generateTestCases(filePath);
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/qa/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      if (!res.ok) throw new Error('Failed to generate tests');
      return await res.ok ? res.json() : null;
    } catch (err) {
      return localQAEngine.generateTestCases(filePath);
    }
  };

  const fetchLogs = async (runId: string): Promise<string> => {
    if (isOfflineMode) {
      return localQAEngine.getRunLogs(runId);
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/qa/runs/${runId}/logs`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      return await res.text();
    } catch (err) {
      return localQAEngine.getRunLogs(runId);
    }
  };

  return {
    loading,
    error,
    isOfflineMode,
    stats,
    runs,
    flakyTests,
    selfHealingLogs,
    triggerRun,
    updateFlakyStatus,
    generateTests,
    fetchLogs,
    refresh: loadData
  };
}
export type UseQASystem = ReturnType<typeof useQASystem>;
