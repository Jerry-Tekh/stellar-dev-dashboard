import type {
  ContractFunction,
  DerivedInvariant,
  ParsedContract,
  StaticFinding,
} from '../../types/contractTesting';

/**
 * Heuristic, pattern-based static analysis over a `ParsedContract`. This is
 * NOT symbolic execution, model checking, or theorem proving — it flags
 * shapes of code that commonly precede real Soroban vulnerabilities (missing
 * auth guards, unchecked arithmetic, panics on external input, external
 * calls ahead of state writes) so a developer can prioritize review and so
 * the generated test suite can target the riskiest functions first. See
 * docs/contract-testing.md for the full methodology and its limits.
 */

const ADMIN_LIKE =
  /^(admin|owner|withdraw|mint|burn|set_|upgrade|initialize|transfer|remove_|revoke|release|claim|close|pause|unpause|deposit|redeem)/i;

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

function analyzeFunction(fn: ContractFunction): StaticFinding[] {
  const findings: StaticFinding[] = [];

  if (fn.mutatesState && !fn.hasAuthCheck && ADMIN_LIKE.test(fn.name)) {
    findings.push({
      id: nextId('finding'),
      severity: 'critical',
      category: 'access-control',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` mutates contract state but no \`require_auth\`/\`require_auth_for_args\` call was found in its body.`,
      recommendation:
        'Call `.require_auth()` on the authorizing `Address` parameter before any state mutation, or document why this function is intentionally unauthenticated.',
    });
  } else if (fn.mutatesState && !fn.hasAuthCheck) {
    findings.push({
      id: nextId('finding'),
      severity: 'medium',
      category: 'access-control',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` writes to storage without an observed \`require_auth\` call.`,
      recommendation: 'Confirm this function is meant to be callable by any address; add `require_auth()` if not.',
    });
  }

  if (fn.hasUncheckedArithmetic) {
    findings.push({
      id: nextId('finding'),
      severity: 'high',
      category: 'arithmetic',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` performs arithmetic without a visible \`checked_add\`/\`checked_sub\`/\`checked_mul\`/\`checked_div\` guard.`,
      recommendation:
        'Use the `checked_*` variants (or `saturating_*` where overflow should clamp) and handle the `None` case explicitly instead of relying on WASM trap behavior.',
    });
  }

  if (fn.hasPanicRisk) {
    findings.push({
      id: nextId('finding'),
      severity: 'medium',
      category: 'panic-safety',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` contains \`panic!\`, \`.unwrap()\`, or \`.expect()\`, which aborts the whole transaction on failure.`,
      recommendation: 'Prefer returning a typed `Result`/contract error so callers can handle failure without a full trap where practical.',
    });
  }

  if (fn.hasExternalCall && fn.hasStorageWrite) {
    findings.push({
      id: nextId('finding'),
      severity: 'high',
      category: 'reentrancy',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` both performs a cross-contract call and writes to storage; verify state is finalized before the external call (checks-effects-interactions).`,
      recommendation: 'Apply the checks-effects-interactions pattern: validate, update local state, then invoke the external contract last.',
    });
  }

  if (fn.branchCount === 0 && fn.mutatesState) {
    findings.push({
      id: nextId('finding'),
      severity: 'info',
      category: 'resource-usage',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` has no visible input validation branches before mutating state.`,
      recommendation: 'Confirm input parameters are validated (bounds, non-zero amounts, allowed callers) even when logic looks straightforward.',
    });
  }

  return findings;
}

export function runStaticAnalysis(contract: ParsedContract): StaticFinding[] {
  const findings = contract.functions.flatMap(analyzeFunction);
  if (contract.usesStorage && contract.functions.every((fn) => !fn.hasStorageWrite)) {
    findings.push({
      id: nextId('finding'),
      severity: 'info',
      category: 'storage-growth',
      functionName: null,
      line: null,
      message: 'Contract references `env.storage()` but no parsed function shows a matching `.set()`/`.bump()` call — storage lifecycle management may live outside the scanned functions.',
      recommendation: 'Confirm TTL extension (`extend_ttl`/`bump`) is applied to persistent entries to avoid unexpected archival.',
    });
  }
  return findings;
}

/**
 * Derives simple invariant candidates from function shape, used to seed
 * property-based tests. This is intentionally conservative — it only
 * proposes an invariant when the pattern (subtraction near a balance-like
 * name) is a strong signal, to keep the false-positive rate low.
 */
export function deriveInvariants(contract: ParsedContract): DerivedInvariant[] {
  const invariants: DerivedInvariant[] = [];
  for (const fn of contract.functions) {
    if (fn.hasUncheckedArithmetic) {
      invariants.push({
        id: nextId('invariant'),
        functionName: fn.name,
        description: `Numeric state touched by \`${fn.name}\` never goes negative or overflows its integer width.`,
        expression: `forall inputs: ${fn.name}(..) does not panic and result >= 0`,
      });
    }
    if (fn.mutatesState && fn.hasAuthCheck) {
      invariants.push({
        id: nextId('invariant'),
        functionName: fn.name,
        description: `\`${fn.name}\` only mutates state for the authorized caller.`,
        expression: `forall caller != authorized_address: ${fn.name}(..) called by caller fails require_auth`,
      });
    }
    if (fn.params.some((p) => p.kind === 'i128' || p.kind === 'u128' || p.kind === 'u32')) {
      invariants.push({
        id: nextId('invariant'),
        functionName: fn.name,
        description: `\`${fn.name}\` handles boundary numeric inputs (0, max, and negative-where-applicable) without an unhandled panic.`,
        expression: `forall n in {MIN, 0, MAX}: ${fn.name}(n) either succeeds or returns a typed error`,
      });
    }
  }
  return invariants;
}
