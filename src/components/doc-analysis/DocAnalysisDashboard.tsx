import React, { useState } from 'react';
import useDocumentAnalysis from '../../hooks/useDocumentAnalysis';
import type { DocAnalysisSnapshot } from '../../types/documentAnalysis';
import AskPanel from './AskPanel';
import DocumentBrowser from './DocumentBrowser';
import InsightsPanel from './InsightsPanel';
import IngestionPanel from './IngestionPanel';
import KnowledgeGraphView from './KnowledgeGraphView';
import SearchResultsView from './SearchResultsView';

type View = 'documents' | 'graph' | 'ask' | 'search' | 'insights';

const VIEWS: View[] = ['documents', 'graph', 'ask', 'search', 'insights'];

function summaryStats(snapshot: DocAnalysisSnapshot) {
  const codeExamples = snapshot.documents.reduce(
    (sum, document) => sum + document.codeExamples.length,
    0
  );
  const recommendations = snapshot.documents.reduce(
    (sum, document) => sum + document.recommendations.length,
    0
  );
  const languages = new Set(snapshot.documents.map((document) => document.language));
  return { codeExamples, recommendations, languages: languages.size };
}

export default function DocAnalysisDashboard() {
  const state = useDocumentAnalysis();
  const [view, setView] = useState<View>('documents');

  if (state.hydrating) {
    return (
      <main className="doc-analysis" aria-busy="true">
        <div className="doc-card">
          <h1>Document Analysis</h1>
          <p className="doc-muted">Preparing the knowledge base…</p>
        </div>
      </main>
    );
  }

  if (state.error && !state.snapshot) {
    return (
      <main className="doc-analysis">
        <div className="doc-error" role="alert">
          <h1>Document analysis unavailable</h1>
          <p>{state.error.message}</p>
          <div className="doc-actions">
            <button onClick={() => void state.loadDemoCorpus()}>Load demo corpus</button>
            <button onClick={() => void state.reset()}>Start fresh</button>
          </div>
        </div>
        <IngestionPanel processing={state.processing} onIngest={(inputs) => void state.ingest(inputs)} />
      </main>
    );
  }

  if (!state.snapshot) {
    return (
      <main className="doc-analysis">
        <header className="doc-header">
          <div>
            <div className="doc-eyebrow">STELLAR KNOWLEDGE EXTRACTION</div>
            <h1>Document Analysis</h1>
            <p>
              Ingest Stellar documentation to build a knowledge graph with search and question
              answering.
            </p>
          </div>
        </header>
        <div className="doc-empty">
          <strong>No documents ingested yet</strong>
          <span>Start by loading a deterministic demo corpus or ingest your own documents.</span>
          <button onClick={() => void state.loadDemoCorpus()} disabled={state.processing}>
            {state.processing ? 'Loading…' : 'Load demo corpus'}
          </button>
        </div>
        <IngestionPanel processing={state.processing} onIngest={(inputs) => void state.ingest(inputs)} />
      </main>
    );
  }

  const snapshot = state.snapshot;
  const stats = summaryStats(snapshot);

  return (
    <main className="doc-analysis">
      <header className="doc-header">
        <div>
          <div className="doc-eyebrow">STELLAR KNOWLEDGE EXTRACTION</div>
          <h1>Document Analysis</h1>
          <p>
            NLP extraction, knowledge graph, and sourced question answering over{' '}
            {snapshot.documents.length} ingested documents.
          </p>
        </div>
        <div className="doc-actions">
          {state.usingFixtures && <span className="doc-state demo">DEMO CORPUS</span>}
          {state.storageWarning && (
            <span className="doc-state warn">PERSISTENCE UNAVAILABLE</span>
          )}
          {state.processing && <span aria-live="polite">Processing…</span>}
          <button onClick={() => void state.loadDemoCorpus()} disabled={state.processing}>
            Reload demo corpus
          </button>
          <button onClick={() => void state.reset()} disabled={state.processing}>
            Reset knowledge base
          </button>
        </div>
      </header>

      <div className="doc-kpis">
        <div className="doc-card">
          <span>Documents</span>
          <strong>{snapshot.documents.length}</strong>
          <small>{stats.languages} language{stats.languages === 1 ? '' : 's'} detected</small>
        </div>
        <div className="doc-card">
          <span>Entities</span>
          <strong>{snapshot.graph.stats.nodeCount.toLocaleString()}</strong>
          <small>{snapshot.graph.stats.conceptCount} core concepts</small>
        </div>
        <div className="doc-card">
          <span>Relationships</span>
          <strong>{snapshot.graph.stats.edgeCount.toLocaleString()}</strong>
          <small>{snapshot.graph.clusters.length} topic clusters</small>
        </div>
        <div className="doc-card">
          <span>Code examples</span>
          <strong>{stats.codeExamples}</strong>
          <small>extracted snippets</small>
        </div>
        <div className="doc-card">
          <span>Guidance notes</span>
          <strong>{stats.recommendations}</strong>
          <small>best practices & security</small>
        </div>
      </div>

      <nav className="doc-tabs" aria-label="Document analysis views">
        {VIEWS.map((item) => (
          <button
            key={item}
            aria-current={view === item ? 'page' : undefined}
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {view === 'documents' && (
        <div className="doc-grid wide">
          <DocumentBrowser documents={snapshot.documents} />
          <IngestionPanel
            processing={state.processing}
            onIngest={(inputs) => void state.ingest(inputs)}
          />
        </div>
      )}
      {view === 'graph' && <KnowledgeGraphView snapshot={snapshot.graph} />}
      {view === 'ask' && (
        <AskPanel
          answer={state.lastAnswer}
          processing={state.processing}
          onAsk={(question) => state.ask(question)}
        />
      )}
      {view === 'search' && (
        <SearchResultsView
          snapshot={snapshot}
          results={state.lastSearch}
          onSearch={(query) => state.runSearch(query)}
        />
      )}
      {view === 'insights' && (
        <InsightsPanel
          snapshot={snapshot}
          validations={state.validations}
          onValidateFact={state.validateFact}
        />
      )}

      <footer>
        <small className="doc-muted">
          Generated {new Date(snapshot.generatedAt).toLocaleString()} · Methodology{' '}
          {snapshot.methodologyVersion} · All processing happens on-device
        </small>
      </footer>
    </main>
  );
}
