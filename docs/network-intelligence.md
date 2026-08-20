# Network Intelligence architecture and operations

Network Intelligence is the operator-facing monitoring feature available at
`/networkIntelligence`. It turns recent Stellar protocol telemetry into a
multi-dimensional health assessment, predictive congestion warnings, anomaly
signals, grouped alerts, incident diagnoses, capacity scenarios, and SLO
reports.

The browser can collect directly from the selected Horizon and Soroban RPC
endpoints, so the feature remains usable in the normal dashboard deployment.
Larger installations can run the included monitoring API and point the browser
at it with `VITE_NETWORK_MONITOR_API`.

## Architecture

```text
Horizon ledgers ─────┐
Soroban getHealth ───┼─> collector/normalizer ─> rolling metric window
Validator adapter ───┘                               │
                                                    ├─> weighted health score
                                                    ├─> anomaly detector
                                                    ├─> congestion forecast
                                                    ├─> SLO evaluator
                                                    └─> alert/incident correlator
                                                              │
                         React operator dashboard <────────────┘
                         Third-party REST clients <── monitor API
```

The feature has four boundaries:

1. `src/lib/networkIntelligence/client.ts` owns collection, timeouts, retries,
   runtime response validation, caching, and fail-safe error mapping.
2. `src/lib/networkIntelligence/analysis.ts` contains deterministic analysis
   functions. It has no React or network dependencies and is straightforward to
   validate with recorded incidents.
3. `src/hooks/useNetworkIntelligence.ts` owns refresh lifecycle, cancellation,
   stale-data behavior, visibility-aware polling, preferences, and UI mutations.
4. `NetworkIntelligenceDashboard.tsx` renders the operator workflow. It does not
   calculate health or make remote requests.

The optional `services/network-monitor/server.mjs` service exposes the same
snapshot shape, a high-volume batch ingestion route, health checks, Prometheus
metrics, alerts, incidents, and capacity analysis. Its in-memory ring buffer is
intended for development and single-instance operation. Production deployments
should connect the ingestion boundary to a replicated time-series database.

## Data sources and semantics

### Horizon

The direct collector requests the latest 36 ledgers and derives:

- ledger close interval from adjacent `closed_at` values;
- transaction success rate from successful and failed counts;
- transaction and operation throughput per close interval;
- observed capacity utilization using the dashboard's 1,000-operation ledger
  reference capacity;
- ledger continuity and freshness.

No account IDs, wallet data, transaction envelopes, memos, or private keys are
collected. Only aggregate public network values are processed.

### Soroban RPC

The collector calls `getHealth` and measures endpoint response latency. The
request contains no account data or contract parameters. A failed probe is
reported as service degradation without preventing a valid Horizon snapshot
from being shown.

### Validator signals

Horizon does not expose complete validator operational telemetry. In direct
browser mode, validator rows are explicitly described as a modeled continuity
view inferred from ledger timing. They must not be interpreted as authoritative
node status. Operators can attach SCP/validator exporters at the service
ingestion boundary to replace the model with verified node-level samples.

## Analysis methodology

### Health score

The overall score is a weighted combination:

| Dimension | Weight | Inputs |
| --- | ---: | --- |
| Consensus | 30% | participation, synchronized validators, ledger lag |
| Performance | 20% | close time, transaction latency |
| Reliability | 20% | transaction success, validator uptime |
| Capacity | 15% | operation capacity utilization |
| Data consistency | 15% | cross-node ledger lag, degraded sources |

Scores from 85 through 100 are `healthy`, 60 through 84.9 are `degraded`, and
scores below 60 are `critical`. A separate confidence value reflects source
completeness; confidence is never folded into the score itself.

### Anomaly detection

The detector compares the newest value to up to 24 preceding points. A signal
must exceed both a 2.5 standard-deviation threshold and an absolute operational
guardrail. This two-part rule avoids firing on tiny changes in low-variance
series. Current detectors cover:

- ledger close latency spikes;
- validator participation drops;
- operation throughput shifts;
- validator synchronization drift;
- Horizon or Soroban RPC degradation.

Every anomaly includes observed and expected values, deviation score, source,
affected components, and human-readable evidence. Anomaly fingerprints are
deterministic, allowing repeat occurrences to be grouped rather than creating
an alert storm.

The original issue's 95% incident-detection target is a production quality KPI,
not a truthful claim that can be established from synthetic fixtures. Validate
it by replaying a labeled incident corpus and calculate recall as detected known
incidents divided by all known incidents. Tune guardrails per network only after
measuring false positives and missed events.

### Forecasting

The current model is an explainable rolling linear trend over the latest 24
capacity points. It produces 5-minute expected values plus 90% confidence bands
for the next hour. A predictive alert is generated when congestion probability
reaches 65%. Warning lead time is the first confidence-bound crossing of the
80% capacity threshold.

The implementation exposes model version, confidence, probability, lead time,
and drivers. These fields allow a future seasonal or learned model to be
introduced without changing the UI contract.

The issue's 85% congestion-accuracy and 30-minute-warning criteria must be
measured against production outcomes. Use precision, recall, Brier score, and
lead-time distribution. Do not label model output “85% accurate” merely because
the forecast confidence is 85%; those are different concepts.

### Root-cause analysis

Root-cause rules correlate independent symptoms:

- participation loss plus synchronization drift indicates likely validator
  synchronization failure;
- throughput shift plus close-time spike indicates likely capacity pressure;
- a single signal falls back to a source-specific diagnosis.

Diagnoses contain confidence, evidence, and ordered mitigation suggestions.
They are decision support, not automatic authorization to restart validators,
change quorum sets, or drop traffic. Operators remain in control.

### Capacity planning

The what-if model accepts annual traffic growth, Soroban workload growth,
unavailable validator capacity, and a safe utilization target. It projects
utilization, throughput, headroom, equivalent validator capacity, and time to
the threshold. The model clamps unsafe or nonsensical inputs and keeps its
assumptions visible in the result.

## Monitoring API

Start locally:

```bash
npm run monitor:service
```

Or run the isolated container:

```bash
docker compose --profile monitoring up network-monitor
```

Then configure the browser build:

```bash
VITE_NETWORK_MONITOR_API=http://localhost:8787 npm run dev
```

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `MONITOR_HOST` | `127.0.0.1` | Bind address |
| `MONITOR_PORT` | `8787` | HTTP port |
| `MONITOR_API_KEY` | empty | Optional bearer token for ingestion |
| `MONITOR_ALLOWED_ORIGIN` | `http://localhost:5173` | Exact CORS origin |
| `VITE_NETWORK_MONITOR_API` | empty | Browser monitoring API base URL |

Use a secret manager to provide `MONITOR_API_KEY`; never commit the value. Put
TLS and network authentication in front of the service for any non-local
deployment.

### Endpoints

#### `GET /healthz`

Returns service uptime and buffer status. It is safe for container probes.

#### `GET /metrics`

Returns Prometheus counters for requests, ingestion, rejection, and buffer size.

#### `GET /v1/networks/:network/snapshot`

Returns the complete dashboard contract:

```json
{
  "data": {
    "network": "testnet",
    "generatedAt": "2026-08-20T12:00:00.000Z",
    "health": { "score": 94, "state": "healthy" },
    "current": { "ledgerSequence": 56000035 },
    "history": [],
    "services": [],
    "validators": [],
    "forecast": {},
    "anomalies": [],
    "incidents": [],
    "alerts": [],
    "slos": []
  },
  "meta": { "requestId": "..." }
}
```

#### `POST /v1/metrics/batch`

Accepts between 1 and 10,000 normalized metric samples. When
`MONITOR_API_KEY` is configured, send `Authorization: Bearer <token>`.

```json
{
  "samples": [
    {
      "network": "testnet",
      "ledgerSequence": 56000035,
      "timestamp": "2026-08-20T12:00:00.000Z",
      "closeTimeSeconds": 5.2,
      "operationsPerSecond": 130,
      "transactionsPerSecond": 49,
      "transactionSuccessRate": 99.7,
      "transactionLatencyMs": 810,
      "capacityUtilization": 46,
      "validatorParticipation": 99.2,
      "synchronizedValidators": 6,
      "totalValidators": 6,
      "horizonLatencyMs": 120,
      "sorobanLatencyMs": 180
    }
  ]
}
```

All numeric fields are bounded and validated. Requests larger than 10 MB or
batches larger than 10,000 are rejected.

#### `GET /v1/networks/:network/alerts`

Returns alerts for third-party alert managers.

#### `GET /v1/networks/:network/incidents`

Returns incident timelines and diagnoses for reporting integrations.

#### `POST /v1/networks/:network/capacity`

Evaluates a capacity scenario:

```json
{
  "trafficGrowthPercent": 50,
  "validatorLossPercent": 10,
  "targetUtilizationPercent": 70
}
```

Every JSON response includes `X-Request-Id`. Client-generated IDs are accepted
and truncated to prevent header abuse. Errors are safe, structured, and omit
request authorization or raw payload content.

## Performance and high availability

The batch route accepts 10,000 samples in one request and avoids per-sample I/O.
This supports the required input shape, but throughput must still be load-tested
on the target infrastructure. For sustained 10,000+ metrics per second:

1. run at least two stateless collectors behind a health-checking load balancer;
2. publish validated batches to a partitioned durable queue;
3. write to a replicated time-series database using bulk inserts;
4. partition by network and metric family, not validator-provided labels;
5. pre-aggregate dashboard windows and cache snapshot responses;
6. keep anomaly processing consumers independent from ingestion workers;
7. store raw metrics for the required 730 days using tiered retention.

The in-memory buffer is capped at 100,000 samples to prevent unbounded resource
growth. It is not a substitute for two-year durable storage. A production
deployment should preserve the REST contract and replace only the persistence
adapter.

To validate the 30-second anomaly latency objective, record source timestamp,
collector receipt time, detection time, and alert dispatch time. Report p50,
p95, and p99 end-to-end delay under normal and peak ingestion load.

## Security, privacy, and reliability

- Aggregate public network metrics only. Do not attach wallet addresses, memos,
  transaction XDR, authorization headers, or user identifiers.
- Ingestion authentication uses constant-time token comparison when enabled.
- CORS is an exact configured origin, not a reflected request origin.
- The server enforces body-size, batch-size, numeric-range, and rate limits.
- Browser requests have bounded timeouts, exponential retry, cancellation, and
  a validated stale-cache fallback.
- UI errors contain a request ID for diagnostics but no endpoint credentials or
  request bodies.
- Automatic incident remediation is deliberately excluded. Suggestions require
  an operator decision.

## Operator workflow

1. Start on Overview and check score confidence and data freshness before acting.
2. Compare dimension scores to determine whether degradation is consensus,
   performance, reliability, capacity, or consistency related.
3. Open Alerts to acknowledge ownership and prevent duplicate response.
4. Use Incidents to inspect correlated evidence, the timeline, and diagnosis.
5. Apply the Capacity scenario before scaling or accepting planned validator
   maintenance.
6. Export the report JSON for handoff or post-incident review.
7. Resolve alerts after the underlying signals return to baseline.

The “Simulate incident” action is a training and verification tool. Its data is
always labeled `SIMULATION`, auto-refresh is paused, and “Return to live data”
forces a new collection.

## Testing and model validation

The unit suite covers score boundaries, statistical helpers, forecast bounds,
warning lead time, correlated anomalies, root-cause rules, alert grouping,
capacity stress, SLOs, Horizon normalization, cache behavior, stale fallback,
invalid responses, and safe error contracts.

Before changing thresholds:

1. replay at least one healthy and one incident dataset from every supported
   network class;
2. compare detections against operator-labeled incident intervals;
3. report precision and recall by anomaly kind;
4. measure detection and warning latency;
5. run capacity scenarios against observed peak days;
6. confirm alert grouping does not hide independent affected components;
7. run accessibility and browser regression tests for all dashboard views.

Never tune a detector using the same incidents used for final accuracy
reporting. Preserve a time-ordered holdout set to avoid future information
leaking into forecast evaluation.
