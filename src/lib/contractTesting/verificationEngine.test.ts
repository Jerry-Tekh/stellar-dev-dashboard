import { describe, expect, it } from 'vitest';
import { parseContract } from './parser';
import { deriveInvariants, runStaticAnalysis } from './staticAnalyzer';
import { runVerification } from './verificationEngine';
import { findSampleContract } from './fixtures';

describe('runVerification', () => {
  it('labels the methodology as heuristic and includes a disclaimer', () => {
    const contract = parseContract(findSampleContract('token')!.source);
    const findings = runStaticAnalysis(contract);
    const invariants = deriveInvariants(contract);
    const report = runVerification(contract, findings, invariants);
    expect(report.methodology).toBe('heuristic-static-analysis');
    expect(report.disclaimer.length).toBeGreaterThan(20);
  });

  it('passes the auth-only-caller obligation when require_auth is observed', () => {
    const contract = parseContract(findSampleContract('token')!.source);
    const findings = runStaticAnalysis(contract);
    const invariants = deriveInvariants(contract);
    const report = runVerification(contract, findings, invariants);
    const mintAuthObligation = report.obligations.find(
      (o) => o.functionName === 'mint' && o.category === 'access-control'
    );
    expect(mintAuthObligation?.status).toBe('pass');
  });

  it('fails the arithmetic obligation when unchecked arithmetic was flagged', () => {
    const contract = parseContract(findSampleContract('token')!.source);
    const findings = runStaticAnalysis(contract);
    const invariants = deriveInvariants(contract);
    const report = runVerification(contract, findings, invariants);
    const mintArithmetic = report.obligations.find((o) => o.functionName === 'mint' && o.category === 'arithmetic');
    expect(mintArithmetic?.status).toBe('fail');
  });

  it('counts pass/fail/needs-review consistently with obligations', () => {
    const contract = parseContract(findSampleContract('escrow')!.source);
    const findings = runStaticAnalysis(contract);
    const invariants = deriveInvariants(contract);
    const report = runVerification(contract, findings, invariants);
    expect(report.passCount + report.failCount + report.needsReviewCount).toBe(report.obligations.length);
  });

  it('returns no obligations when there are no invariants', () => {
    const contract = parseContract('#![no_std]\n');
    const report = runVerification(contract, [], []);
    expect(report.obligations).toEqual([]);
    expect(report.passCount).toBe(0);
  });
});
