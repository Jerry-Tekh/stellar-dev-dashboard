# Privacy-first behavior analytics

The Behavior & Personalization feature provides consent-aware usage insights without adding a third-party tracking SDK. It is available from **Tools → Personalization** and is designed as a local-first analytics boundary that can later feed a server-side aggregate pipeline without changing dashboard components.

## Architecture

The implementation is separated into four layers:

1. `types/behaviorAnalytics.ts` defines the durable event, consent, segment, recommendation, experiment, and export contracts.
2. `lib/behaviorAnalytics/privacy.ts` is the collection boundary. It allow-lists event properties, rejects sensitive Stellar identifiers, applies retention limits, and creates differential-private count aggregates.
3. `lib/behaviorAnalytics/engine.ts` contains deterministic analysis. It calculates feature usage, heuristic personas, experience and engagement levels, workflow friction, recommendations, and stable A/B assignments.
4. `lib/behaviorAnalytics/service.ts` owns consent, local persistence, event collection, subscriptions, exports, deletion, and experiment bookkeeping. React accesses it through `useBehaviorAnalytics`.

Keeping analysis functions pure makes them inexpensive, testable, and replaceable by remote ML inference later. Dashboard UI code never reads raw storage directly.

## Consent and collection

No optional event is recorded before affirmative consent. The global consent prompt offers:

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

Raw events are held in `localStorage` under a versioned key. The service retains at most 2,000 events and removes events older than 30 days whenever state is read or an event is added. A storage failure degrades to in-memory behavior and does not break the dashboard.

The Privacy & Controls view provides:

- a readable JSON export of consent, sanitized events, and experiment assignments;
- immediate erasure and consent reset;
- current storage size and expected expiration information;
- a plain-language description of the methodology.

The export deliberately excludes the internal pseudonymous visitor identifier. These controls support the access, deletion, withdrawal, and transparency expectations common to GDPR and CCPA implementations. Deployers remain responsible for their own legal review and for documenting any future server-side processing.

## Differential privacy

Aggregate counts use the Laplace mechanism with sensitivity 1 and ε=1. Noise is added only at the aggregate boundary; raw local data remains accurate so the user can understand their own behavior. If aggregates are sent to a backend in the future, use `buildPrivateAggregates` and never upload `BehaviorEvent` objects.

An epsilon of 1 is a conservative starting point, not a universal guarantee. Any backend aggregation should also enforce contribution bounds, minimum cohort sizes, rate limits, and a privacy budget across repeated queries.

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
