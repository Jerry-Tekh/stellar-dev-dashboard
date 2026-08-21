# Contract Testing & Verification

## Purpose

The Contract Testing & Verification workspace (`/contractTesting`) takes Soroban Rust contract source and produces a generated test suite (unit, property-based, fuzz-seed, and regression tests), static security findings, coverage and mutation-score estimates, a heuristic formal-verification report, and a downloadable CI/CD workflow. It exists to give contract authors a fast first pass before human review and a real Rust toolchain, not to replace either.

**This is pattern-based static analysis, not symbolic execution, model checking, or a SAT/SMT-backed theorem prover.** Every report the feature produces says so explicitly. Treat "pass" as "no contradicting pattern was observed in this heuristic scan," never as a mathematical proof of correctness. See [Methodology and limitations](#methodology-and-limitations) below before relying on any output for a security decision.

## Architecture

The feature has the same four boundaries as the dashboard's other AI-assisted workspaces (market sentiment, network intelligence, bridge monitoring):

- **Typed domain contracts** — `src/types/contractTesting.ts`.
- **Deterministic, framework-independent engine** — `src/lib/contractTesting/`: `parser.ts` (structural Rust/Soroban parsing), `staticAnalyzer.ts` (findings + derived invariants), `testGenerator.ts` (unit/property/fuzz/regression test source generation), `coverageEstimator.ts`, `mutationEstimator.ts`, `verificationEngine.ts`, `ciWorkflowGenerator.ts`, and `client.ts` (orchestration + optional remote service call).
- **Lifecycle and resilience** — `useContractTesting` (`src/hooks/useContractTesting.ts`): request lifecycle, local run history (last 10, `localStorage` only), sample loading, file upload, and download helpers.
- **The lazy-loaded `/contractTesting` workspace** — `src/components/contract-testing/`.

An optional Node microservice at `services/contract-testing/server.mjs` exposes the same pipeline over HTTP (`POST /v1/contract-testing/analyze`) as a zero-dependency `node:http` server, matching the shape of `services/sentiment-analysis` and `services/network-monitor`. When `VITE_CONTRACT_TESTING_API_URL` is unset (the default), the dashboard runs the identical pipeline directly in the browser — the feature is fully usable offline, with no backend or connected wallet required. If a configured service is unavailable, rate-limited, times out, or returns an invalid response, the client safely falls back to local analysis and labels the result `DEGRADED`. The service and the browser engine are two independent implementations of the same pipeline, not a shared package — the same deliberate duplication the repo already uses between `services/sentiment-analysis` and `src/lib/marketSentiment`, since there is no cross-runtime shared-package setup in this repo.

## Methodology and limitations

1. **Parse** — locate `#[contractimpl]` blocks and `pub fn` entry points via brace/bracket-aware scanning (not a real Rust AST), extracting parameter names/types and `#[contracttype]` declarations.
2. **Static analysis** — flag shapes of code that commonly precede real Soroban issues: state mutation without an observed `require_auth`/`require_auth_for_args` call, arithmetic without `checked_*` guards, `panic!`/`.unwrap()`/`.expect()` on paths reachable from external input, cross-contract calls alongside storage writes (checks-effects-interactions risk), and functions with no visible validation branches before mutating state.
3. **Invariant derivation** — from the same signals, propose a small set of candidate invariants (no overflow/underflow, caller-authorization, boundary-input safety) used to seed property-based tests.
4. **Test generation** — emit Rust test source: a happy-path unit test and (for numeric parameters) a boundary test per function, a `proptest`-flavored property test per derived invariant, a fuzz seed corpus per function, and a regression stub per high/critical finding. Generated tests contain `TODO` markers where a concrete assertion needs a human decision — they are a scaffold, not a finished suite.
5. **Coverage estimate** — counts branch/decision points (`if`, `match`, loops, `?`) as coverable units and estimates function/branch/path coverage from how many generated cases target each function. This is a static estimate from generated-test count, not output from an instrumented coverage tool (e.g. `cargo llvm-cov`) run against the compiled contract.
6. **Mutation estimate** — applies a small catalog of mutation operators (arithmetic-operator flip, comparison/boundary flip, auth-check negation, return-value negation) conceptually per function, and estimates a "likely killed" rate from whether the generated suite has a *concrete* assertion for that function (a boundary test, property test, or regression test — not just the happy-path scaffold, which only carries a `TODO` assertion). This is not an executed `cargo-mutants` run; the generated CI workflow runs the real thing.
7. **Verification obligations** — turns derived invariants into pass/fail/needs-review obligations against the findings. `pass` means no contradicting static pattern was found; it is not a proof.

## What this does **not** do

- No symbolic execution or path exploration of compiled WASM.
- No SAT/SMT-backed theorem proving.
- No temporal/model checking of contract state machines.
- No execution of the generated tests — they are source, not results, until you run them with a real Rust toolchain (the generated CI workflow does this).
- No guarantee of resource-usage (CPU/memory/storage) bounds.

For genuine correctness guarantees, pair this tool with manual audit, the generated CI workflow's real `cargo test`/`cargo-mutants` runs, and (for high-value contracts) a dedicated formal-methods engagement.

## Using the workspace

1. Open **Contract Testing** (sidebar → Testing, or `/contractTesting`).
2. Paste Soroban Rust source, upload a `.rs` file, or load one of the bundled samples (a token contract, a counter, and a deliberately flawed escrow contract that demonstrates the access-control and reentrancy-shaped findings).
3. Click **Analyze contract**. Results appear across Overview, Findings, Generated Tests, Coverage & Mutation, Formal Verification, and CI Integration tabs.
4. Download the generated `.rs` test file, the CI workflow YAML, or the full JSON report from the relevant tab.

## API (optional microservice)

- `GET /health` — liveness
- `GET /metrics` — Prometheus counters
- `POST /v1/contract-testing/analyze` — body `{ source: string, contractName?: string }`, returns the same `AnalysisResult` shape as the browser engine

Set `CONTRACT_TESTING_API_KEY` for bearer authentication and `CONTRACT_TESTING_ALLOWED_ORIGINS` to an explicit comma-separated allowlist. The service caps request bodies at 512 KB, rate-limits clients (60 requests/minute/IP by default), and returns safe, non-leaking error payloads.

## CI/CD integration

The **CI Integration** tab generates a ready-to-commit GitHub Actions workflow (`ciWorkflowGenerator.ts`) that installs the Soroban CLI, builds the contract for `wasm32-unknown-unknown`, runs `cargo test --workspace` (your completed generated tests plus any existing ones), and runs `cargo-mutants` as a non-blocking advisory step with its report uploaded as a build artifact. Commit the downloaded file to `.github/workflows/` in the contract's own repository — this is the literal CI/CD deliverable, not a simulation of one.

## Privacy and security

Contract source is analyzed either fully client-side (default) or sent to a self-hosted service you control (only when `VITE_CONTRACT_TESTING_API_URL` is configured) — it is never sent to a third party by this feature. Run history is stored only in `localStorage` in the visiting browser; nothing is transmitted elsewhere. The service does not log request bodies and returns generic error messages so internal paths/stack traces are never leaked to clients.

## Known limitations

- Regex/brace-based parsing can misparse unusual macro usage, multi-arm `impl` blocks split across files, or heavily macro-generated contracts.
- Findings and invariants are heuristic; both false positives (flagging safe code) and false negatives (missing a real bug) are possible.
- Coverage and mutation numbers are estimates derived from test *generation*, not execution — always confirm with real tool runs before treating a number as a merge gate.
- The bundled samples and generated tests are scaffolding for a human to complete, not a finished, audit-ready test suite.
