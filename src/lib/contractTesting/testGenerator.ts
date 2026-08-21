import type {
  ContractFunction,
  ContractParam,
  DerivedInvariant,
  GeneratedTestCase,
  GeneratedTestKind,
  GeneratedTestSuite,
  ParamKind,
  ParsedContract,
  StaticFinding,
} from '../../types/contractTesting';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

/** Representative "happy path" value for a parameter, by type. */
function sampleValue(param: ContractParam): string {
  switch (param.kind) {
    case 'Address':
      return 'Address::generate(&env)';
    case 'Symbol':
      return `symbol_short!("${param.name.slice(0, 8) || 'val'}")`;
    case 'String':
      return `String::from_str(&env, "${param.name}")`;
    case 'BytesN':
      return 'BytesN::from_array(&env, &[7u8; 32])';
    case 'Bytes':
      return 'Bytes::from_array(&env, &[1, 2, 3, 4])';
    case 'Vec':
      return 'Vec::new(&env)';
    case 'Map':
      return 'Map::new(&env)';
    case 'u32':
      return '10u32';
    case 'u64':
      return '10u64';
    case 'u128':
      return '10u128';
    case 'i32':
      return '10i32';
    case 'i64':
      return '10i64';
    case 'i128':
      return '10i128';
    case 'bool':
      return 'true';
    default:
      return `/* TODO: supply a value for ${param.name}: ${param.type} */ Default::default()`;
  }
}

const NUMERIC_BOUNDARIES: Partial<Record<ParamKind, string[]>> = {
  u32: ['0u32', 'u32::MAX'],
  u64: ['0u64', 'u64::MAX'],
  u128: ['0u128', 'u128::MAX'],
  i32: ['i32::MIN', '0i32', 'i32::MAX'],
  i64: ['i64::MIN', '0i64', 'i64::MAX'],
  i128: ['i128::MIN', '0i128', 'i128::MAX'],
};

function callArgs(params: ContractParam[], values: (_p: ContractParam) => string): string {
  return params.map((p) => values(p)).join(', ');
}

function happyPathTest(fn: ContractFunction, contractName: string): GeneratedTestCase {
  const args = callArgs(fn.params, sampleValue);
  const code = `#[test]
fn ${fn.name}_happy_path() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ${contractName});
    let client = ${contractName}Client::new(&env, &contract_id);
    let result = client.${fn.name}(${args});
    // TODO: assert on the concrete return value/state this contract expects.
    let _ = result;
}`;
  return {
    id: nextId('test'),
    kind: 'unit',
    name: `${fn.name}_happy_path`,
    functionName: fn.name,
    description: `Exercises \`${fn.name}\` with representative valid arguments and asserts it does not trap.`,
    code,
    estimatedCoverageGain: 1.5,
  };
}

function boundaryTest(fn: ContractFunction, contractName: string): GeneratedTestCase | null {
  const boundaryParam = fn.params.find((p) => NUMERIC_BOUNDARIES[p.kind]);
  if (!boundaryParam) return null;
  const boundaries = NUMERIC_BOUNDARIES[boundaryParam.kind] ?? [];
  const args = callArgs(fn.params, (p) => (p === boundaryParam ? boundaries[boundaries.length - 1] : sampleValue(p)));
  const expectation = fn.hasUncheckedArithmetic
    ? `#[should_panic]\n`
    : '';
  const code = `${expectation}#[test]
fn ${fn.name}_boundary_${boundaryParam.name}() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ${contractName});
    let client = ${contractName}Client::new(&env, &contract_id);
    // Boundary value for \`${boundaryParam.name}\`: ${boundaries.join(', ')}
    let _ = client.${fn.name}(${args});
}`;
  return {
    id: nextId('test'),
    kind: 'unit',
    name: `${fn.name}_boundary_${boundaryParam.name}`,
    functionName: fn.name,
    description: `Drives \`${boundaryParam.name}\` to its type boundary to probe for overflow/underflow panics in \`${fn.name}\`.`,
    code,
    estimatedCoverageGain: 1.1,
  };
}

function propertyTest(invariant: DerivedInvariant, contractName: string): GeneratedTestCase {
  const code = `proptest! {
    #[test]
    fn ${invariant.functionName}_invariant_holds(seed in any::<i64>()) {
        // Invariant: ${invariant.description}
        // Expression: ${invariant.expression}
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ${contractName});
        let client = ${contractName}Client::new(&env, &contract_id);
        // TODO: derive concrete arguments for \`${invariant.functionName}\` from \`seed\`
        // and assert the invariant above holds for every generated input.
        let _ = (&client, seed);
    }
}`;
  return {
    id: nextId('test'),
    kind: 'property',
    name: `${invariant.functionName}_invariant_holds`,
    functionName: invariant.functionName,
    description: invariant.description,
    code,
    estimatedCoverageGain: 0.9,
  };
}

function fuzzSeedTest(fn: ContractFunction, contractName: string): GeneratedTestCase {
  const seeds = fn.params.map((p) => {
    const boundaries = NUMERIC_BOUNDARIES[p.kind];
    return boundaries ? `[${boundaries.join(', ')}]` : `[${sampleValue(p)}]`;
  });
  const code = `// Fuzz seed corpus for \`${fn.name}\` — feed these values (and combinations
// thereof) through a fuzzing harness such as \`cargo fuzz\` or \`honggfuzz\`.
fn ${fn.name}_fuzz_seeds() -> Vec<&'static str> {
    vec![${seeds.map((s) => `"${s.replace(/"/g, "'")}"`).join(', ')}]
}

fuzz_target!(|data: &[u8]| {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ${contractName});
    let client = ${contractName}Client::new(&env, &contract_id);
    // TODO: decode \`data\` into ${fn.name}'s argument types and invoke the client,
    // asserting it never panics outside of documented error paths.
    let _ = (&client, data);
});`;
  return {
    id: nextId('test'),
    kind: 'fuzz',
    name: `${fn.name}_fuzz_seeds`,
    functionName: fn.name,
    description: `Boundary-derived fuzz seed corpus for \`${fn.name}\`, covering ${fn.params.length} parameter(s).`,
    code,
    estimatedCoverageGain: 0.6,
  };
}

function regressionTest(finding: StaticFinding, contractName: string): GeneratedTestCase | null {
  if (!finding.functionName) return null;
  const code = `#[test]
fn ${finding.functionName}_regression_${finding.category.replace(/-/g, '_')}() {
    // Regression guard for static finding ${finding.id} (${finding.severity}):
    // ${finding.message}
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ${contractName});
    let client = ${contractName}Client::new(&env, &contract_id);
    // TODO: reproduce the flagged condition and assert the fix holds
    // (e.g. that unauthorized callers are rejected, or overflow is checked).
    let _ = &client;
}`;
  return {
    id: nextId('test'),
    kind: 'regression',
    name: `${finding.functionName}_regression_${finding.category}`,
    functionName: finding.functionName,
    description: `Regression stub tracking static finding: ${finding.message}`,
    code,
    estimatedCoverageGain: 0.4,
  };
}

export function generateTestSuite(
  contract: ParsedContract,
  findings: StaticFinding[],
  invariants: DerivedInvariant[]
): GeneratedTestSuite {
  const testCases: GeneratedTestCase[] = [];
  for (const fn of contract.functions) {
    testCases.push(happyPathTest(fn, contract.contractName));
    const boundary = boundaryTest(fn, contract.contractName);
    if (boundary) testCases.push(boundary);
    testCases.push(fuzzSeedTest(fn, contract.contractName));
  }
  for (const invariant of invariants) {
    testCases.push(propertyTest(invariant, contract.contractName));
  }
  for (const finding of findings) {
    if (finding.severity === 'critical' || finding.severity === 'high') {
      const regression = regressionTest(finding, contract.contractName);
      if (regression) testCases.push(regression);
    }
  }

  const byKind: Record<GeneratedTestKind, number> = { unit: 0, property: 0, fuzz: 0, regression: 0 };
  for (const testCase of testCases) byKind[testCase.kind] += 1;

  return {
    contractName: contract.contractName,
    generatedAt: new Date().toISOString(),
    totalTestCases: testCases.length,
    byKind,
    testCases,
  };
}
