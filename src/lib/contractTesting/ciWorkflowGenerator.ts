/**
 * Emits a ready-to-commit GitHub Actions workflow that runs the generated
 * (and hand-completed) Soroban test suite plus optional mutation testing on
 * every push/PR touching the contract crate. This is the literal CI/CD
 * integration deliverable — the file is meant to be downloaded/copied into
 * `.github/workflows/` in the contract's own repository.
 */
export function generateCiWorkflowYaml(contractName: string, crateDir = 'contracts/' + slug(contractName)): string {
  return `name: ${contractName} contract tests

on:
  push:
    paths:
      - '${crateDir}/**'
  pull_request:
    paths:
      - '${crateDir}/**'

jobs:
  test:
    name: Build, test, and verify
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ${crateDir}
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
          override: true

      - name: Install Soroban CLI
        run: cargo install --locked soroban-cli --version ^21

      - name: Build contract (wasm32 target)
        run: soroban contract build

      - name: Run unit + property-based tests
        run: cargo test --workspace

      - name: Run mutation testing (advisory)
        continue-on-error: true
        run: |
          cargo install --locked cargo-mutants
          cargo mutants --no-shuffle --timeout-multiplier 2 -- --workspace

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutants-report
          path: ${crateDir}/mutants.out
          if-no-files-found: ignore
`;
}

function slug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
