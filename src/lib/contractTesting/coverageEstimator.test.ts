import { describe, expect, it } from 'vitest';
import { parseContract } from './parser';
import { deriveInvariants, runStaticAnalysis } from './staticAnalyzer';
import { generateTestSuite } from './testGenerator';
import { estimateCoverage } from './coverageEstimator';
import { findSampleContract } from './fixtures';

function coverageFor(sampleId: string) {
  const contract = parseContract(findSampleContract(sampleId)!.source);
  const findings = runStaticAnalysis(contract);
  const invariants = deriveInvariants(contract);
  const suite = generateTestSuite(contract, findings, invariants);
  return { contract, coverage: estimateCoverage(contract, suite) };
}

describe('estimateCoverage', () => {
  it('covers every function since the generator always emits a happy-path test', () => {
    const { contract, coverage } = coverageFor('token');
    expect(coverage.totalFunctions).toBe(contract.functions.length);
    expect(coverage.coveredFunctions).toBe(contract.functions.length);
    expect(coverage.uncoveredFunctions).toEqual([]);
    expect(coverage.estimatedFunctionCoveragePct).toBe(100);
  });

  it('keeps percentages within [0, 100]', () => {
    const { coverage } = coverageFor('escrow');
    for (const pct of [
      coverage.estimatedFunctionCoveragePct,
      coverage.estimatedBranchCoveragePct,
      coverage.estimatedPathCoveragePct,
    ]) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it('returns zeroed report for a contract with no functions', () => {
    const contract = parseContract('#![no_std]\n');
    const coverage = estimateCoverage(contract, {
      contractName: 'Empty',
      generatedAt: new Date().toISOString(),
      totalTestCases: 0,
      byKind: { unit: 0, property: 0, fuzz: 0, regression: 0 },
      testCases: [],
    });
    expect(coverage.totalFunctions).toBe(0);
    expect(coverage.estimatedFunctionCoveragePct).toBe(0);
    expect(coverage.estimatedPathCoveragePct).toBe(0);
  });
});
