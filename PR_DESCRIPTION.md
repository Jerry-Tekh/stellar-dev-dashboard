# Stellar protocol and Soroban RPC compatibility matrix

## Summary

Adds an evidence-driven compatibility workspace at `/compatibility` that correlates the selected Stellar network with the dashboard's installed SDK/XDR range, Soroban RPC surface, retention, limits, saved artifacts, and maintainer decisions. Unknown future protocols, malformed evidence, and expired probes remain gated instead of being treated as compatible.

This is a cohesive feature track spanning typed domain models, deterministic services, state transitions, accessible React workflows, persistence/export contracts, tests, and operational documentation.

## Design decisions

- **Exact reviewed releases, not optimistic ranges:** matrix `2026.08.1` has explicit protocol 20–27 entries. A protocol must match an entry; protocol 28+ is a hard unreviewed state.
- **Installed SDK is separate from matrix knowledge:** the repo's `@stellar/stellar-sdk` 12.3.0 profile supports protocol/XDR 20–21. Newer matrix entries describe the upgrade required and do not enable the current build.
- **Direct evidence with expiry:** every feature result includes source, field, observed time, endpoint context, confidence, and five-minute freshness.
- **Required vs optional RPC:** missing identity, XDR, simulation, or submission support hard-gates affected workflows; missing fee/build/history enrichment produces an actionable degraded mode.
- **Service boundaries:** probe, assessment, comparison, audit, redaction, persistence, and export are independent TypeScript modules behind typed interfaces. React owns orchestration/presentation only.
- **Read-only capability probes:** invalid XDR is used to identify simulation/submission method recognition without executing a transaction.
- **Visible, expiring overrides:** target/feature-scoped decisions require author, reason, and expiry (maximum 30 days), appear in evidence/exports, and never mutate the matrix.
- **Lazy UI delivery:** compatibility JS/CSS is route-split from the main bundle.

## User experience

- Complete loading, empty, success, retry/error, degraded, contradictory, and offline states.
- Status view for protocol, SDK, RPC methods, retention/limits, feature gates, and evidence.
- Endpoint comparison for passphrase, protocol, ledger lag, retention, and method drift.
- Upgrade audit for saved envelopes, snapshots, contract artifacts, plugins, custom networks, and cached data.
- Matrix change history and maintainer override management.
- Redacted, versioned JSON report export.
- Desktop/mobile navigation entry; works without a connected account.
- Keyboard focus, semantic tables, screen-reader status, touch sizing, reduced motion, responsive layouts, and axe coverage.

## Threat model and privacy

Protected data includes endpoint identity, request-only custom headers, saved-artifact provenance, and availability of transaction workflows.

Controls:

- custom request headers never enter probe results;
- only allow-listed vendor response headers are retained;
- URLs lose credentials/query/fragment data;
- bearer tokens, secret-like fields, and Stellar secret seeds are recursively redacted;
- cache/export/import formats are size-bounded, versioned, and validated;
- forward schemas are rejected;
- every request is cancellable and time-bounded;
- comparison endpoints do not inherit primary credentials;
- passphrase/protocol contradictions block failover confidence;
- cached offline data is explicitly stale/cached evidence;
- overrides are attributed, bounded, and exported.

The probe never sends a valid executable envelope. Existing transaction, contract, plugin, network-profile, and cache records are not migrated or modified.

## Compatibility and migration

- New local keys: `stellar:compatibility:probe:v1:<target>` and `stellar:compatibility:overrides:v1`.
- Export/import schema: version 1 with strict kind discriminators.
- This is the first schema, so no data migration is required.
- Invalid/obsolete cache records are removed; future versions are rejected conservatively.
- A future schema bump must add an explicit migration or invalidate the old record.
- Rollback is isolated: revert the feature commit; optional removal of `stellar:compatibility:*` keys has no effect on other features.

## Test evidence

Feature-specific deterministic coverage includes matrix validation, old/current/future protocol behavior, missing/unknown methods, contradictory endpoints, cache expiry, malformed and forward-version documents, overrides, offline mode, timeout/cancellation, redaction, all audit categories, React rendering, WCAG 2.1 AA, E2E workflows, and a visual baseline.

Final local gate evidence, literal results, and exit statuses are recorded in `verification/compatibility-ci.md`.

- [x] `npm ci`
- [x] `npm run lint` (zero errors; repository baseline warnings remain)
- [x] `npm run format:check`
- [x] `npm run type-check`
- [x] `npm run test:coverage` (112 files / 1,025 tests)
- [x] all six service-test gates (45 tests)
- [x] `npm run build`
- [x] `.github/workflows/ci.yml` Chromium E2E gate via `npm run test:e2e:critical` (21 tests)
- [x] `npm run test:visual` (17 tests, including the new compatibility baseline)
- [x] compatibility axe WCAG 2.1 AA workflow
- [x] `npm audit --audit-level=high` (zero vulnerabilities)
- [x] bundle-size measurement (66 KiB main entry / 500 KiB budget)

## Performance impact

- Compatibility workflow is lazy-loaded as a separate route chunk.
- Probes run small requests concurrently in two bounded stages; each has cancellation and an 8-second UI timeout.
- Successful observations cache for five minutes to avoid repeated probes.
- Response size is capped at 2 MB; imports at 1 MB/1,000 records; comparisons at five endpoints; overrides at 100.
- No polling loop or service worker behavior was added.

## Known limitations

- Reported vendor limits remain `unknown` when endpoints do not expose them; the feature does not invent defaults.
- Retention is derived only when transaction/event responses expose oldest/latest ledger fields.
- The installed SDK 12.3.0 hard-gates protocol 22+ XDR workflows even though the matrix documents their required SDK lines.
- Local artifact discovery is intentionally conservative; IndexedDB/build-system inventories should use the versioned import contract.
- Browser extensions or compromised same-origin code can observe in-memory page state; custom credentials should remain in the existing session-only network mechanism.

## Documentation

See `docs/compatibility.md` for architecture, matrix maintenance, workflows, schemas, security/privacy, accessibility, testing, migration, troubleshooting, and rollback.
