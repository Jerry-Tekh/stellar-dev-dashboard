import { describe, expect, it } from 'vitest';
import { parseContract } from './parser';
import { deriveInvariants, runStaticAnalysis } from './staticAnalyzer';
import { generateTestSuite } from './testGenerator';
import { findSampleContract } from './fixtures';

function pipelineFor(sampleId: string) {
  const contract = parseContract(findSampleContract(sampleId)!.source);
  const findings = runStaticAnalysis(contract);
  const invariants = deriveInvariants(contract);
  return { contract, findings, invariants, suite: generateTestSuite(contract, findings, invariants) };
}

describe('generateTestSuite', () => {
  it('generates at least a happy-path unit test per function', () => {
    const { contract, suite } = pipelineFor('token');
    for (const fn of contract.functions) {
      expect(suite.testCases.some((tc) => tc.functionName === fn.name && tc.name === `${fn.name}_happy_path`)).toBe(true);
    }
  });

  it('generates a boundary test for functions with numeric params', () => {
    const { suite } = pipelineFor('token');
    expect(suite.testCases.some((tc) => tc.name === 'transfer_boundary_amount')).toBe(true);
  });

  it('marks boundary tests on unchecked-arithmetic functions as should_panic', () => {
    const { suite } = pipelineFor('token');
    const boundary = suite.testCases.find((tc) => tc.name === 'mint_boundary_amount');
    expect(boundary?.code).toContain('#[should_panic]');
  });

  it('generates a property test per derived invariant', () => {
    const { invariants, suite } = pipelineFor('token');
    const propertyTests = suite.testCases.filter((tc) => tc.kind === 'property');
    expect(propertyTests).toHaveLength(invariants.length);
  });

  it('generates a regression test for high/critical findings only', () => {
    const { findings, suite } = pipelineFor('escrow');
    const regressionTests = suite.testCases.filter((tc) => tc.kind === 'regression');
    const highOrCritical = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
    expect(regressionTests.length).toBe(highOrCritical.filter((f) => f.functionName).length);
  });

  it('tallies byKind counts consistently with testCases', () => {
    const { suite } = pipelineFor('token');
    const total = Object.values(suite.byKind).reduce((a, b) => a + b, 0);
    expect(total).toBe(suite.totalTestCases);
    expect(suite.totalTestCases).toBe(suite.testCases.length);
  });

  it('emits valid-looking Rust test attributes', () => {
    const { suite } = pipelineFor('counter');
    const unitTest = suite.testCases.find((tc) => tc.kind === 'unit' && tc.name.endsWith('_happy_path'));
    expect(unitTest?.code).toContain('#[test]');
    expect(unitTest?.code).toContain('Env::default()');
  });

  it('produces unique test ids and names per function', () => {
    const { suite } = pipelineFor('token');
    expect(new Set(suite.testCases.map((tc) => tc.id)).size).toBe(suite.testCases.length);
  });

  it('generates a fuzz seed case per function', () => {
    const { contract, suite } = pipelineFor('counter');
    const fuzzTests = suite.testCases.filter((tc) => tc.kind === 'fuzz');
    expect(fuzzTests).toHaveLength(contract.functions.length);
  });
});
