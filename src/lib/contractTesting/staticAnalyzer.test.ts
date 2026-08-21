import { describe, expect, it } from 'vitest';
import { parseContract } from './parser';
import { deriveInvariants, runStaticAnalysis } from './staticAnalyzer';
import { findSampleContract } from './fixtures';

describe('runStaticAnalysis', () => {
  it('flags the escrow release() for missing auth and reentrancy shape', () => {
    const contract = parseContract(findSampleContract('escrow')!.source);
    const findings = runStaticAnalysis(contract);
    const release = findings.filter((f) => f.functionName === 'release');

    expect(release.some((f) => f.category === 'access-control' && f.severity === 'critical')).toBe(true);
    expect(release.some((f) => f.category === 'reentrancy')).toBe(true);
  });

  it('does not flag a properly auth-guarded, checked function', () => {
    const contract = parseContract(findSampleContract('token')!.source);
    const findings = runStaticAnalysis(contract);
    const balanceFindings = findings.filter((f) => f.functionName === 'balance');
    expect(balanceFindings).toEqual([]);
  });

  it('flags panic! / unwrap in transfer', () => {
    const contract = parseContract(findSampleContract('token')!.source);
    const findings = runStaticAnalysis(contract);
    expect(findings.some((f) => f.functionName === 'transfer' && f.category === 'panic-safety')).toBe(true);
  });

  it('produces unique finding ids', () => {
    const contract = parseContract(findSampleContract('escrow')!.source);
    const findings = runStaticAnalysis(contract);
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
  });

  it('returns no findings for a contract with no functions', () => {
    const contract = parseContract('#![no_std]\n');
    expect(runStaticAnalysis(contract)).toEqual([]);
  });
});

describe('deriveInvariants', () => {
  it('derives an auth-only-caller invariant for guarded state-mutating functions', () => {
    const contract = parseContract(findSampleContract('token')!.source);
    const invariants = deriveInvariants(contract);
    expect(invariants.some((inv) => inv.functionName === 'mint' && inv.expression.includes('require_auth'))).toBe(true);
  });

  it('does not derive an auth invariant for the unguarded escrow release', () => {
    const contract = parseContract(findSampleContract('escrow')!.source);
    const invariants = deriveInvariants(contract);
    expect(invariants.some((inv) => inv.functionName === 'release' && inv.expression.includes('require_auth'))).toBe(false);
  });
});
