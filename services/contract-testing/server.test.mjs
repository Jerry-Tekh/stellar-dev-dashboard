import assert from 'node:assert/strict';
import test from 'node:test';
import { createContractTestingServer, parseContract, analyze } from './server.mjs';

async function withServer(run) {
  const server = createContractTestingServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const COUNTER_SOURCE = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol, symbol_short};
const COUNTER: Symbol = symbol_short!("COUNTER");
#[contract]
pub struct CounterContract;
#[contractimpl]
impl CounterContract {
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env.storage().instance().get(&COUNTER).unwrap_or(0);
        count += 1;
        env.storage().instance().set(&COUNTER, &count);
        count
    }
}
`;

test('reports health and Prometheus metrics', () =>
  withServer(async (base) => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(metrics, /contract_testing_requests_total/);
  }));

test('analyzes a valid contract and returns findings/coverage/mutation/verification', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/v1/contract-testing/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: COUNTER_SOURCE }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.contract.contractName, 'CounterContract');
    assert.equal(payload.contract.functions.length, 1);
    assert.ok(Array.isArray(payload.contract.types));
    assert.ok(Array.isArray(payload.findings));
    assert.ok(Array.isArray(payload.invariants));
    assert.ok(payload.testSuite.totalTestCases > 0);
    assert.equal(payload.testSuite.testCases.length, payload.testSuite.totalTestCases);
    assert.equal(
      Object.values(payload.testSuite.byKind).reduce((sum, count) => sum + count, 0),
      payload.testSuite.totalTestCases
    );
    assert.ok(payload.coverage.totalFunctions >= 1);
    assert.ok(typeof payload.mutation.estimatedMutationScorePct === 'number');
    assert.ok(payload.mutation.mutants.every((mutant) => mutant.id && mutant.description));
    assert.equal(payload.verification.methodology, 'heuristic-static-analysis');
    assert.ok(payload.verification.obligations.every((obligation) => obligation.id && obligation.rationale));
    assert.match(payload.ciWorkflowYaml, /soroban contract build/);
  }));

test('rejects empty source with 400', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/v1/contract-testing/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: '' }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, 'empty_source');
  }));

test('rejects source over the size limit with 400', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/v1/contract-testing/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'a'.repeat(200_001) }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, 'source_too_large');
  }));

test('rejects source with no pub fn entry points with 422', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/v1/contract-testing/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: '#![no_std]\nfn helper() {}\n' }),
    });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.error.code, 'no_functions_found');
  }));

test('rejects a contract name that could inject generated code or workflow YAML', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/v1/contract-testing/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: COUNTER_SOURCE, contractName: 'Counter\njobs: injected' }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, 'invalid_contract_name');
  }));

test('rejects malformed JSON bodies with 400', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/v1/contract-testing/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(response.status, 400);
  }));

test('flags access-control findings for an unauthenticated admin-like function', () =>
  withServer(async (base) => {
    const source = `#[contract]\npub struct C;\n#[contractimpl]\nimpl C {\n    pub fn withdraw(env: Env, to: Address, amount: i128) {\n        env.storage().persistent().set(&to, &amount);\n    }\n}\n`;
    const response = await fetch(`${base}/v1/contract-testing/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    const payload = await response.json();
    assert.ok(payload.findings.some((f) => f.category === 'access-control' && f.severity === 'critical'));
  }));

test('enforces the configured API key when set', async () => {
  process.env.CONTRACT_TESTING_API_KEY = 'test-secret';
  const { createContractTestingServer: createAuthed } = await import(`./server.mjs?authed=${Date.now()}`);
  const server = createAuthed();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const unauthorized = await fetch(`${base}/health`);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${base}/health`, { headers: { authorization: 'Bearer test-secret' } });
    assert.equal(authorized.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.CONTRACT_TESTING_API_KEY;
  }
});

test('parseContract and analyze are exported for reuse', () => {
  const parsed = parseContract(COUNTER_SOURCE);
  assert.equal(parsed.functions[0].name, 'increment');
  const result = analyze(COUNTER_SOURCE, 'Overridden', 'req-x');
  assert.equal(result.contract.contractName, 'Overridden');
  assert.equal(result.requestId, 'req-x');
});
