# Fraud Detection & Prevention

## Purpose

Protect Stellar users from phishing, investment scams, account takeover, dust attacks, wash trading, and malicious fund-flow clusters. The system is decision support with explainable signals—not an autonomous blocklist that silently freezes legitimate activity.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain types | `src/types/fraud.ts` | Severity, decisions, assessments, intel, alerts, metrics |
| Analysis | `src/lib/fraudDetection/analysis.ts` | Rules, NLP memo scan, graph hops, behavioral deviation, ensemble |
| Fixtures | `src/lib/fraudDetection/fixtures.ts` | Deterministic demo traffic and labeled evaluation samples |
| Client | `src/lib/fraudDetection/client.ts` | Cache, optional remote API, degraded/offline fallback |
| Hook | `src/hooks/useFraudDetection.ts` | Loading, refresh, preferences, intel import, alert workflow |
| UI | `src/components/fraud/FraudDetectionDashboard.tsx` | Lazy `/fraudDetection` workspace |
| Service | `services/fraud-detection` | REST assess / intel / snapshot API for wallets and operators |

When `VITE_FRAUD_API_URL` is unset, the dashboard loads labeled demonstration data. Live monitoring requires deploying the Node service and wiring threat-intelligence feeds.

## Detection layers

1. **Threat intelligence** — match destinations against validated feeds (revocation supported).
2. **Deterministic rules** — dust, signer/threshold changes, investment-scam phrase patterns.
3. **Behavioral baseline** — privacy-preserving velocity and timing deviation (aggregated features only).
4. **Graph** — two-hop fund-flow adjacency to flagged clusters.
5. **NLP** — memo / communication scam and phishing phrase detection.
6. **Ensemble** — combine independent sources with a small diversity bonus; every score stays explainable.

## Prevention & response

- High-confidence intel can recommend `block` / `hold`.
- Investigation queue supports acknowledge, investigate, false-positive, and resolve.
- Education tips ship beside alerts for user awareness.
- Wallet providers can call `POST /v1/fraud/assess` before signing.

## API

- `GET /healthz` — liveness
- `GET /metrics` — Prometheus counters
- `GET /v1/fraud/:network/snapshot` — aggregate intelligence
- `POST /v1/fraud/assess` — validate and score 1–10,000 transactions
- `POST /v1/fraud/intel` — ingest threat-intelligence entries

Set `FRAUD_API_KEY` for bearer auth and `FRAUD_ALLOWED_ORIGINS` to an explicit allowlist. Bodies are capped at 5 MB.

### Local service

```bash
npm run fraud:service
# optional
VITE_FRAUD_API_URL=http://127.0.0.1:8791 npm run dev
```

## Performance targets

| Metric | Target | Notes |
| --- | --- | --- |
| Detection accuracy | ≥ 95% | Evaluated on labeled fixture set; live proof needs out-of-sample ops data |
| False positive rate | < 2% | Prefer `review` over silent blocks |
| Assessment latency | < 500 ms | Client ensemble is typically well under budget |
| Throughput | 10k+ tx/s | Service batch endpoint; horizontal scale needed in production |
| Intel corpus | 1M+ addresses | Capacity modeled; demo ships a small curated set |
| Alert UX | < 1 s | Local state updates are immediate |

## Privacy & security

- Never collect seed phrases, private keys, or raw biometric fingerprints.
- Behavioral signals use aggregated histograms only.
- Render memos as text; do not execute URLs.
- Rotate API keys; keep secrets out of browser bundles and logs.

## Known limitations

Demonstration fixtures validate workflows and explainability—not production accuracy on live Stellar traffic. Cross-wallet protection requires wallet integrations. Graph scoring here is two-hop adjacency, not a full GNN. Upstream intel freshness depends on feed operators.

## Extending

1. Add a detector in `analysis.ts` that returns `FraudSignal`s with evidence.
2. Register the rule in `FRAUD_RULES` and cover it with unit tests.
3. Extend fixtures for regression and quality-gate evaluation.
4. Mirror critical logic in `services/fraud-detection/server.mjs` for the remote API path.
