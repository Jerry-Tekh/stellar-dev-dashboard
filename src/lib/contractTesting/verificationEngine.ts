import type {
  ContractFunction,
  DerivedInvariant,
  ParsedContract,
  StaticFinding,
  VerificationObligation,
  VerificationReport,
  VerificationStatus,
} from '../../types/contractTesting';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

const DISCLAIMER =
  'This report is produced by pattern-based static analysis over the parsed source, not symbolic execution, model checking, or a theorem prover. Statuses indicate what the heuristics found, not a mathematical proof of correctness — treat "pass" as "no contradicting pattern observed", not "verified sound".';

function findingsFor(functionName: string, findings: StaticFinding[]): StaticFinding[] {
  return findings.filter((f) => f.functionName === functionName);
}

function buildObligation(
  invariant: DerivedInvariant,
  fn: ContractFunction | undefined,
  findings: StaticFinding[]
): VerificationObligation {
  const related = findingsFor(invariant.functionName, findings);

  if (invariant.expression.includes('does not panic and result >= 0')) {
    const arithmeticFinding = related.find((f) => f.category === 'arithmetic');
    const status: VerificationStatus = arithmeticFinding ? 'fail' : 'needs-review';
    return {
      id: nextId('obligation'),
      functionName: invariant.functionName,
      property: invariant.description,
      category: 'arithmetic',
      status,
      rationale: arithmeticFinding
        ? `Static analysis found unchecked arithmetic in \`${invariant.functionName}\` (${arithmeticFinding.id}); overflow/underflow is not ruled out until \`checked_*\` guards are added and the generated boundary test passes.`
        : `No unchecked-arithmetic pattern observed, but this cannot be proven without executing the generated boundary tests against the compiled contract.`,
    };
  }

  if (invariant.expression.includes('fails require_auth')) {
    const accessFinding = related.find((f) => f.category === 'access-control');
    const status: VerificationStatus = accessFinding ? 'fail' : 'pass';
    return {
      id: nextId('obligation'),
      functionName: invariant.functionName,
      property: invariant.description,
      category: 'access-control',
      status,
      rationale: accessFinding
        ? `\`${invariant.functionName}\` mutates state without an observed \`require_auth\` guard (${accessFinding.id}); unauthorized callers are not statically excluded.`
        : `A \`.require_auth()\`/\`.require_auth_for_args()\` call was observed guarding \`${invariant.functionName}\`; the Soroban host rejects calls lacking a valid signature for that address.`,
    };
  }

  const panicFinding = related.find((f) => f.category === 'panic-safety');
  const status: VerificationStatus = panicFinding ? 'fail' : fn?.hasUncheckedArithmetic ? 'needs-review' : 'pass';
  return {
    id: nextId('obligation'),
    functionName: invariant.functionName,
    property: invariant.description,
    category: 'panic-safety',
    status,
    rationale: panicFinding
      ? `\`${invariant.functionName}\` contains \`panic!\`/\`.unwrap()\`/\`.expect()\` (${panicFinding.id}); boundary inputs can abort the transaction instead of returning a typed error.`
      : fn?.hasUncheckedArithmetic
        ? `No explicit panic call observed, but unchecked arithmetic can still trap on boundary inputs — run the generated boundary test to confirm.`
        : `No panic-prone calls or unchecked arithmetic observed for boundary-relevant parameters.`,
  };
}

export function runVerification(
  contract: ParsedContract,
  findings: StaticFinding[],
  invariants: DerivedInvariant[]
): VerificationReport {
  const functionsByName = new Map(contract.functions.map((fn) => [fn.name, fn]));
  const obligations = invariants.map((invariant) => buildObligation(invariant, functionsByName.get(invariant.functionName), findings));

  return {
    methodology: 'heuristic-static-analysis',
    disclaimer: DISCLAIMER,
    obligations,
    passCount: obligations.filter((o) => o.status === 'pass').length,
    failCount: obligations.filter((o) => o.status === 'fail').length,
    needsReviewCount: obligations.filter((o) => o.status === 'needs-review').length,
  };
}
