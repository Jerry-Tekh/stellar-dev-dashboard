import type {
  AnalysisResponse,
  AnalysisResult,
  AnalyzeOptions,
  ContractTestingApiError,
} from '../../types/contractTesting';
import { parseContract } from './parser';
import { deriveInvariants, runStaticAnalysis } from './staticAnalyzer';
import { generateTestSuite } from './testGenerator';
import { estimateCoverage } from './coverageEstimator';
import { estimateMutationScore } from './mutationEstimator';
import { runVerification } from './verificationEngine';
import { generateCiWorkflowYaml } from './ciWorkflowGenerator';

export const MAX_SOURCE_LENGTH = 200_000;
const RUST_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

export class ContractTestingError extends Error implements ContractTestingApiError {
  code: ContractTestingApiError['code'];
  retryable: boolean;
  requestId?: string;
  constructor(error: ContractTestingApiError) {
    super(error.message);
    this.name = 'ContractTestingError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.requestId = error.requestId;
  }
}

function requestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `contract-testing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Runs the full local analysis pipeline against Soroban Rust source. */
export function analyzeContractLocally(
  source: string,
  contractNameOverride: string | undefined,
  id: string,
  state: AnalysisResult['state'] = 'live'
): AnalysisResult {
  const startedAt = Date.now();
  const contract = parseContract(source);
  if (contractNameOverride) {
    validateContractName(contractNameOverride, id);
    contract.contractName = contractNameOverride;
  }

  const findings = runStaticAnalysis(contract);
  const invariants = deriveInvariants(contract);
  const testSuite = generateTestSuite(contract, findings, invariants);
  const coverage = estimateCoverage(contract, testSuite);
  const mutation = estimateMutationScore(contract, testSuite);
  const verification = runVerification(contract, findings, invariants);
  const ciWorkflowYaml = generateCiWorkflowYaml(contract.contractName);

  return {
    requestId: id,
    generatedAt: new Date().toISOString(),
    state,
    contract,
    findings,
    invariants,
    testSuite,
    coverage,
    mutation,
    verification,
    ciWorkflowYaml,
    durationMs: Date.now() - startedAt,
  };
}

function validateContractName(contractName: string | undefined, id: string): void {
  if (contractName && !RUST_IDENTIFIER.test(contractName)) {
    throw new ContractTestingError({
      code: 'invalid-contract-name',
      message: 'Contract name must be a valid Rust identifier (letters, numbers, and underscores only).',
      retryable: false,
      requestId: id,
    });
  }
}

function validateSource(source: string, id: string): void {
  if (!source || source.trim().length === 0) {
    throw new ContractTestingError({
      code: 'empty-source',
      message: 'Paste or upload a Soroban contract source file first.',
      retryable: false,
      requestId: id,
    });
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new ContractTestingError({
      code: 'source-too-large',
      message: `Contract source exceeds the ${MAX_SOURCE_LENGTH.toLocaleString()} character analysis limit.`,
      retryable: false,
      requestId: id,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value) || !isRecord(value.contract) || !isRecord(value.testSuite)) return false;
  if (!isRecord(value.coverage) || !isRecord(value.mutation) || !isRecord(value.verification)) return false;
  return (
    typeof value.requestId === 'string' &&
    typeof value.generatedAt === 'string' &&
    ['live', 'degraded', 'offline', 'simulation'].includes(String(value.state)) &&
    Array.isArray(value.contract.functions) &&
    Array.isArray(value.contract.types) &&
    Array.isArray(value.findings) &&
    Array.isArray(value.invariants) &&
    Array.isArray(value.testSuite.testCases) &&
    isRecord(value.testSuite.byKind) &&
    Array.isArray(value.coverage.uncoveredFunctions) &&
    Array.isArray(value.mutation.mutants) &&
    Array.isArray(value.verification.obligations) &&
    typeof value.ciWorkflowYaml === 'string'
  );
}

function degradedLocalResult(source: string, contractName: string | undefined, id: string): AnalysisResponse {
  return { data: analyzeContractLocally(source, contractName, id, 'degraded'), requestId: id };
}

/**
 * Analyzes Soroban contract source. When `VITE_CONTRACT_TESTING_API_URL` is
 * configured, delegates to the microservice; otherwise (and on service
 * failure, when `allowStale`-style local fallback is desired) runs the same
 * pipeline directly in the browser so the feature works fully offline.
 */
export async function analyzeContract(source: string, options: AnalyzeOptions = {}): Promise<AnalysisResponse> {
  const id = requestId();
  validateSource(source, id);
  validateContractName(options.contractName, id);

  if (source.trim().length > 0) {
    const functionCount = (source.match(/pub\s+fn\s+[a-zA-Z_]/g) ?? []).length;
    if (functionCount === 0) {
      throw new ContractTestingError({
        code: 'no-functions-found',
        message: 'No `pub fn` entry points were found inside a `#[contractimpl]` block.',
        retryable: false,
        requestId: id,
      });
    }
  }

  const endpoint = import.meta.env.VITE_CONTRACT_TESTING_API_URL as string | undefined;
  if (!endpoint) {
    return { data: analyzeContractLocally(source, options.contractName, id, 'simulation'), requestId: id };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/contract-testing/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json', 'X-Request-ID': id },
      body: JSON.stringify({ source, contractName: options.contractName }),
      signal: controller.signal,
    });
    if (response.status === 429) {
      return degradedLocalResult(source, options.contractName, id);
    }
    if (!response.ok) {
      throw new ContractTestingError({
        code: 'unavailable',
        message: `Contract testing service returned HTTP ${response.status}.`,
        retryable: response.status >= 500,
        requestId: id,
      });
    }
    const payload: unknown = await response.json();
    if (!isAnalysisResult(payload)) {
      return degradedLocalResult(source, options.contractName, id);
    }
    return { data: payload, requestId: id };
  } catch (error) {
    if (options.signal?.aborted) {
      throw new ContractTestingError({ code: 'aborted', message: 'Analysis was cancelled.', retryable: false, requestId: id });
    }
    if (error instanceof ContractTestingError) {
      if (error.code === 'unavailable' || error.code === 'invalid-response' || error.code === 'rate-limited') {
        return degradedLocalResult(source, options.contractName, id);
      }
      throw error;
    }
    if (controller.signal.aborted) {
      return degradedLocalResult(source, options.contractName, id);
    }
    return degradedLocalResult(source, options.contractName, id);
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
