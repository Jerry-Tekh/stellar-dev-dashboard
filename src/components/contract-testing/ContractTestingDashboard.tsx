import React, { useCallback, useRef, useState } from 'react';
import useContractTesting from '../../hooks/useContractTesting';
import FindingsPanel from './FindingsPanel';
import TestSuitePanel from './TestSuitePanel';
import CoverageMutationPanel from './CoverageMutationPanel';
import VerificationPanel from './VerificationPanel';
import CiIntegrationPanel from './CiIntegrationPanel';
import HistoryPanel from './HistoryPanel';
import { buttonStyle, cardStyle, mutedStyle, pageStyle, primaryButtonStyle } from './styles';

type View = 'overview' | 'findings' | 'tests' | 'coverage' | 'verification' | 'ci' | 'history';
const VIEWS: View[] = ['overview', 'findings', 'tests', 'coverage', 'verification', 'ci', 'history'];
const VIEW_LABEL: Record<View, string> = {
  overview: 'Overview',
  findings: 'Findings',
  tests: 'Generated Tests',
  coverage: 'Coverage & Mutation',
  verification: 'Formal Verification',
  ci: 'CI Integration',
  history: 'History',
};

function InputPanel({
  source,
  setSource,
  contractName,
  setContractName,
  onAnalyze,
  onFile,
  onSample,
  samples,
  loading,
}: {
  source: string;
  setSource: (_value: string) => void;
  contractName: string;
  setContractName: (_value: string) => void;
  onAnalyze: () => void;
  onFile: (_file: File) => void;
  onSample: (_id: string) => void;
  samples: { id: string; label: string; description: string }[];
  loading: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0 }}>Contract source</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {samples.map((sample) => (
            <button key={sample.id} style={buttonStyle} onClick={() => onSample(sample.id)} title={sample.description}>
              {sample.label}
            </button>
          ))}
        </div>
      </div>
      <label htmlFor="contract-testing-name" style={{ ...mutedStyle, display: 'block', marginTop: '12px' }}>
        Contract name (optional override)
      </label>
      <input
        id="contract-testing-name"
        type="text"
        value={contractName}
        onChange={(event) => setContractName(event.target.value)}
        placeholder="Detected automatically from #[contract]"
        style={{
          width: '100%',
          marginTop: '4px',
          marginBottom: '8px',
          padding: '8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
        }}
      />
      <label htmlFor="contract-testing-source" style={mutedStyle}>
        Paste Soroban Rust source, or upload a .rs file
      </label>
      <textarea
        id="contract-testing-source"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        rows={12}
        placeholder="#[contract]&#10;pub struct MyContract;&#10;&#10;#[contractimpl]&#10;impl MyContract {&#10;    pub fn hello(env: Env) -> Symbol { ... }&#10;}"
        style={{
          width: '100%',
          marginTop: '4px',
          padding: '10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '12px',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".rs,text/x-rust,text/plain"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
              event.target.value = '';
            }}
          />
          <button style={buttonStyle} onClick={() => fileInputRef.current?.click()}>
            Upload .rs file
          </button>
        </div>
        <button style={primaryButtonStyle} onClick={onAnalyze} disabled={loading}>
          {loading ? 'Analyzing…' : 'Analyze contract'}
        </button>
      </div>
    </div>
  );
}

export default function ContractTestingDashboard() {
  const state = useContractTesting();
  const [view, setView] = useState<View>('overview');

  const handleAnalyze = useCallback(() => {
    setView('overview');
    void state.runAnalysis();
  }, [state]);

  const copyWorkflow = useCallback(() => {
    if (state.result) void navigator.clipboard?.writeText(state.result.ciWorkflowYaml);
  }, [state.result]);

  return (
    <main style={pageStyle}>
      <header>
        <div style={mutedStyle}>SOROBAN CONTRACT TOOLING</div>
        <h1 style={{ margin: '4px 0' }}>Contract Testing &amp; Verification</h1>
        <p style={mutedStyle}>
          Paste a Soroban contract to get a generated test suite, static/security findings, coverage and mutation
          estimates, a heuristic formal-verification report, and a downloadable CI workflow.
        </p>
      </header>

      <InputPanel
        source={state.source}
        setSource={state.setSource}
        contractName={state.contractName}
        setContractName={state.setContractName}
        onAnalyze={handleAnalyze}
        onFile={state.loadFromFile}
        onSample={state.loadSample}
        samples={state.samples}
        loading={state.loading}
      />

      {state.error && (
        <div style={{ ...cardStyle, borderColor: 'var(--red)' }} role="alert">
          <strong style={{ color: 'var(--red)' }}>Analysis failed</strong>
          <p>{state.error.message}</p>
          {state.error.retryable && (
            <button style={buttonStyle} onClick={handleAnalyze}>
              Retry
            </button>
          )}
        </div>
      )}

      {state.loading && !state.result && (
        <div style={cardStyle} aria-busy="true">
          <p>Parsing contract, running static analysis, and generating tests…</p>
        </div>
      )}

      {!state.loading && !state.error && !state.result && (
        <div style={cardStyle}>
          <p style={mutedStyle}>
            No analysis yet. Paste a contract above, load a sample, or upload a .rs file, then click{' '}
            <strong>Analyze contract</strong>.
          </p>
        </div>
      )}

      {state.result && (
        <>
          {state.result.state !== 'live' && (
            <div style={{ ...cardStyle, borderColor: 'var(--amber)' }} role="status">
              <strong style={{ color: 'var(--amber)' }}>
                {state.result.state === 'degraded' ? 'DEGRADED' : 'LOCAL ANALYSIS'}:
              </strong>{' '}
              {state.result.state === 'degraded'
                ? 'The remote analyzer is unavailable, so results were generated locally from your actual source.'
                : 'Results were generated in this browser and no contract source was uploaded.'}
            </div>
          )}
          <nav aria-label="Contract analysis views" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {VIEWS.map((item) => (
              <button
                key={item}
                aria-current={view === item ? 'page' : undefined}
                style={view === item ? primaryButtonStyle : buttonStyle}
                onClick={() => setView(item)}
              >
                {VIEW_LABEL[item]}
                {item === 'findings' && state.result!.findings.length ? ` (${state.result!.findings.length})` : ''}
              </button>
            ))}
            <button style={buttonStyle} onClick={state.downloadReport}>
              Export JSON report
            </button>
          </nav>

          {view === 'overview' && <OverviewPanel result={state.result} />}
          {view === 'findings' && <FindingsPanel findings={state.result.findings} />}
          {view === 'tests' && <TestSuitePanel suite={state.result.testSuite} onDownload={state.downloadTestSuite} />}
          {view === 'coverage' && <CoverageMutationPanel coverage={state.result.coverage} mutation={state.result.mutation} />}
          {view === 'verification' && <VerificationPanel verification={state.result.verification} />}
          {view === 'ci' && <CiIntegrationPanel workflowYaml={state.result.ciWorkflowYaml} onDownload={state.downloadCiWorkflow} onCopy={copyWorkflow} />}
          {view === 'history' && <HistoryPanel history={state.history} />}

          <footer style={mutedStyle}>
            Generated {new Date(state.result.generatedAt).toLocaleString()} · Request {state.result.requestId.slice(0, 12)} ·{' '}
            {state.result.durationMs}ms
          </footer>
        </>
      )}
    </main>
  );
}

function OverviewPanel({ result }: { result: NonNullable<ReturnType<typeof useContractTesting>['result']> }) {
  const critical = result.findings.filter((f) => f.severity === 'critical').length;
  const high = result.findings.filter((f) => f.severity === 'high').length;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div style={cardStyle}>
          <div style={mutedStyle}>Contract</div>
          <strong style={{ fontSize: '20px' }}>{result.contract.contractName}</strong>
          <div style={mutedStyle}>{result.contract.functions.length} functions · {result.contract.lineCount} lines</div>
        </div>
        <div style={cardStyle}>
          <div style={mutedStyle}>Findings</div>
          <strong style={{ fontSize: '28px', color: critical ? 'var(--red)' : high ? 'var(--amber)' : 'var(--text-primary)' }}>
            {result.findings.length}
          </strong>
          <div style={mutedStyle}>
            {critical} critical · {high} high
          </div>
        </div>
        <div style={cardStyle}>
          <div style={mutedStyle}>Estimated path coverage</div>
          <strong style={{ fontSize: '28px' }}>{result.coverage.estimatedPathCoveragePct}%</strong>
        </div>
        <div style={cardStyle}>
          <div style={mutedStyle}>Estimated mutation score</div>
          <strong style={{ fontSize: '28px' }}>{result.mutation.estimatedMutationScorePct}%</strong>
        </div>
        <div style={cardStyle}>
          <div style={mutedStyle}>Generated tests</div>
          <strong style={{ fontSize: '28px' }}>{result.testSuite.totalTestCases}</strong>
        </div>
        <div style={cardStyle}>
          <div style={mutedStyle}>Verification obligations</div>
          <strong style={{ fontSize: '28px' }}>{result.verification.obligations.length}</strong>
          <div style={mutedStyle}>
            {result.verification.passCount} pass · {result.verification.failCount} fail · {result.verification.needsReviewCount} review
          </div>
        </div>
      </div>
      <div style={cardStyle}>
        <h2>Detected functions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {result.contract.functions.map((fn) => (
            <div key={fn.name} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
              <code>
                {fn.name}({fn.params.map((p) => `${p.name}: ${p.type}`).join(', ')})
                {fn.returnType ? ` -> ${fn.returnType}` : ''}
              </code>
              <span style={mutedStyle}>
                {fn.mutatesState ? 'mutates state' : 'read-only'} · {fn.hasAuthCheck ? 'auth-checked' : 'no auth check'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
