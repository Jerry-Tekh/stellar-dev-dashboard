/**
 * Contract testing & verification microservice.
 *
 * Zero-dependency `node:http` server mirroring the shape of
 * services/sentiment-analysis/server.mjs and services/network-monitor. It
 * runs a compact, self-contained copy of the parse -> static-analyze ->
 * generate-tests -> estimate-coverage/mutation -> verify pipeline that also
 * ships client-side under src/lib/contractTesting/ (browser callers use the
 * client-side copy directly when this service isn't configured, so the
 * dashboard works fully offline). The two implementations are deliberately
 * separate, standalone runtimes — same pattern the repo already uses between
 * services/sentiment-analysis and src/lib/marketSentiment.
 *
 * This performs pattern-based static analysis, NOT symbolic execution,
 * model checking, or theorem proving. See docs/contract-testing.md.
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 8793),
  MAX_BODY = 512 * 1024,
  MAX_SOURCE_LENGTH = 200_000,
  WINDOW = 60_000,
  LIMIT = 60;
const allowed = (process.env.CONTRACT_TESTING_ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((x) => x.trim()),
  apiKey = process.env.CONTRACT_TESTING_API_KEY || '';
const requests = new Map(),
  stats = { requests: 0, analyzed: 0, rejected: 0, startedAt: Date.now() };

const json = (res, status, payload, headers = {}) => {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
};
const cors = (req) => {
  const origin = req.headers.origin;
  return origin && allowed.includes(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'authorization,content-type,x-request-id',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        vary: 'Origin',
      }
    : {};
};
function rateLimited(req) {
  const key = req.socket.remoteAddress || 'unknown',
    now = Date.now(),
    entry = requests.get(key);
  if (!entry || now - entry.start > WINDOW) {
    requests.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > LIMIT;
}
function authorized(req) {
  return !apiKey || req.headers.authorization === `Bearer ${apiKey}`;
}
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0,
      text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body exceeds 512 KB.'), { status: 413 }));
        req.destroy();
      } else text += chunk;
    });
    req.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('Malformed JSON body.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// ---- analysis pipeline (compact port of src/lib/contractTesting/*) ----

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return source.length;
}
function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}
function splitTopLevel(input) {
  const parts = [];
  let depth = 0,
    current = '';
  for (const char of input) {
    if (char === '<' || char === '(' || char === '[') depth++;
    else if (char === '>' || char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}
function classifyType(rawType) {
  const type = rawType.trim().replace(/^&\s*/, '').replace(/^mut\s+/, '');
  const kinds = ['Address', 'Symbol', 'String', 'BytesN', 'Bytes', 'Vec', 'Map', 'u32', 'u64', 'u128', 'i32', 'i64', 'i128', 'bool'];
  return kinds.find((kind) => type === kind || type.startsWith(`${kind}<`) || type.startsWith(`${kind}(`)) || 'unknown';
}
function analyzeBody(body) {
  const hasAuthCheck = /\.require_auth(_for_args)?\s*\(/.test(body);
  const hasArithmetic = /[^=!<>]=?\s*[a-zA-Z0-9_)\]]\s*[+\-*]\s*[a-zA-Z0-9_(]/.test(body);
  const hasCheckedArithmetic = /\.checked_(add|sub|mul|div)\s*\(/.test(body);
  const hasStorageWrite = /\.storage\(\)[\s\S]{0,40}\.(set|extend_ttl|bump)\s*\(/.test(body);
  const hasPanicRisk = /\bpanic!\s*\(|\.unwrap\s*\(\)|\.expect\s*\(/.test(body);
  const hasExternalCall = /env\.invoke_contract/.test(body);
  const branchCount =
    (body.match(/\bif\s+/g) ?? []).length +
    (body.match(/\bmatch\s+/g) ?? []).length +
    (body.match(/\b(for|while)\s+/g) ?? []).length +
    (body.match(/\?[\s;)]/g) ?? []).length;
  return {
    hasAuthCheck,
    hasUncheckedArithmetic: hasArithmetic && !hasCheckedArithmetic,
    hasPanicRisk,
    hasExternalCall,
    hasStorageWrite,
    branchCount,
  };
}
function parseContract(source) {
  const functions = [];
  const implRe = /#\[contractimpl\]/g;
  let match;
  while ((match = implRe.exec(source))) {
    const braceIndex = source.indexOf('{', match.index);
    if (braceIndex === -1) continue;
    const blockEnd = findMatchingBrace(source, braceIndex);
    const block = source.slice(braceIndex, blockEnd);
    const fnRe = /pub\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(->\s*([^{]+))?\s*\{/g;
    let fnMatch;
    while ((fnMatch = fnRe.exec(block))) {
      const [, name, paramList, , returnTypeRaw] = fnMatch;
      const openBraceIndex = braceIndex + fnMatch.index + fnMatch[0].length - 1;
      const bodyEnd = findMatchingBrace(source, openBraceIndex);
      const body = source.slice(openBraceIndex, bodyEnd);
      const analysis = analyzeBody(body);
      const params = splitTopLevel(paramList)
        .filter((raw) => raw !== 'self' && raw !== '&self' && raw !== '&mut self')
        .map((raw) => {
          const idx = raw.indexOf(':');
          if (idx === -1) return { name: raw.trim(), type: 'unknown', kind: 'unknown' };
          const type = raw.slice(idx + 1).trim();
          return { name: raw.slice(0, idx).trim(), type, kind: classifyType(type) };
        })
        .filter((p) => p.type !== 'Env');
      functions.push({
        name,
        params,
        returnType: returnTypeRaw ? returnTypeRaw.trim() : null,
        line: lineOf(source, braceIndex + fnMatch.index),
        isPublic: true,
        mutatesState: analysis.hasStorageWrite,
        ...analysis,
      });
    }
    implRe.lastIndex = blockEnd;
  }
  const nameMatch = /#\[contract\][\s\S]{0,80}?pub\s+struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(source);
  const types = [];
  const typeRe = /#\[contracttype\][\s\S]{0,80}?pub\s+(struct|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = typeRe.exec(source))) {
    types.push({ name: match[2], kind: match[1], line: lineOf(source, match.index) });
  }
  return {
    contractName: nameMatch ? nameMatch[1] : 'Contract',
    functions,
    types,
    lineCount: source.split('\n').length,
    usesStorage: functions.some((fn) => fn.hasStorageWrite) || /\.storage\(\)/.test(source),
    usesCrossContractCalls: functions.some((fn) => fn.hasExternalCall),
  };
}

const ADMIN_LIKE =
  /^(admin|owner|withdraw|mint|burn|set_|upgrade|initialize|transfer|remove_|revoke|release|claim|close|pause|unpause|deposit|redeem)/i;
let findingCounter = 0;
function analyzeFinding(fn) {
  const findings = [];
  const id = () => `finding-${(++findingCounter).toString(36)}`;
  if (fn.mutatesState && !fn.hasAuthCheck) {
    findings.push({
      id: id(),
      severity: ADMIN_LIKE.test(fn.name) ? 'critical' : 'medium',
      category: 'access-control',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` mutates contract state without an observed require_auth call.`,
      recommendation: 'Call .require_auth()/.require_auth_for_args() on the authorizing Address before mutating state.',
    });
  }
  if (fn.hasUncheckedArithmetic) {
    findings.push({
      id: id(),
      severity: 'high',
      category: 'arithmetic',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` performs arithmetic without a visible checked_* guard.`,
      recommendation: 'Use checked_add/checked_sub/checked_mul/checked_div and handle the None case explicitly.',
    });
  }
  if (fn.hasPanicRisk) {
    findings.push({
      id: id(),
      severity: 'medium',
      category: 'panic-safety',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` contains panic!/.unwrap()/.expect(), aborting the transaction on failure.`,
      recommendation: 'Prefer a typed Result/contract error where practical.',
    });
  }
  if (fn.hasExternalCall && fn.hasStorageWrite) {
    findings.push({
      id: id(),
      severity: 'high',
      category: 'reentrancy',
      functionName: fn.name,
      line: fn.line,
      message: `\`${fn.name}\` writes storage and performs a cross-contract call; verify checks-effects-interactions ordering.`,
      recommendation: 'Validate, update local state, then invoke the external contract last.',
    });
  }
  return findings;
}
function runStaticAnalysis(contract) {
  return contract.functions.flatMap(analyzeFinding);
}

function deriveInvariants(contract) {
  const invariants = [];
  for (const fn of contract.functions) {
    if (fn.hasUncheckedArithmetic)
      invariants.push({
        id: `invariant-${invariants.length + 1}`,
        functionName: fn.name,
        description: `Numeric state touched by \`${fn.name}\` never overflows or underflows.`,
        expression: `forall inputs: ${fn.name}(..) does not trap from arithmetic`,
      });
    if (fn.mutatesState && fn.hasAuthCheck)
      invariants.push({
        id: `invariant-${invariants.length + 1}`,
        functionName: fn.name,
        description: `\`${fn.name}\` only mutates state for an authorized caller.`,
        expression: `forall unauthorized callers: ${fn.name}(..) fails require_auth`,
      });
    if (fn.params.some((param) => ['u32', 'u64', 'u128', 'i32', 'i64', 'i128'].includes(param.kind)))
      invariants.push({
        id: `invariant-${invariants.length + 1}`,
        functionName: fn.name,
        description: `\`${fn.name}\` handles numeric boundary inputs without an undocumented trap.`,
        expression: `forall n in {MIN, 0, MAX}: ${fn.name}(n) succeeds or returns a typed error`,
      });
  }
  return invariants;
}

function sampleValue(param) {
  if (param.kind === 'Address') return 'Address::generate(&env)';
  if (param.kind === 'bool') return 'true';
  if (/^[ui](32|64|128)$/.test(param.kind)) return `10${param.kind}`;
  if (param.kind === 'Symbol') return 'symbol_short!("value")';
  if (param.kind === 'String') return 'String::from_str(&env, "value")';
  if (param.kind === 'BytesN') return 'BytesN::from_array(&env, &[7u8; 32])';
  if (param.kind === 'Bytes') return 'Bytes::from_array(&env, &[1, 2, 3, 4])';
  if (param.kind === 'Vec') return 'Vec::new(&env)';
  if (param.kind === 'Map') return 'Map::new(&env)';
  return 'Default::default() /* TODO: domain value */';
}

function generatedCase(kind, fn, suffix, description, code) {
  return {
    id: `test-${kind}-${fn.name}-${suffix}`,
    kind,
    name: `${fn.name}_${suffix}`,
    functionName: fn.name,
    description,
    code,
    estimatedCoverageGain: kind === 'unit' ? 1.5 : kind === 'property' ? 0.9 : 0.6,
  };
}

function testPrelude(fn, contractName) {
  const args = fn.params.map(sampleValue).join(', ');
  return `let env = Env::default();\n    env.mock_all_auths();\n    let contract_id = env.register_contract(None, ${contractName});\n    let client = ${contractName}Client::new(&env, &contract_id);\n    let _result = client.${fn.name}(${args});`;
}

function generateTestSuite(contract, findings, invariants) {
  const testCases = [];
  for (const fn of contract.functions) {
    testCases.push(
      generatedCase(
        'unit',
        fn,
        'happy_path',
        `Exercises \`${fn.name}\` with representative valid arguments.`,
        `#[test]\nfn ${fn.name}_happy_path() {\n    ${testPrelude(fn, contract.contractName)}\n    // TODO: assert the expected return value and state.\n}`
      ),
      generatedCase(
        'fuzz',
        fn,
        'fuzz_harness',
        `Fuzz harness scaffold for \`${fn.name}\`.`,
        `fuzz_target!(|data: &[u8]| {\n    // TODO: decode data into ${fn.name}'s parameters and assert documented outcomes.\n    let _ = data;\n});`
      )
    );
    if (fn.params.some((param) => /^[ui](32|64|128)$/.test(param.kind)))
      testCases.push(
        generatedCase(
          'unit',
          fn,
          'numeric_boundary',
          `Exercises numeric boundaries for \`${fn.name}\`.`,
          `#[test]\nfn ${fn.name}_numeric_boundary() {\n    ${testPrelude(fn, contract.contractName)}\n    // TODO: repeat with MIN, zero, and MAX values and assert typed failures.\n}`
        )
      );
  }
  for (const invariant of invariants) {
    const fn = contract.functions.find((candidate) => candidate.name === invariant.functionName);
    if (!fn) continue;
    testCases.push(
      generatedCase(
        'property',
        fn,
        `property_${invariant.id.replace(/[^a-z0-9]/gi, '_')}`,
        invariant.description,
        `proptest! {\n    #[test]\n    fn ${fn.name}_property(seed in any::<i64>()) {\n        // ${invariant.expression}\n        let _ = seed; // TODO: map seed to contract inputs and assert the invariant.\n    }\n}`
      )
    );
  }
  for (const finding of findings.filter((item) => item.functionName && ['critical', 'high'].includes(item.severity))) {
    const fn = contract.functions.find((candidate) => candidate.name === finding.functionName);
    if (!fn) continue;
    const suffix = `regression_${finding.category.replace(/-/g, '_')}`;
    testCases.push(
      generatedCase(
        'regression',
        fn,
        suffix,
        `Regression scaffold for: ${finding.message}`,
        `#[test]\nfn ${fn.name}_${suffix}() {\n    // TODO: reproduce finding ${finding.id} and assert the repaired behavior.\n}`
      )
    );
  }
  const byKind = { unit: 0, property: 0, fuzz: 0, regression: 0 };
  for (const testCase of testCases) byKind[testCase.kind]++;
  return {
    contractName: contract.contractName,
    generatedAt: new Date().toISOString(),
    totalTestCases: testCases.length,
    byKind,
    testCases,
  };
}

function estimateCoverage(contract, testCaseCountByFn) {
  const totalFunctions = contract.functions.length;
  const coveredFunctions = contract.functions.filter((fn) => (testCaseCountByFn.get(fn.name) ?? 0) > 0).length;
  const totalBranches = contract.functions.reduce((s, fn) => s + Math.max(1, fn.branchCount), 0);
  const coveredBranches = contract.functions.reduce((s, fn) => {
    const cases = testCaseCountByFn.get(fn.name) ?? 0;
    return cases === 0 ? s : s + Math.min(Math.max(1, fn.branchCount), cases);
  }, 0);
  const fnPct = totalFunctions === 0 ? 0 : round((coveredFunctions / totalFunctions) * 100);
  const branchPct = totalBranches === 0 ? 0 : round((coveredBranches / totalBranches) * 100);
  return {
    totalFunctions,
    coveredFunctions,
    totalBranches,
    coveredBranches,
    estimatedFunctionCoveragePct: fnPct,
    estimatedBranchCoveragePct: branchPct,
    estimatedPathCoveragePct: round(fnPct * 0.35 + branchPct * 0.65),
    uncoveredFunctions: contract.functions.filter((fn) => (testCaseCountByFn.get(fn.name) ?? 0) === 0).map((fn) => fn.name),
  };
}
function round(n) {
  return Math.round(n * 100) / 100;
}

function estimateMutation(contract) {
  const mutants = [];
  const add = (fn, operator, description, likelyKilled) =>
    mutants.push({ id: `mutant-${mutants.length + 1}`, functionName: fn.name, operator, description, likelyKilled });
  for (const fn of contract.functions) {
    if (fn.hasUncheckedArithmetic)
      add(fn, 'arithmetic-operator-flip', 'Replace an arithmetic operator with a neighboring operator.', false);
    if (fn.branchCount > 0)
      add(fn, 'comparison-boundary-flip', 'Shift or negate a branch boundary.', true);
    if (fn.hasAuthCheck) add(fn, 'auth-check-negation', 'Remove or negate the authorization check.', false);
    if (fn.returnType) add(fn, 'return-value-negation', 'Replace the returned value with an alternate value.', false);
  }
  const likelyKilled = mutants.filter((m) => m.likelyKilled).length;
  return {
    totalMutants: mutants.length,
    likelyKilled,
    likelySurvived: mutants.length - likelyKilled,
    estimatedMutationScorePct: mutants.length === 0 ? 0 : round((likelyKilled / mutants.length) * 100),
    mutants,
  };
}

function runVerification(contract, findings, invariants) {
  const obligations = [];
  for (const invariant of invariants) {
    const related = findings.filter((finding) => finding.functionName === invariant.functionName);
    const auth = invariant.expression.includes('require_auth');
    const arithmetic = invariant.expression.includes('arithmetic');
    const category = auth ? 'access-control' : arithmetic ? 'arithmetic' : 'panic-safety';
    const contradictory = related.find((finding) => finding.category === category);
    const status = contradictory ? 'fail' : auth ? 'pass' : 'needs-review';
    obligations.push({
      id: `obligation-${obligations.length + 1}`,
      functionName: invariant.functionName,
      property: invariant.description,
      category,
      status,
      rationale: contradictory
        ? `Static finding ${contradictory.id} contradicts this obligation; repair and execute the generated tests.`
        : auth
          ? 'A require_auth pattern was observed; execute the generated unauthorized-caller test to confirm behavior.'
          : 'No contradicting pattern was observed, but execution is required before treating this obligation as verified.',
    });
  }
  return {
    methodology: 'heuristic-static-analysis',
    disclaimer:
      'Pattern-based static analysis, not symbolic execution or a theorem prover. "pass" means no contradicting pattern was observed, not a mathematical proof.',
    obligations,
    passCount: obligations.filter((o) => o.status === 'pass').length,
    failCount: obligations.filter((o) => o.status === 'fail').length,
    needsReviewCount: obligations.filter((o) => o.status === 'needs-review').length,
  };
}

function generateCiWorkflowYaml(contractName) {
  const dir = 'contracts/' + contractName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `name: ${contractName} contract tests\n\non:\n  push:\n    paths:\n      - '${dir}/**'\n  pull_request:\n    paths:\n      - '${dir}/**'\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: ${dir}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions-rs/toolchain@v1\n        with:\n          toolchain: stable\n          target: wasm32-unknown-unknown\n          override: true\n      - run: cargo install --locked soroban-cli --version ^21\n      - run: soroban contract build\n      - run: cargo test --workspace\n      - name: Run mutation testing (advisory)\n        continue-on-error: true\n        run: |\n          cargo install --locked cargo-mutants\n          cargo mutants --no-shuffle --timeout-multiplier 2 -- --workspace\n`;
}

function analyze(source, contractNameOverride, requestId) {
  const startedAt = Date.now();
  const contract = parseContract(source);
  if (contractNameOverride) contract.contractName = contractNameOverride;
  const findings = runStaticAnalysis(contract);
  const invariants = deriveInvariants(contract);
  const testSuite = generateTestSuite(contract, findings, invariants);
  const testCaseCountByFn = new Map(
    contract.functions.map((fn) => [
      fn.name,
      testSuite.testCases.filter((testCase) => testCase.functionName === fn.name).length,
    ])
  );
  const coverage = estimateCoverage(contract, testCaseCountByFn);
  const mutation = estimateMutation(contract);
  const verification = runVerification(contract, findings, invariants);
  return {
    requestId,
    generatedAt: new Date().toISOString(),
    state: 'live',
    contract,
    findings,
    invariants,
    testSuite,
    coverage,
    mutation,
    verification,
    ciWorkflowYaml: generateCiWorkflowYaml(contract.contractName),
    durationMs: Date.now() - startedAt,
  };
}

export function createContractTestingServer() {
  return http.createServer(async (req, res) => {
    stats.requests++;
    const headers = cors(req);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      return res.end();
    }
    if (rateLimited(req)) {
      stats.rejected++;
      return json(res, 429, { error: { code: 'rate_limited', message: 'Request rate limit exceeded.' } }, headers);
    }
    if (!authorized(req)) {
      stats.rejected++;
      return json(res, 401, { error: { code: 'unauthorized', message: 'Valid bearer credentials are required.' } }, headers);
    }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz'))
        return json(res, 200, { status: 'ok', uptimeSeconds: Math.floor((Date.now() - stats.startedAt) / 1000) }, headers);
      if (req.method === 'GET' && url.pathname === '/metrics') {
        const text = `contract_testing_requests_total ${stats.requests}\ncontract_testing_analyzed_total ${stats.analyzed}\ncontract_testing_requests_rejected_total ${stats.rejected}\n`;
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4', ...headers });
        return res.end(text);
      }
      if (req.method === 'POST' && url.pathname === '/v1/contract-testing/analyze') {
        const payload = await readBody(req);
        const source = typeof payload.source === 'string' ? payload.source : '';
        const requestId = req.headers['x-request-id']?.toString() || `srv-${Date.now()}`;
        if (!source.trim())
          return json(res, 400, { error: { code: 'empty_source', message: 'source is required.' } }, headers);
        if (source.length > MAX_SOURCE_LENGTH)
          return json(
            res,
            400,
            { error: { code: 'source_too_large', message: `source exceeds ${MAX_SOURCE_LENGTH} characters.` } },
            headers
          );
        if (
          payload.contractName &&
          (typeof payload.contractName !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(payload.contractName))
        )
          return json(
            res,
            400,
            { error: { code: 'invalid_contract_name', message: 'contractName must be a valid Rust identifier.' } },
            headers
          );
        if (!/pub\s+fn\s+[a-zA-Z_]/.test(source))
          return json(
            res,
            422,
            { error: { code: 'no_functions_found', message: 'No pub fn entry points were found.' } },
            headers
          );
        stats.analyzed++;
        return json(res, 200, analyze(source, payload.contractName, requestId), headers);
      }
      return json(res, 404, { error: { code: 'not_found', message: 'Endpoint not found.' } }, headers);
    } catch (error) {
      if (!res.headersSent)
        json(
          res,
          error.status || 500,
          {
            error: {
              code: error.status === 400 ? 'invalid_json' : 'internal_error',
              message: error.status ? error.message : 'The contract testing service could not process the request.',
            },
          },
          headers
        );
    }
  });
}
export { parseContract, runStaticAnalysis, analyze };
if (import.meta.url === pathToFileURL(process.argv[1] || '').href)
  createContractTestingServer().listen(PORT, () =>
    process.stdout.write(`Contract testing service listening on ${PORT}\n`)
  );
