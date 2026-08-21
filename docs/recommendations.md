# Intelligent ecosystem recommendations

The **For You** dashboard provides explainable recommendations for Stellar accounts, assets, Soroban contracts, services, and developer tools. It is available at `/recommendations`, including before an account is connected, so new users receive useful cold-start suggestions.

## Architecture

The implementation has four boundaries:

1. `src/types/recommendations.ts` defines the public request, response, preference, feedback, scoring, experiment, and telemetry contracts.
2. `src/lib/recommendations` contains the curated catalog, privacy guards, deterministic hybrid ranker, persistence, online feedback updates, and optional remote client.
3. `src/components/recommendations` and `useRecommendations` provide the production dashboard workflow with loading, empty, error, retry, local, and offline states.
4. `services/recommendation-engine` exposes the ranking contract over a dependency-free REST service with validation, CORS, rate limiting, health checks, and Prometheus metrics.

The browser always has a bounded local model. When `VITE_RECOMMENDATIONS_API_URL` is configured, it asks the service for a ranking with a 160 ms deadline. A timeout, invalid response, unavailable service, or offline browser immediately falls back to on-device results. This keeps the user-facing request below the 200 ms target in degraded conditions.

## Ranking methodology

Every candidate receives bounded scores between zero and one:

- **Content affinity** compares goal, risk, asset-symbol, and interest features to item metadata.
- **Collaborative affinity** takes the dot product of a coarse goal-derived user factor and pre-computed anonymous item/cohort factors. This is the browser-sized inference step of a matrix-factorization workflow; no other user's history is shipped to the client.
- **Quality** uses curated verification and security metadata.
- **Context** checks network availability and coarse time context.
- **Novelty** blends catalog novelty with popularity according to the user's discovery control.
- **Feedback** boosts saved or explored items and excludes explicitly dismissed items. Similar positive and negative tags influence subsequent requests, providing immediate online learning.

The weighted candidates are passed through maximal marginal relevance. Similarity across category, sector, and tags creates a diversity penalty, balancing accuracy with ecosystem discovery. Every card exposes the factors that affected its rank. Scores are discovery heuristics rather than predicted returns, endorsements, or security guarantees.

### Cold start

New users are ranked from their chosen goals, risk setting, context, curated quality, and popularity. The default `learn` goal favors verified resources. As soon as a user saves, opens, or dismisses an item, the local model incorporates that signal. New catalog items remain discoverable through their quality, goal, tag, and novelty features even without collaborative history.

### Experiments

`ecosystem-ranking-v1` has three variants:

| Variant     | Behavior                                                       |
| ----------- | -------------------------------------------------------------- |
| `relevance` | Gives content and collaborative affinity the greatest weight.  |
| `balanced`  | Balances relevance, quality, and novel discovery.              |
| `discovery` | Raises novelty while retaining quality and context guardrails. |

Assignment uses a stable hash of the experiment ID and a random browser-local pseudonymous ID. It does not use a Stellar address, IP address, or wallet identifier. Clearing recommendation data rotates the identifier and assignment. The service feedback endpoint accepts only category, action, and variant aggregates, which are enough to compare click/save/dismiss rates without item-level or user-level tracking.

## Privacy and security

Personalization is opt-in by a dedicated feature control and can be disabled independently. The current client stores only:

- a randomly generated recommendation ID;
- selected goals, risk, diversity, and discovery settings;
- at most 100 item feedback signals with timestamps.

Public keys, secret seeds, transaction IDs, balances, amounts, memos, and transaction histories are not persisted or emitted as telemetry. Asset codes may be used as ephemeral on-device features. Input sanitizers reject Stellar-shaped keys, long strings, free-form text, and unbounded collections before ranking or remote transport.

The **Clear data & reset ID** control removes feedback, rotates the local ID, clears telemetry, removes ephemeral profile features, and disables personalization. Browsers that block local storage continue with session-only defaults.

The service:

- caps request bodies at 128 KiB and feedback history at 100 items;
- rejects wallet-shaped feature values and does not reflect rejected input;
- uses an allowlist for CORS (`RECOMMENDATION_ALLOWED_ORIGINS`);
- applies per-address request limits (`RECOMMENDATION_RATE_LIMIT`);
- stores only process-local aggregate feedback counters;
- never accepts secret keys, public account keys, transaction histories, or arbitrary telemetry properties.

Deploy the service behind TLS and a trusted reverse proxy. Apply network-level concurrency and request limits at the proxy for a 100,000-client deployment. Multiple stateless instances can be horizontally scaled because ranking has no user-state dependency. Export aggregate counters to the deployment's metrics collector before restarting instances if longitudinal experiment reporting is required.

## REST API

Start locally:

```bash
npm run recommendation:service
```

Configure the dashboard:

```bash
VITE_RECOMMENDATIONS_API_URL=http://localhost:8791 npm run dev
```

Endpoints:

| Method | Path                      | Purpose                                                     |
| ------ | ------------------------- | ----------------------------------------------------------- |
| `GET`  | `/healthz`                | Readiness, model version, and catalog size                  |
| `GET`  | `/metrics`                | Prometheus request, failure, feedback, and latency counters |
| `GET`  | `/api/v1/catalog`         | Public catalog metadata without collaborative factors       |
| `POST` | `/api/v1/recommendations` | Generate up to 20 ranked, explained recommendations         |
| `POST` | `/api/v1/feedback`        | Record aggregate category/action/variant telemetry          |

Example request:

```json
{
  "profile": {
    "pseudonymousId": "rec_7e2688ad-fdbe-44ae-ae04-704f0a6b1acf",
    "interests": ["soroban", "rust"],
    "heldAssets": ["xlm"],
    "usedItems": [],
    "preferences": {
      "goals": ["build"],
      "riskTolerance": "balanced",
      "categories": ["account", "asset", "contract", "service"],
      "diversity": 0.65,
      "discovery": 0.35,
      "personalizationEnabled": true
    },
    "feedback": []
  },
  "context": { "network": "testnet", "online": true },
  "limit": 8
}
```

The response includes rank, confidence, human-readable reasons, the full score breakdown, model and experiment versions, processing duration, and cold-start state. Third parties may import the TypeScript contracts and local `generateRecommendations` function or integrate through the REST endpoint.

## Catalog maintenance

Catalog entries need a stable ID, official HTTPS URL, concise description, normalized tags and goals, risk class, popularity/quality/novelty values, collaborative cohort factors, and optional verification/security metadata. Review URLs and claims before each release. Never add secret material, personal account behavior, paid-placement boosts, or an unverified security claim.

Material scoring changes require a new model version and experiment ID. Add regression tests showing rank behavior for at least builder, investor, payment, DeFi, learner, cold-start, and feedback-driven profiles. Keep explanations derived from actual scoring factors rather than marketing copy.

## Verification

Run the repository gates plus feature-specific checks:

```bash
npm run lint
npm run type-check
npm run format:check
npm test
npm run test:recommendation-service
npm run build
npx playwright test tests/e2e/recommendations.spec.ts --project=chromium --workers=1
```

The unit suite covers determinism, ranking bounds, cold start, feedback learning, category filtering, diversity, stable experiments, validation, sanitization, persistence, subscriptions, deletion, and telemetry minimization. Service tests cover the 200 ms ranking target, API behavior, metrics, validation, and non-reflective errors. The browser suite covers public cold start, filtering, explainability, feedback updates, preferences, deletion, and methodology disclosure.

## Known limitations and safe extensions

The included item factors are curated fixtures, not a continuously trained population model. Production training should happen in a separate, access-controlled pipeline using consented, aggregated interactions and documented retention. Export only differentially private cohort factors into the catalog; do not export user embeddings. A future federated trainer can replace the current online heuristic behind the same typed boundary.

Asset discovery must not be interpreted as an undervaluation or price forecast. Price, liquidity, issuer, contract upgrade, audit, geographic anchor availability, and regulatory data change frequently and require separate live sources. The ranking deliberately does not fabricate those claims when no authoritative current data is configured.
