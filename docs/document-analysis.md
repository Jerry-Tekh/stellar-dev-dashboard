# Document Analysis & Knowledge Extraction

Methodology, architecture, and usage for the dashboard's on-device document
analysis workspace (`/docAnalysis` tab). The system ingests Stellar-related
documentation, extracts entities/relationships with a deterministic NLP
pipeline, builds a queryable knowledge graph, and answers natural-language
questions with citations.

## Architecture

Four boundaries, mirroring the network-intelligence / market-sentiment layout:

```
types/documentAnalysis.ts            domain models (string-literal unions, ISO timestamps)
lib/docAnalysis/
  ├── ontology.ts                    Stellar lexicon + entity regexes + relation patterns
  ├── extraction.ts                  PURE pipeline: sanitize → parse → NER → relations → summary
  ├── knowledgeGraph.ts              graph merge/traversal/clustering/trends/gaps/experts
  ├── searchEngine.ts                BM25 passage index + graph-expanded ranking + code search
  ├── qaEngine.ts                    question classification → retrieval → cited answers
  ├── learningPaths.ts               dependency-ordered curricula per skill level
  ├── client.ts                      orchestration, persistence, typed errors
  └── fixtures.ts                    deterministic demo corpus (13 documents)
hooks/useDocumentAnalysis.ts         lifecycle + state
components/doc-analysis/*           rendering only
```

No React in `lib/`, no business logic in components. All processing happens
on-device; no document content ever leaves the browser.

## Ingestion and extraction methodology

1. **Sanitize** — control characters stripped, content capped at 200 KB,
   Stellar secret keys (`S…`) redacted *before* any parsing.
2. **Parse** — Markdown (headings, fenced code, links/emphasis), HTML
   (script/style removed, headings mapped to sections), or plain text.
   Sections become the retrieval unit ("passages").
3. **Language detection** — Unicode script ranges (ja/zh/ko/ar) plus stopword
   frequency profiles (en/es/fr/de/pt); `unknown` when below threshold.
4. **Entity extraction** — layered:
   - deterministic regexes: accounts `G…{55}`, contracts `C…{55}`,
     transaction hashes, issued-asset codes;
   - longest-match lexicon lookup against a curated ~120-term Stellar
     ontology (operations, endpoints, components, assets, SDK artifacts).
5. **Relation extraction** — sentence-level patterns (`requires`, `part of`,
   `uses`, `supersedes`, …) resolved to known entities only; unmatched
   fragments are dropped rather than guessed.
6. **Code examples** — fenced blocks normalized to a language tag and linked
   to their host section's concepts.
7. **Recommendations** — cue-phrase detection separates security notes
   (strong cues such as *secret*, *phishing*) from best practices.
8. **Summarization** — extractive TF-IDF sentence scoring with position and
   heading bonuses; corpus statistics are computed in a first pass so
   summaries reflect the whole corpus.

## Knowledge graph

- Nodes are typed entities with mention counts, confidence, source-document
  provenance, and first/last-seen timestamps.
- Edges are typed (`relates-to`, `depends-on`, `part-of`, `example-of`,
  `documented-in`, `supersedes`), weighted by repeated observation, and carry
  provenance + observation time (temporal tracking for protocol evolution).
- Topic clusters use union-find over relationships; labels come from the
  highest-mention member, cohesion = internal weight over possible pairs.
- Trends bucket concept coverage by publication day; direction compares
  halves of the timeline.
- Knowledge gaps flag orphan concepts (no edges), thin coverage (<3
  mentions), and single-source concepts.
- Expert analysis ranks community authors by contribution volume and concept
  breadth.

## Search and question answering

- BM25 (k1=1.4, b=0.72) over section passages with an inverted index.
- **Multi-hop expansion**: query terms matching graph nodes pull in
  one-hop neighbors, boosting passages that mention related concepts.
- Answers classify intent (`what-is`, `how-to`, `troubleshooting`,
  `code-example`, `comparison`, `general`), retrieve top passages, rank
  sentences by overlap/heading/position, and return ≤3 sentences with
  confidence (normalized score + term coverage) and mandatory citations
  (`documentId`, `sectionId`, heading, URL when available).
- Troubleshooting questions boost failure-vocabulary passages; code questions
  search the extracted code-example index directly.

## Learning paths

Seed concepts per skill level are ordered topologically along `depends-on`
edges (deterministic tie-breaks), then each step cites the best-matching
document section. Users can confirm/flag steps; validation state persists
locally and is surfaced in the UI (community validation).

## Persistence and privacy

- Processed snapshots persist to IndexedDB via the shared storage layer;
  raw inputs are kept so incremental ingestion can rebuild summaries.
- Preferences live in `localStorage` under `stellar:doc-analysis:preferences`;
  fact validations under `stellar:doc-analysis:validations`.
- Secrets are redacted at ingest; ingested content is rendered as text only
  (never `dangerouslySetInnerHTML`).

## Performance notes and limits

- Everything runs lazily inside the tab chunk; zero new npm dependencies.
- Graph/search targets interactive corpora (hundreds of documents / tens of
  thousands of entities client-side). The 1M+-entity target from the issue
  requires a server-side store and is out of scope here.
- PDF ingestion is not supported (Markdown/HTML/text only).
- Extraction is lexicon/statistical, not deep-learning based; relation recall
  depends on phrasing. Accuracy on the demo corpus is covered by unit tests
  (`src/lib/docAnalysis/*.test.ts`).

## Testing

- `extraction.test.ts` — sanitization/redaction, language detection, NER,
  relations, code linking, recommendations, determinism.
- `knowledgeGraph.test.ts` — merge/provenance, edge dedupe, multi-hop
  expansion, clustering, trends, gaps, experts.
- `engines.test.ts` — BM25 relevance ordering, QA citations/confidence,
  learning-path ordering.
- `client.test.ts` — batch validation, dedupe, persistence round-trip
  (fake-indexeddb), validations.
- `DocAnalysisDashboard.test.tsx` — views, states, community validation.
