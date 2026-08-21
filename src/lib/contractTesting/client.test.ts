import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeContract, analyzeContractLocally, ContractTestingError, MAX_SOURCE_LENGTH } from './client';
import { findSampleContract } from './fixtures';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('analyzeContractLocally', () => {
  it('runs the full pipeline and returns a populated AnalysisResult', () => {
    const result = analyzeContractLocally(findSampleContract('token')!.source, undefined, 'req-1');
    expect(result.contract.contractName).toBe('TokenContract');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.testSuite.totalTestCases).toBeGreaterThan(0);
    expect(result.coverage.totalFunctions).toBe(result.contract.functions.length);
    expect(result.ciWorkflowYaml).toContain('soroban contract build');
    expect(result.requestId).toBe('req-1');
  });

  it('respects a contract name override', () => {
    const result = analyzeContractLocally(findSampleContract('counter')!.source, 'MyCounter', 'req-2');
    expect(result.contract.contractName).toBe('MyCounter');
  });
});

describe('analyzeContract (local mode, no VITE_CONTRACT_TESTING_API_URL)', () => {
  it('analyzes valid source locally without a network call', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await analyzeContract(findSampleContract('token')!.source);
    expect(response.data.contract.contractName).toBe('TokenContract');
    expect(response.data.state).toBe('simulation');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('rejects empty source', async () => {
    await expect(analyzeContract('')).rejects.toMatchObject({ code: 'empty-source', retryable: false });
  });

  it('rejects source over the length limit', async () => {
    await expect(analyzeContract('a'.repeat(MAX_SOURCE_LENGTH + 1))).rejects.toMatchObject({
      code: 'source-too-large',
      retryable: false,
    });
  });

  it('rejects source with no pub fn entry points', async () => {
    await expect(analyzeContract('#![no_std]\nfn helper() {}\n')).rejects.toMatchObject({
      code: 'no-functions-found',
      retryable: false,
    });
  });

  it('rejects a contract name that could inject generated Rust or workflow content', async () => {
    await expect(
      analyzeContract(findSampleContract('counter')!.source, { contractName: 'Counter\njobs: injected' })
    ).rejects.toMatchObject({ code: 'invalid-contract-name', retryable: false });
  });
});

describe('analyzeContract (remote mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CONTRACT_TESTING_API_URL', 'https://contract-testing.example.com');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('posts to the configured endpoint and returns its payload', async () => {
    const localResult = analyzeContractLocally(findSampleContract('counter')!.source, undefined, 'server-req');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson(localResult));

    const response = await analyzeContract(findSampleContract('counter')!.source);
    expect(response.data.contract.contractName).toBe('CounterContract');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://contract-testing.example.com/v1/contract-testing/analyze',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('falls back to a degraded local analysis on HTTP 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
    const response = await analyzeContract(findSampleContract('counter')!.source);
    expect(response.data).toMatchObject({ state: 'degraded', contract: { contractName: 'CounterContract' } });
  });

  it('falls back to a degraded local analysis on HTTP 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    const response = await analyzeContract(findSampleContract('counter')!.source);
    expect(response.data.state).toBe('degraded');
  });

  it('falls back when the service returns a partial or malformed payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({ nonsense: true }));
    const response = await analyzeContract(findSampleContract('counter')!.source);
    expect(response.data.state).toBe('degraded');
    expect(response.data.testSuite.byKind.unit).toBeGreaterThan(0);
  });

  it('falls back when the network request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const response = await analyzeContract(findSampleContract('counter')!.source);
    expect(response.data.state).toBe('degraded');
  });
});

describe('ContractTestingError', () => {
  it('exposes structured fields and no sensitive payload leakage', () => {
    const error = new ContractTestingError({
      code: 'timeout',
      message: 'Analysis timed out.',
      retryable: true,
      requestId: 'safe-request-id',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toEqual(
      expect.objectContaining({ name: 'ContractTestingError', code: 'timeout', retryable: true, requestId: 'safe-request-id' })
    );
  });
});
