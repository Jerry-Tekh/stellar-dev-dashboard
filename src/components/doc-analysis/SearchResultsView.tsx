import React, { useMemo, useState } from 'react';
import type { DocAnalysisSnapshot } from '../../types/documentAnalysis';
import { searchCodeExamples } from '../../lib/docAnalysis/searchEngine';

interface SearchResultsViewProps {
  snapshot: DocAnalysisSnapshot;
  onSearch: (_query: string) => void;
  results: import('../../types/documentAnalysis').SearchResponse | null;
}

function HighlightedSnippet({ snippet, query }: { snippet: string; query: string }) {
  const parts = useMemo(() => {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 2);
    if (!tokens.length) return [{ text: snippet, match: false }];
    const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
    return snippet.split(pattern).map((text) => ({
      text,
      match: tokens.includes(text.toLowerCase()),
    }));
  }, [snippet, query]);
  return (
    <p className="doc-snippet">
      {parts.map((part, index) =>
        part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>
      )}
    </p>
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function SearchResultsView({ snapshot, onSearch, results }: SearchResultsViewProps) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const codeExamples = useMemo(
    () => (submittedQuery ? searchCodeExamples(snapshot.documents, submittedQuery, 3) : []),
    [snapshot, submittedQuery]
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSubmittedQuery(query.trim());
    onSearch(query.trim());
  };

  return (
    <div className="doc-grid">
      <form className="doc-form doc-card" onSubmit={submit} aria-label="Semantic documentation search">
        <h2>Semantic search</h2>
        <p className="doc-muted">
          Keyword relevance combined with knowledge-graph expansion across ingested sources.
        </p>
        <label>
          Query
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. streaming payments endpoint"
            maxLength={300}
          />
        </label>
        <div className="doc-actions">
          <button type="submit" disabled={!query.trim()}>
            Search
          </button>
        </div>
      </form>
      {results && (
        <div className="doc-list">
          <p className="doc-muted" role="status">
            {results.totalMatches} matching section{results.totalMatches === 1 ? '' : 's'} in{' '}
            {results.tookMs} ms
          </p>
          {results.results.map((result) => (
            <article key={`${result.documentId}:${result.sectionId}`} className="doc-item">
              <strong>{result.heading}</strong>{' '}
              <small className="doc-muted">in {result.documentTitle}</small>
              <HighlightedSnippet snippet={result.snippet} query={submittedQuery} />
              <div className="doc-actions" style={{ alignItems: 'center' }}>
                <span
                  className="doc-confidence"
                  role="meter"
                  aria-valuenow={Math.round(result.score * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Relevance ${Math.round(result.score * 100)} percent`}
                  style={{ flex: '0 1 160px' }}
                >
                  <i style={{ width: `${Math.round(result.score * 100)}%` }} />
                </span>
                <small className="doc-muted">{result.explanation}</small>
              </div>
              {result.matchedConcepts.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {result.matchedConcepts.map((concept) => (
                    <span key={concept} className="doc-chip">
                      {concept}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
          {!results.results.length && (
            <div className="doc-empty">
              <strong>No sections matched “{results.query}”</strong>
              <span>Try Stellar terminology such as trustline, Soroban, or Horizon.</span>
            </div>
          )}
          {codeExamples.length > 0 && (
            <div className="doc-card">
              <h2>Matching code examples</h2>
              {codeExamples.map((example) => (
                <div key={example.id}>
                  <p className="doc-muted">
                    {example.language} · {example.documentTitle}
                    {example.title ? ` — ${example.title}` : ''}
                  </p>
                  <pre className="doc-pre">
                    <code>{example.code}</code>
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
