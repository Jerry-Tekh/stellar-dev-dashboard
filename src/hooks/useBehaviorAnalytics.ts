import { useCallback, useEffect, useState } from 'react';
import { behaviorAnalytics } from '../lib/behaviorAnalytics';
import type { AnalyticsSnapshot, TrackEventInput } from '../types/behaviorAnalytics';

export function useBehaviorAnalytics() {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot>(() =>
    behaviorAnalytics.getSnapshot()
  );

  useEffect(
    () => behaviorAnalytics.subscribe(() => setSnapshot(behaviorAnalytics.getSnapshot())),
    []
  );

  const track = useCallback((input: TrackEventInput) => behaviorAnalytics.track(input), []);
  const updateConsent = useCallback(
    (usage: boolean, personalization: boolean) =>
      behaviorAnalytics.setConsent(usage, personalization),
    []
  );
  const eraseData = useCallback(() => behaviorAnalytics.eraseData(), []);
  const exportData = useCallback(() => behaviorAnalytics.exportData(), []);
  const syncRemote = useCallback(() => behaviorAnalytics.syncRemote(), []);
  const getExperimentAssignment = useCallback(
    (experiment: Parameters<typeof behaviorAnalytics.getExperimentAssignment>[0]) =>
      behaviorAnalytics.getExperimentAssignment(experiment),
    []
  );
  const recordExperimentExposure = useCallback(
    (experimentId: string, variantId: string) =>
      behaviorAnalytics.recordExperimentExposure(experimentId, variantId),
    []
  );
  const recordExperimentConversion = useCallback(
    (experimentId: string, variantId: string) =>
      behaviorAnalytics.recordExperimentConversion(experimentId, variantId),
    []
  );

  return {
    snapshot,
    track,
    updateConsent,
    eraseData,
    exportData,
    syncRemote,
    getExperimentAssignment,
    recordExperimentExposure,
    recordExperimentConversion,
  };
}

export default useBehaviorAnalytics;
