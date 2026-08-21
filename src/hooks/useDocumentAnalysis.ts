import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnswerResponse,
  DocAnalysisPreferences,
  DocAnalysisSnapshot,
  FactValidationStatus,
  RawDocumentInput,
  SearchResponse,
} from '../types/documentAnalysis';
import {
  analyzeAndPersist,
  analyzeDemoCorpus,
  askQuestionFromSnapshot,
  clearPersistedAnalysis,
  DocAnalysisError,
  loadPersistedAnalysis,
  loadValidations,
  saveValidations,
  searchSnapshot,
} from '../lib/docAnalysis/client';

const KEY = 'stellar:doc-analysis:preferences';
const defaults: DocAnalysisPreferences = {
  minimumConfidence: 0.3,
  includeFixtures: true,
  maxSearchResults: 10,
};

function loadPreferences(): DocAnalysisPreferences {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export default function useDocumentAnalysis() {
  const [snapshot, setSnapshot] = useState<DocAnalysisSnapshot | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<DocAnalysisError | null>(null);
  const [usingFixtures, setUsingFixtures] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<AnswerResponse | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchResponse | null>(null);
  const [validations, setValidations] = useState<FactValidationStatus[]>([]);
  const [preferences, setPreferencesState] = useState<DocAnalysisPreferences>(loadPreferences);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const persisted = await loadPersistedAnalysis();
        if (cancelled) return;
        if (persisted) {
          setSnapshot(persisted.snapshot);
          setUsingFixtures(persisted.usingFixtures);
        } else if (loadPreferences().includeFixtures) {
          const { snapshot: demoSnapshot, persisted: wasPersisted } = await analyzeDemoCorpus();
          if (cancelled) return;
          setSnapshot(demoSnapshot);
          setUsingFixtures(true);
          setStorageWarning(!wasPersisted);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof DocAnalysisError
              ? cause
              : new DocAnalysisError({
                  code: 'processing-failed',
                  message: 'Unable to prepare document analysis.',
                  retryable: true,
                })
          );
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    void loadValidations().then((stored) => {
      if (!cancelled) setValidations(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ingest = useCallback(async (inputs: RawDocumentInput[]) => {
    controller.current?.abort();
    controller.current = new AbortController();
    setProcessing(true);
    setError(null);
    try {
      const persisted = await loadPersistedAnalysis();
      const combined = [...(persisted?.rawInputs ?? []), ...inputs];
      const { snapshot: next, persisted: ok } = await analyzeAndPersist(combined, {
        signal: controller.current.signal,
      });
      setSnapshot(next);
      setUsingFixtures(false);
      setStorageWarning(!ok);
    } catch (cause) {
      setError(
        cause instanceof DocAnalysisError
          ? cause
          : new DocAnalysisError({
              code: 'processing-failed',
              message: 'Document ingestion failed.',
              retryable: true,
            })
      );
    } finally {
      setProcessing(false);
    }
  }, []);

  const loadDemoCorpus = useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const { snapshot: demoSnapshot, persisted } = await analyzeDemoCorpus();
      setSnapshot(demoSnapshot);
      setUsingFixtures(true);
      setStorageWarning(!persisted);
    } catch (cause) {
      setError(
        cause instanceof DocAnalysisError
          ? cause
          : new DocAnalysisError({
              code: 'processing-failed',
              message: 'Demo corpus failed to load.',
              retryable: true,
            })
      );
    } finally {
      setProcessing(false);
    }
  }, []);

  const reset = useCallback(async () => {
    await clearPersistedAnalysis();
    setSnapshot(null);
    setLastAnswer(null);
    setLastSearch(null);
    setUsingFixtures(false);
    setError(null);
  }, []);

  const ask = useCallback(
    (question: string): AnswerResponse | null => {
      if (!snapshot || !question.trim()) return null;
      const answer = askQuestionFromSnapshot(snapshot, question);
      setLastAnswer(answer);
      return answer;
    },
    [snapshot]
  );

  const runSearch = useCallback(
    (query: string): SearchResponse | null => {
      if (!snapshot || !query.trim()) return null;
      const response = searchSnapshot(snapshot, query);
      setLastSearch(response);
      return response;
    },
    [snapshot]
  );

  const validateFact = useCallback((key: string, status: FactValidationStatus['status']) => {
    setValidations((current) => {
      const next = [
        ...current.filter((item) => item.key !== key),
        { key, status, updatedAt: new Date().toISOString() },
      ];
      void saveValidations(next);
      return next;
    });
  }, []);

  const setPreferences = useCallback((patch: Partial<DocAnalysisPreferences>) => {
    setPreferencesState((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage may be disabled */
      }
      return next;
    });
  }, []);

  return {
    snapshot,
    hydrating,
    processing,
    error,
    usingFixtures,
    storageWarning,
    lastAnswer,
    lastSearch,
    validations,
    preferences,
    ingest,
    loadDemoCorpus,
    reset,
    ask,
    runSearch,
    validateFact,
    setPreferences,
  };
}
