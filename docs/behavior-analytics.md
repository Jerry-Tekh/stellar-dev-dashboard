# Privacy-first behavior analytics

The Behavior & Personalization feature provides consent-aware usage insights without adding a third-party tracking SDK. It is available from **Tools → Personalization** and uses a local-first analytics boundary with an optional first-party service for cross-session analysis.

## Architecture

The implementation is separated into five layers:

1. `types/behaviorAnalytics.ts` defines the durable event, consent, segment, recommendation, experiment, and export contracts.
2. `lib/behaviorAnalytics/privacy.ts` is the collection boundary. It allow-lists event properties, rejects sensitive Stellar identifiers, applies retention limits, and creates differential-private count aggregates.
3. `lib/behaviorAnalytics/engine.ts` contains deterministic analysis. It calculates feature usage, heuristic personas, experience and engagement levels, workflow friction, recommendations, and stable A/B assignments.
4. `lib/behaviorAnalytics/service.ts` owns consent, local persistence, event collection, subscriptions, exports, deletion, experiment bookkeeping, and background synchronization. React accesses it through `useBehaviorAnalytics`.
5. `services/behavior-analytics` provides the REST API, bounded batch pipeline, cross-session profiles, private aggregates, experiment reporting, feedback analysis, and operational metrics.

Keeping analysis functions pure makes them inexpensive, testable, and replaceable by remote ML inference later. Dashboard UI code never reads raw storage directly.

## Consent and collection

No optional event is recorded or transmitted before affirmative consent. The global consent prompt offers:

- **Allow & personalize:** enables coarse usage analytics and on-device recommendations.
- **Essential only:** stores the decision but collects no behavior events.

Users can independently turn personalization off while retaining their private usage dashboard. Turning usage analytics off immediately clears all raw events, experiment assignments, and rotates the pseudonymous visitor identifier.

Events use an intentionally narrow schema. Supported categories are navigation, feature use, transaction workflow outcomes, preference changes, learning progress, collaboration, and feedback. Properties must be primitive values and use one of the allow-listed keys. The sanitizer drops:

- Stellar public addresses and secret seeds;
- transaction hashes, signatures, wallet fields, and memos;
- names, email addresses, IP fields, auth tokens, and arbitrary free-form keys;
- nested objects, non-finite numbers, and long strings.

Never expand the property allow-list merely to simplify a UI integration. Add the minimum coarse category needed for analysis and add a privacy regression test.

## Retention and user rights

Raw events are held in `localStorage` under a versioned key. Both client and server retain at most 2,000 events per pseudonymous subject and remove events older than 30 days. A browser-storage or analytics-service failure degrades to local or in-memory behavior and does not break the dashboard.

The Privacy & Controls view provides:

- a readable JSON export of consent, sanitized events, and experiment assignments;
- immediate erasure and consent reset;
- current storage size and expected expiration information;
- a plain-language description of the methodology.

The export deliberately excludes the internal pseudonymous visitor identifier. These controls support the access, deletion, withdrawal, and transparency expectations common to GDPR and CCPA implementations. Deployers remain responsible for their own legal review and for documenting any future server-side processing.

## Differential privacy

Aggregate counts use the Laplace mechanism with sensitivity 1 and ε=1. Noise is added only at the aggregate boundary; raw local data remains accurate so the user can understand their own behavior. The first-party service receives only sanitized events after consent and re-sanitizes them at its trust boundary.

An epsilon of 1 is a conservative starting point, not a universal guarantee. Server aggregate endpoints require an administrator token and enforce per-subject contribution bounds. Production deployments should additionally place a gateway rate limiter in front of the service and manage a privacy budget across repeated queries.

## Analytics service

Start the complete stack with `docker compose up --build`, or run the analytics service independently:

```sh
cd services/behavior-analytics
npm ci
ANALYTICS_PSEUDONYM_SALT="$(openssl rand -hex 32)" \
ANALYTICS_ADMIN_TOKEN="$(openssl rand -hex 32)" npm start
```

Set `VITE_ANALYTICS_API_URL=http://localhost:3101` when building the dashboard to enable synchronization. When it is omitted, the dashboard explicitly operates in local-only mode.

The public subject endpoints accept `X-Analytics-Client`; the service combines it with the deployment salt and stores only its SHA-256 pseudonym. Administrators authenticate aggregate and experiment-report endpoints with `Authorization: Bearer <ANALYTICS_ADMIN_TOKEN>`.

| Method   | Endpoint                          | Purpose                                               |
| -------- | --------------------------------- | ----------------------------------------------------- |
| `POST`   | `/api/v1/consent`                 | Grant, update, or withdraw consent                    |
| `POST`   | `/api/v1/events/batch`            | Ingest up to 500 sanitized events                     |
| `GET`    | `/api/v1/profile`                 | Return cross-session segmentation and recommendations |
| `GET`    | `/api/v1/data-export`             | Exercise the user's access right                      |
| `DELETE` | `/api/v1/data`                    | Immediately erase subject data                        |
| `POST`   | `/api/v1/experiments/assign`      | Obtain a stable weighted variant                      |
| `POST`   | `/api/v1/feedback/analyze`        | Analyze feedback sentiment and coarse topics          |
| `GET`    | `/api/v1/aggregates`              | Return administrator-only DP aggregates               |
| `GET`    | `/api/v1/experiments/:id/results` | Report conversion and lift by variant                 |
| `GET`    | `/metrics`                        | Return bounded operational counters                   |

Ingestion is idempotent, validates timestamps and event types, re-sanitizes properties, and rejects batches larger than 500. Responses disable caching and do not expose internal errors.

`AnalyticsStore` supports 100,000 active subject records in a single service instance. Multi-instance deployments should implement the same boundary with a shared TTL datastore such as Redis or PostgreSQL before horizontal scaling.

## Performance validation

The included k6 profile submits 500-event batches at 20 batches per second—10,000 events/second, well above the average requirement of 1 million events/day—and exercises 100 concurrent recommendation clients. Ingestion and profile thresholds require p95 latency below 100ms:

```sh
docker compose up -d behavior-analytics
npm run load:test:analytics
```

Run load validation on production-equivalent infrastructure and attach the k6 summary to release evidence. The configured 100,000-subject capacity is exposed by `/health` for operational verification.

## Segmentation and recommendations

The current model is deterministic and explainable:

- persona scores group related features into developer, trader, validator, researcher, and explorer cohorts;
- experience considers advanced feature diversity, successful workflows, and event volume;
- engagement considers active days, event volume, and recent activity;
- friction requires repeated transaction workflow attempts and ranks incomplete outcomes;
- recommendations combine persona, experience, churn risk, undiscovered features, and friction.

This model is intentionally local and cold-start friendly. The dashboard displays the signals and confidence so users are not subject to opaque profiling. Future model versions should retain an explainable fallback and must not infer protected or financial characteristics.

## A/B testing

Experiment assignment uses a stable hash of the experiment ID and the local pseudonymous ID. Weighted variants are supported. Assignments are persisted so users do not switch variants between sessions. Exposure and conversion helpers flow through the same consent gate and sanitizer as all other events.

Experiments are disabled when personalization consent is absent. Do not encode a wallet address or account data into an experiment ID, variant, exposure, or conversion. Product owners should define a success metric and guardrail metrics before activating an experiment.

## Adding instrumentation

Use the hook at the user action boundary:

```tsx
const { track } = useBehaviorAnalytics();

track({
  type: 'transaction_workflow',
  name: 'payment_submission',
  properties: {
    workflow: 'payment',
    outcome: 'success',
    network: 'testnet',
  },
});
```

Do not pass an address, hash, amount, asset issuer, memo, error message, or other high-cardinality value. Prefer coarse durations such as `under_1s`, `1_to_5s`, and `over_5s` in `durationBucket`.

Every new event should have tests proving that expected fields remain and sensitive fields are removed. Run the full repository quality gates before merging:

```sh
npm run lint
npm run type-check
npm run format:check
npm test
npm run build
```

Because the feature changes routing and visual states, also run the navigation and accessibility Playwright suites when browser dependencies are available.
