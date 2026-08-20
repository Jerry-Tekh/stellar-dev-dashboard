# Stellar Market Sentiment Intelligence

## Purpose

Market Sentiment Intelligence combines social, editorial, research, on-chain, and market observations into explainable ecosystem indicators. It is decision support—not financial advice—and never treats popularity as truth.

## Architecture

The feature has four boundaries: typed domain contracts in `src/types/marketSentiment.ts`; deterministic, framework-independent analysis in `src/lib/marketSentiment`; lifecycle and resilience in `useMarketSentiment`; and the lazy-loaded `/marketSentiment` workspace. The optional Node service in `services/sentiment-analysis` exposes collection and snapshot APIs without adding runtime dependencies.

When `VITE_SENTIMENT_API_URL` is absent, the UI intentionally loads labeled demonstration data. Live collection requires a deployed service and licensed/authorized upstream connectors. Never scrape private communities or circumvent platform terms. Discord and Telegram collection must be bot-based, consented, and restricted to approved channels.

## Analysis methodology

1. Validate source, language, timestamps, identifiers, and bounded content length.
2. Normalize Unicode and remove exact/near duplicates.
3. Estimate spam and coordinated amplification from repetition, links, duplication, publisher quality, and engagement patterns.
4. Classify sentiment and confidence, then extract Stellar entities and aspects (price, network, ecosystem, DeFi, payments, regulation).
5. Weight observations by model confidence, bounded influence, and source credibility. No single influencer can dominate the composite.
6. Compare the latest observation with a rolling baseline. Emit alerts only when absolute movement or standardized deviation exceeds the configured threshold.
7. Compute lagged Pearson correlation against aligned market observations. Correlation does not imply causation.
8. Publish forecast direction, probability, confidence, model version, drivers, and disclaimer together.

The bundled multilingual lexicons cover signals in English, Spanish, French, German, Portuguese, Chinese, Japanese, Korean, and Arabic and accept arbitrary BCP-47 language tags. Production coverage for 20+ languages requires reviewed language-specific transformer models, calibration sets, and human escalation. Unsupported-language lexicon output must remain confidence-limited.

## Model evaluation

The issue's 75% price-direction target is not proven by fixtures. Evaluate using time-ordered, out-of-sample data to prevent look-ahead leakage. Freeze a prediction at each observation time, score direction at the declared 24-hour horizon, compare against majority-class and last-movement baselines, and report balanced accuracy, precision/recall, calibration error, language/source slices, confidence intervals, and drift. Statistical significance should use sufficient independent observations and pre-declared thresholds.

## API

- `GET /healthz` — liveness
- `GET /metrics` — Prometheus counters
- `GET /v1/sentiment/:network/snapshot` — aggregate intelligence
- `POST /v1/sentiment/batch` — validate and ingest 1–10,000 documents

Set `SENTIMENT_API_KEY` for bearer authentication and `SENTIMENT_ALLOWED_ORIGINS` to an explicit comma-separated allowlist. The service caps request bodies at 5 MB, rate-limits clients, validates every document, and returns safe errors. Do not put platform tokens or raw private community content in browser bundles, logs, or analytics.

## Scale, retention, and production deployment

The service test verifies a 10,000-document batch, supporting multiple batches beyond 100,000 posts/day. Its in-memory adapter is deliberately limited to development and is neither durable nor horizontally consistent. For two-year retention and high availability, replace it with a partitioned time-series/document store, durable queue, idempotency keys, encrypted object archive, lifecycle policies, backups, deletion workflows, and replicas across failure domains. Store source IDs and derived features where licensing prevents retention of raw text.

Monitor ingestion lag, source error rate, language distribution, duplicate/spam rate, model latency, confidence, drift, alert volume, and API saturation. Page operators when freshness approaches five minutes. Record model/data versions and audit alert transitions.

## Privacy and security

Minimize collection, pseudonymize author identifiers, never collect wallet secrets, honor deletion and retention policies, and restrict raw-text access. Treat upstream content as untrusted: render as text, prevent URL execution, cap field sizes, and isolate model workers. Rotate tokens and use a secrets manager. Review data licenses and privacy obligations for every jurisdiction and connector.

## Known limitations

Sarcasm, code-switching, coordinated campaigns, selection bias, deleted content, bots, translation ambiguity, and market regime changes reduce reliability. On-chain activity indicates behavior, not a person's emotions. Direction forecasts may fail abruptly and must not trigger autonomous trading. Demonstration fixtures validate workflows, not production accuracy, five-minute end-to-end latency, two-year durability, or statistical significance.
