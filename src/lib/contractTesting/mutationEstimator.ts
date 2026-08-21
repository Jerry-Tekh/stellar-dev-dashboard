import type {
  ContractFunction,
  GeneratedTestSuite,
  MutantResult,
  MutationOperator,
  MutationReport,
  ParsedContract,
} from '../../types/contractTesting';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

/**
 * Estimates a mutation-testing score without actually compiling/running
 * mutants (that requires a Rust toolchain + `cargo-mutants`, wired up in the
 * generated CI workflow instead). The heuristic: a mutant is "likely killed"
 * only when the generated suite has a test with a *concrete* assertion for
 * that function — a boundary test (`#[should_panic]` on overflow), a
 * property test (asserts an invariant), or a regression test. The plain
 * happy-path test carries only a TODO assertion placeholder, so on its own
 * it does not count as killing a mutant — this deliberately keeps the score
 * honest rather than inflating it from test *count* alone.
 */
function hasConcreteAssertion(fn: ContractFunction, suite: GeneratedTestSuite): boolean {
  return suite.testCases.some(
    (testCase) =>
      testCase.functionName === fn.name && (testCase.kind === 'property' || testCase.kind === 'regression' || testCase.name.includes('boundary'))
  );
}

function mutantsForFunction(fn: ContractFunction, suite: GeneratedTestSuite): MutantResult[] {
  const mutants: MutantResult[] = [];
  const strongAssertion = hasConcreteAssertion(fn, suite);

  if (fn.hasUncheckedArithmetic) {
    mutants.push(makeMutant(fn.name, 'arithmetic-operator-flip', `Flip \`+\` to \`-\` (or vice versa) in ${fn.name}`, strongAssertion));
  }
  if (fn.branchCount > 0) {
    mutants.push(makeMutant(fn.name, 'comparison-boundary-flip', `Flip \`<\` to \`<=\` (or vice versa) in a conditional inside ${fn.name}`, strongAssertion));
  }
  if (fn.hasAuthCheck) {
    mutants.push(
      makeMutant(
        fn.name,
        'auth-check-negation',
        `Remove the \`require_auth\` call in ${fn.name}`,
        suite.testCases.some((t) => t.functionName === fn.name && t.kind === 'regression')
      )
    );
  }
  if (fn.returnType) {
    mutants.push(makeMutant(fn.name, 'return-value-negation', `Negate/replace the return value of ${fn.name}`, strongAssertion));
  }
  return mutants;
}

function makeMutant(functionName: string, operator: MutationOperator, description: string, likelyKilled: boolean): MutantResult {
  return { id: nextId('mutant'), functionName, operator, description, likelyKilled };
}

export function estimateMutationScore(contract: ParsedContract, suite: GeneratedTestSuite): MutationReport {
  const mutants = contract.functions.flatMap((fn) => mutantsForFunction(fn, suite));
  const likelyKilled = mutants.filter((m) => m.likelyKilled).length;
  const likelySurvived = mutants.length - likelyKilled;
  const estimatedMutationScorePct = mutants.length === 0 ? 0 : Math.round((likelyKilled / mutants.length) * 10000) / 100;

  return {
    totalMutants: mutants.length,
    likelyKilled,
    likelySurvived,
    estimatedMutationScorePct,
    mutants,
  };
}
