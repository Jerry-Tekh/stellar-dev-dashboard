import React, { useState } from 'react';
import type { AnswerResponse } from '../../types/documentAnalysis';

const SUGGESTED_QUESTIONS = [
  'What is a trustline?',
  'How do I deploy a contract?',
  'payment error trustline missing',
  'Show me a code example',
];

interface AskPanelProps {
  onAsk: (_question: string) => void;
  answer: AnswerResponse | null;
  processing: boolean;
}

export default function AskPanel({ onAsk, answer, processing }: AskPanelProps) {
  const [question, setQuestion] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!question.trim() || processing) return;
    onAsk(question.trim());
  };

  return (
    <div className="doc-grid">
      <form className="doc-form doc-card" onSubmit={submit} aria-label="Ask the documentation">
        <h2>Ask a technical question</h2>
        <p className="doc-muted">
          Answers are extracted from ingested documents and always include citations.
        </p>
        <label>
          Question
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. What does a payment require for issued assets?"
            maxLength={300}
          />
        </label>
        <div className="doc-actions">
          <button type="submit" disabled={processing || !question.trim()}>
            Ask
          </button>
          {SUGGESTED_QUESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setQuestion(suggestion);
                onAsk(suggestion);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </form>
      {answer && (
        <article className="doc-card" aria-live="polite">
          <span>Answer · {answer.questionType.replace('-', ' ')}</span>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>{answer.answer}</p>
          <div className="doc-actions" style={{ alignItems: 'center' }}>
            <span className="doc-muted">Confidence</span>
            <span
              className="doc-confidence"
              role="meter"
              aria-valuenow={Math.round(answer.confidence * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Answer confidence ${Math.round(answer.confidence * 100)} percent`}
              style={{ flex: '0 1 220px' }}
            >
              <i style={{ width: `${Math.round(answer.confidence * 100)}%` }} />
            </span>
            <strong>{Math.round(answer.confidence * 100)}%</strong>
          </div>
          {answer.relatedConcepts.length > 0 && (
            <>
              <h3>Related concepts</h3>
              <div>
                {answer.relatedConcepts.map((concept) => (
                  <span key={concept} className="doc-chip">
                    {concept}
                  </span>
                ))}
              </div>
            </>
          )}
          {answer.codeExamples && answer.codeExamples.length > 0 && (
            <>
              <h3>Code examples</h3>
              {answer.codeExamples.map((example) => (
                <pre key={example.id} className="doc-pre">
                  <code>{example.code}</code>
                </pre>
              ))}
            </>
          )}
          <h3>Sources ({answer.citations.length})</h3>
          {answer.citations.length ? (
            <ul>
              {answer.citations.map((citation, index) => (
                <li key={`${citation.documentId}:${citation.sectionId ?? index}`}>
                  <strong>{citation.documentTitle}</strong>
                  {citation.heading ? ` — ${citation.heading}` : ''}
                  {citation.url && (
                    <>
                      {' '}
                      <a href={citation.url} target="_blank" rel="noreferrer noopener">
                        open source
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="doc-muted">No sources matched this question.</p>
          )}
        </article>
      )}
    </div>
  );
}
