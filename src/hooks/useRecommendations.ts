import { useCallback, useEffect, useMemo, useState } from 'react';
import { recommendationService } from '../lib/recommendations/service';
import type { FeedbackValue, RecommendationPreferences } from '../types/recommendations';

interface UseRecommendationsInput {
  network: string;
  interests?: string[];
  heldAssets?: string[];
  usedItems?: string[];
}

export function useRecommendations(input: UseRecommendationsInput) {
  const [snapshot, setSnapshot] = useState(() => recommendationService.getSnapshot());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const interestsKey = (input.interests ?? []).join('\0');
  const heldAssetsKey = (input.heldAssets ?? []).join('\0');
  const usedItemsKey = (input.usedItems ?? []).join('\0');
  const runtime = useMemo(
    () => ({
      interests: interestsKey ? interestsKey.split('\0') : [],
      heldAssets: heldAssetsKey ? heldAssetsKey.split('\0') : [],
      usedItems: usedItemsKey ? usedItemsKey.split('\0') : [],
      context: { network: input.network, online: navigator.onLine },
    }),
    [input.network, interestsKey, heldAssetsKey, usedItemsKey]
  );

  useEffect(
    () =>
      recommendationService.subscribe(() => {
        setSnapshot(recommendationService.getSnapshot());
      }),
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    recommendationService.updateRuntime(runtime);
    recommendationService
      .refresh(controller.signal)
      .then(() => setError(null))
      .catch(() => {
        if (!controller.signal.aborted) setError('Unable to refresh recommendations.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [runtime]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await recommendationService.refresh();
    } catch {
      setError('Unable to refresh recommendations.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  return {
    snapshot,
    loading,
    refreshing,
    error,
    refresh,
    setPreferences: (patch: Partial<RecommendationPreferences>) =>
      recommendationService.setPreferences(patch),
    recordFeedback: (itemId: string, value: FeedbackValue, rank?: number) =>
      recommendationService.recordFeedback(itemId, value, rank),
    recordImpression: recommendationService.recordImpression.bind(recommendationService),
    clearPersonalization: () => recommendationService.clearPersonalization(),
  };
}
