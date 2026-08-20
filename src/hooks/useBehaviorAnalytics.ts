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

  return { snapshot, track, updateConsent, eraseData, exportData };
}

export default useBehaviorAnalytics;
