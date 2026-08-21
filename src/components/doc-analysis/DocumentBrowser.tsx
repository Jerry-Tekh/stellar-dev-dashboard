import React, { useState } from 'react';
import type { ProcessedDocument } from '../../types/documentAnalysis';

interface DocumentBrowserProps {
  documents: ProcessedDocument[];
}

export default function DocumentBrowser({ documents }: DocumentBrowserProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!documents.length) {
    return (
      <div className="doc-empty">
        <strong>No documents ingested yet</strong>
        <span>Ingest a document or load the demo corpus to build the knowledge graph.</span>
      </div>
    );
  }

  return (
    <div className="doc-list">
      {documents.map((document) => {
        const expanded = expandedId === document.id;
        return (
          <article key={document.id} className="doc-item">
            <details
              open={expanded}
              onToggle={(event) => {
                if ((event.target as HTMLDetailsElement).open) setExpandedId(document.id);
              }}
            >
              <summary>
                {document.title}
                <small>
                  {document.source} · {document.language} · {document.wordCount.toLocaleString()} words
                  {document.publishedAt ? ` · ${document.publishedAt.slice(0, 10)}` : ''}
                </small>
              </summary>
              <div>
                <h3>AI summary</h3>
                {document.summary.length ? (
                  document.summary.map((sentence, index) => (
                    <p key={index} className="doc-snippet">
                      {sentence}
                    </p>
                  ))
                ) : (
                  <p className="doc-muted">Not enough content for an extractive summary.</p>
                )}
                <h3>Detected concepts</h3>
                <div>
                  {document.concepts.slice(0, 10).map((concept) => (
                    <span key={concept} className="doc-chip">
                      {concept}
                    </span>
                  ))}
                  {!document.concepts.length && <span className="doc-muted">None detected.</span>}
                </div>
                <div className="doc-grid halves">
                  <div>
                    <h3>Entities ({document.entities.length})</h3>
                    {document.entities.slice(0, 8).map((entity) => (
                      <div className="doc-trend-row" key={`${entity.type}:${entity.text}`}>
                        <span>{entity.text}</span>
                        <small className="doc-muted">
                          {entity.type} ×{entity.mentions}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3>Recommendations ({document.recommendations.length})</h3>
                    {document.recommendations.slice(0, 4).map((item, index) => (
                      <p key={index} className="doc-snippet">
                        <span className={`doc-badge`}>{item.category}</span> {item.text}
                      </p>
                    ))}
                    {!document.recommendations.length && (
                      <span className="doc-muted">No explicit guidance found.</span>
                    )}
                  </div>
                </div>
                {document.codeExamples.length > 0 && (
                  <>
                    <h3>Code examples ({document.codeExamples.length})</h3>
                    {document.codeExamples.map((example) => (
                      <pre key={example.id} className="doc-pre">
                        <code>{example.code}</code>
                      </pre>
                    ))}
                  </>
                )}
              </div>
            </details>
          </article>
        );
      })}
    </div>
  );
}
