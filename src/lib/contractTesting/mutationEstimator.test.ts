import { describe, expect, it } from 'vitest';
import { parseContract } from './parser';
import { deriveInvariants, runStaticAnalysis } from './staticAnalyzer';
import { generateTestSuite } from './testGenerator';
import { estimateMutationScore } from './mutationEstimator';
import { findSampleContract } from './fixtures';

function mutationFor(sampleId: string) {
  const contract = parseContract(findSampleContract(sampleId)!.source);
  const findings = runStaticAnalysis(contract);
  const invariants = deriveInvariants(contract);
  const suite = generateTestSuite(contract, findings, invariants);
  return estimateMutationScore(contract, suite);
}

describe('estimateMutationScore', () => {
  it('produces a score between 0 and 100', () => {
    const report = mutationFor('token');
    expect(report.estimatedMutationScorePct).toBeGreaterThanOrEqual(0);
    expect(report.estimatedMutationScorePct).toBeLessThanOrEqual(100);
  });

  it('splits total mutants into killed + survived', () => {
    const report = mutationFor('token');
    expect(report.likelyKilled + report.likelySurvived).toBe(report.totalMutants);
  });

  it('generates an auth-check-negation mutant only for auth-guarded functions', () => {
    const report = mutationFor('token');
    const authMutants = report.mutants.filter((m) => m.operator === 'auth-check-negation');
    expect(authMutants.every((m) => ['mint', 'transfer'].includes(m.functionName))).toBe(true);
  });

  it('returns an empty report for a contract with no functions', () => {
    const contract = parseContract('#![no_std]\n');
    const report = estimateMutationScore(contract, {
      contractName: 'Empty',
      generatedAt: new Date().toISOString(),
      totalTestCases: 0,
      byKind: { unit: 0, property: 0, fuzz: 0, regression: 0 },
      testCases: [],
    });
    expect(report.totalMutants).toBe(0);
    expect(report.estimatedMutationScorePct).toBe(0);
  });
});
