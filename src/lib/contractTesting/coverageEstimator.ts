import type { CoverageReport, GeneratedTestSuite, ParsedContract } from '../../types/contractTesting';

/**
 * Estimates coverage from the generated test suite against the parsed
 * contract's function/branch counts. This is a static estimate derived from
 * how many test cases target each function — it is not a substitute for
 * running an instrumented coverage tool (e.g. `cargo llvm-cov`) against the
 * real compiled contract, which the generated CI workflow does separately.
 */
export function estimateCoverage(contract: ParsedContract, suite: GeneratedTestSuite): CoverageReport {
  const totalFunctions = contract.functions.length;
  const testCasesByFunction = new Map<string, number>();
  for (const testCase of suite.testCases) {
    testCasesByFunction.set(testCase.functionName, (testCasesByFunction.get(testCase.functionName) ?? 0) + 1);
  }

  const coveredFunctions = contract.functions.filter((fn) => (testCasesByFunction.get(fn.name) ?? 0) > 0).length;
  const uncoveredFunctions = contract.functions
    .filter((fn) => (testCasesByFunction.get(fn.name) ?? 0) === 0)
    .map((fn) => fn.name);

  const totalBranches = contract.functions.reduce((sum, fn) => sum + Math.max(1, fn.branchCount), 0);
  // Each test case is assumed to exercise its function's happy-path branch,
  // plus one additional branch when it specifically targets a boundary.
  const coveredBranches = contract.functions.reduce((sum, fn) => {
    const casesForFn = testCasesByFunction.get(fn.name) ?? 0;
    if (casesForFn === 0) return sum;
    const branches = Math.max(1, fn.branchCount);
    return sum + Math.min(branches, casesForFn);
  }, 0);

  const estimatedFunctionCoveragePct = totalFunctions === 0 ? 0 : round((coveredFunctions / totalFunctions) * 100);
  const estimatedBranchCoveragePct = totalBranches === 0 ? 0 : round((coveredBranches / totalBranches) * 100);
  // Path coverage is modeled as the harder of the two dimensions weighted
  // toward branch coverage, since paths compound across branches.
  const estimatedPathCoveragePct = round(
    estimatedFunctionCoveragePct * 0.35 + estimatedBranchCoveragePct * 0.65
  );

  return {
    totalFunctions,
    coveredFunctions,
    totalBranches,
    coveredBranches,
    estimatedFunctionCoveragePct,
    estimatedBranchCoveragePct,
    estimatedPathCoveragePct,
    uncoveredFunctions,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
