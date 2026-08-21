import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useContractTesting from './useContractTesting';
import * as client from '../lib/contractTesting/client';
import { findSampleContract } from '../lib/contractTesting/fixtures';
import type { AnalysisResponse } from '../types/contractTesting';

function deferred<T>() {
  let resolve!: (_value: T) => void;
  let reject!: (_reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('useContractTesting request lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('ignores a superseded request and keeps loading until the newest request settles', async () => {
    const first = deferred<AnalysisResponse>();
    const second = deferred<AnalysisResponse>();
    vi.spyOn(client, 'analyzeContract').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useContractTesting());
    act(() => result.current.setSource(findSampleContract('counter')!.source));

    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;
    act(() => {
      firstRun = result.current.runAnalysis();
    });
    act(() => {
      secondRun = result.current.runAnalysis();
    });
    expect(result.current.loading).toBe(true);

    const staleResult = client.analyzeContractLocally(findSampleContract('counter')!.source, 'Stale', 'request-1');
    await act(async () => {
      first.resolve({ data: staleResult, requestId: 'request-1' });
      await firstRun;
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.result).toBeNull();

    const currentResult = client.analyzeContractLocally(findSampleContract('counter')!.source, 'Current', 'request-2');
    await act(async () => {
      second.resolve({ data: currentResult, requestId: 'request-2' });
      await secondRun;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.result?.requestId).toBe('request-2');
    expect(result.current.history).toHaveLength(1);
  });
});
