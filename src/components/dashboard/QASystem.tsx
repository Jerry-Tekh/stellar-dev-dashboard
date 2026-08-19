import React, { useState } from 'react';
import { useQASystem } from '../../hooks/useQASystem';
import { StatCard } from './Card';
import type { TestRun, FlakyTest, SelfHealingLog, GeneratedTestSuite, HighRiskArea, CoverageGap } from '../../lib/qa';

type PanelId = 'overview' | 'generator' | 'runs' | 'risks' | 'flaky';

export default function QASystem() {
  const {
    loading,
    error,
    isOfflineMode,
    stats,
    runs,
    flakyTests,
    selfHealingLogs,
    triggerRun,
    updateFlakyStatus,
    generateTests,
    fetchLogs,
    refresh
  } = useQASystem();

  const [activePanel, setActivePanel] = useState<PanelId>('overview');
  const [selectedFile, setSelectedFile] = useState('src/lib/stellar.ts');
  const [generating, setGenerating] = useState(false);
  const [generatedSuite, setGeneratedSuite] = useState<GeneratedTestSuite | null>(null);
  const [activeLogRunId, setActiveLogRunId] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratedSuite(null);
    try {
      const result = await generateTests(selectedFile);
      setGeneratedSuite(result);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleViewLogs = async (runId: string) => {
    setActiveLogRunId(runId);
    setLoadingLogs(true);
    setRunLogs('');
    try {
      const logs = await fetchLogs(runId);
      setRunLogs(logs);
    } catch (err) {
      setRunLogs('Failed to load logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Test suite code copied to clipboard!');
  };

  if (loading && !stats) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div className="spinner" style={{ marginBottom: '12px' }}>✦</div>
        Loading QA Automation Suite…
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ color: 'var(--red)', marginBottom: '12px' }}>{error}</div>
        <button
          onClick={refresh}
          style={{
            padding: '8px 16px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const panels: { id: PanelId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'generator', label: 'AI Test Generator' },
    { id: 'runs', label: 'Test Runs' },
    { id: 'risks', label: 'Gaps & Risks' },
    { id: 'flaky', label: 'Flaky & Self-Healing' }
  ];

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>AI Testing & QA Automation</span>
            <span
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '999px',
                background: isOfflineMode ? 'var(--amber-dim, rgba(217, 119, 6, 0.15))' : 'var(--cyan-glow-sm)',
                border: `1px solid ${isOfflineMode ? 'var(--amber)' : 'var(--cyan)'}`,
                color: isOfflineMode ? 'var(--amber)' : 'var(--cyan)',
                textTransform: 'uppercase',
                fontWeight: 600,
                letterSpacing: '0.5px'
              }}
            >
              {isOfflineMode ? 'Offline Fallback' : 'Service Connected'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Intelligent QA coverage optimizer, ML-based flake prevention, and self-healing UI test pipelines
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => void triggerRun('manual')}
            style={{
              background: 'var(--cyan)',
              color: 'var(--bg-base)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'var(--transition)'
            }}
          >
            Launch Smart Run
          </button>
          <button
            onClick={refresh}
            style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Main Stats Row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <StatCard label="Overall Quality Score" value={`${stats.qualityScore}/100`} accent="var(--green)" />
          <StatCard label="Code Coverage" value={`${stats.overallCoverage}%`} accent="var(--cyan)" />
          <StatCard label="Active Flaky Tests" value={stats.flakySummary.total} accent="var(--amber)" />
          <StatCard label="Self-Healed Selectors" value={stats.selfHealingSummary.totalApplied} accent="var(--green)" />
          <StatCard label="Heal Confidence" value={`${(stats.selfHealingSummary.avgConfidence * 100).toFixed(0)}%`} accent="var(--cyan)" />
        </div>
      )}

      {/* Navigation Panels */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        {panels.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePanel(p.id)}
            style={{
              border: `1px solid ${activePanel === p.id ? 'var(--cyan)' : 'transparent'}`,
              background: activePanel === p.id ? 'var(--cyan-glow)' : 'transparent',
              color: activePanel === p.id ? 'var(--cyan)' : 'var(--text-secondary)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activePanel === p.id ? 600 : 400,
              cursor: 'pointer',
              transition: 'var(--transition)'
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Panel Renderings */}
      {activePanel === 'overview' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'stretch' }}>
          {/* Coverage Breakdown */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Coverage Type Analysis</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
              {Object.entries(stats.coverageByType).map(([type, val]: [string, any]) => (
                <div key={type}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', textTransform: 'capitalize', marginBottom: '4px' }}>
                    <span>{type} tests</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{val}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${val}%`, height: '100%', background: 'var(--cyan)', borderRadius: '3px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats list */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600 }}>QA Engine Metrics</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px', marginTop: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Automated Runs (24h)</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{runs.length} runs</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Average E2E Execution Time</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>~7.2 min</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Regression Prevention Rate</span>
                <span style={{ fontWeight: 600, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>98.2%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Technical Debt Backlog</span>
                <span style={{ fontWeight: 600, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>Low</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activePanel === 'generator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Generate AI-Powered Tests</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '220px',
                  padding: '8px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-sm)',
                  outline: 'none',
                  fontSize: '13px'
                }}
              >
                <option value="src/lib/stellar.ts">src/lib/stellar.ts (Horizon / SDK client)</option>
                <option value="src/components/dashboard/BridgeMonitor.tsx">src/components/dashboard/BridgeMonitor.tsx (React UI)</option>
                <option value="src/components/dashboard/TransactionBuilder.tsx">src/components/dashboard/TransactionBuilder.tsx (Forms / XDR)</option>
              </select>
              <button
                disabled={generating}
                onClick={handleGenerate}
                style={{
                  background: 'var(--cyan)',
                  color: 'var(--bg-base)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {generating ? 'Analyzing & Writing...' : 'Generate test suite'}
              </button>
            </div>
          </div>

          {generatedSuite && (
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>AI Test Suite Generated Successfully</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Est. Coverage Boost: <span style={{ color: 'var(--green)', fontWeight: 600 }}>+{generatedSuite.estimatedCoverageGain}%</span> · Total Test Cases: {generatedSuite.totalTestCases}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const allCode = generatedSuite.modules.map(m => m.testCases.map(tc => tc.code).join('\n\n')).join('\n\n');
                    copyToClipboard(allCode);
                  }}
                  style={{
                    border: '1px solid var(--cyan)',
                    background: 'transparent',
                    color: 'var(--cyan)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 10px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Copy Full Suite
                </button>
              </div>

              {generatedSuite.modules.map((mod) => (
                <div key={mod.functionName} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cyan)' }}>Function/Component: {mod.functionName}()</div>
                  {mod.testCases.map((tc, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>{tc.name}</div>
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            background: 'var(--bg-hover)',
                            borderRadius: '999px',
                            color: 'var(--text-muted)'
                          }}
                        >
                          {tc.type} · +{tc.estimatedCoverageGain}% cov
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: '8px' }}>
                        {tc.description}
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: '8px',
                          background: 'var(--bg-hover)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '10px',
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-mono)',
                          overflowX: 'auto',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <code>{tc.code}</code>
                      </pre>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activePanel === 'runs' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'flex-start' }}>
          {/* Runs list */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Run History</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {runs.map((run) => (
                <div
                  key={run.id}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg-elevated)',
                    border: activeLogRunId === run.id ? '1px solid var(--cyan)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleViewLogs(run.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '12px' }}>Run #{run.id}</span>
                    <span
                      style={{
                        fontSize: '9px',
                        color: run.status === 'completed' ? 'var(--green)' : 'var(--cyan)'
                      }}
                    >
                      ● {run.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)' }}>
                    <span>Trigger: {run.trigger}</span>
                    <span>Duration: {run.durationMs > 0 ? `${(run.durationMs / 1000).toFixed(1)}s` : 'running'}</span>
                  </div>
                  {run.status === 'completed' && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Passed: {run.summary.passed} / {run.summary.total}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Log viewer terminal console */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minHeight: '300px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Run Console Output</div>
            {activeLogRunId ? (
              <div
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-primary)',
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}
              >
                {loadingLogs ? (
                  <span style={{ color: 'var(--text-muted)' }}>Loading run output...</span>
                ) : (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{runLogs}</pre>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-secondary)', fontSize: '12px' }}>
                Select a run from the history to inspect console logs.
              </div>
            )}
          </div>
        </div>
      )}

      {activePanel === 'risks' && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Risk assessment areas */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>High-Risk Target Areas</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    {['File Path', 'Code Churn', 'Complexity', 'Historical Bugs', 'Risk Factor'].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.riskAssessment.highRiskAreas.map((area: HighRiskArea) => (
                    <tr key={area.path}>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)' }}>{area.path}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', textTransform: 'capitalize' }}>{area.churn}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', textTransform: 'capitalize', color: area.complexity === 'critical' ? 'var(--red)' : 'var(--text-primary)' }}>{area.complexity}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)' }}>{area.bugHistory}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--cyan)' }}>{area.riskFactor.toFixed(1)}/10</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Coverage gaps */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Identified Coverage Gaps</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    {['File Path', 'Current Coverage', 'Priority Level', 'Analysis Details'].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.coverage.gaps.map((gap: CoverageGap) => (
                    <tr key={gap.file}>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)' }}>{gap.file}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', color: 'var(--red)' }}>{gap.coverage}%</td>
                      <td style={{
                        padding: '8px 10px',
                        fontSize: '11px',
                        borderBottom: '1px solid var(--border)',
                        color: gap.risk === 'high' ? 'var(--red)' : 'var(--amber)',
                        fontWeight: 600,
                        textTransform: 'capitalize'
                      }}>
                        {gap.risk}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{gap.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activePanel === 'flaky' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Flaky tests */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Flaky Test Quarantine Log</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    {['Test Details', 'Test Suite File', 'Flake Rate', 'Quarantine Status', 'Toggle Quarantine'].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flakyTests.map((test: FlakyTest) => (
                    <tr key={test.id}>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{test.name}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{test.suite}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', color: 'var(--amber)' }}>{test.flakeRate}%</td>
                      <td style={{
                        padding: '8px 10px',
                        fontSize: '11px',
                        borderBottom: '1px solid var(--border)',
                        color: test.status === 'quarantined' ? 'var(--amber)' : 'var(--green)',
                        fontWeight: 600,
                        textTransform: 'capitalize'
                      }}>
                        {test.status}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)' }}>
                        <button
                          onClick={() => void updateFlakyStatus(test.id, test.status === 'quarantined' ? 'active' : 'quarantined')}
                          style={{
                            padding: '4px 8px',
                            background: test.status === 'quarantined' ? 'var(--green-glow, rgba(34, 197, 94, 0.15))' : 'var(--amber-dim, rgba(217, 119, 6, 0.15))',
                            border: `1px solid ${test.status === 'quarantined' ? 'var(--green)' : 'var(--amber)'}`,
                            color: test.status === 'quarantined' ? 'var(--green)' : 'var(--amber)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 600
                          }}
                        >
                          {test.status === 'quarantined' ? 'Unquarantine' : 'Quarantine'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Self-healing history log */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>AI Self-Healing Logs</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    {['Timestamp', 'Test Case ID', 'Target File', 'Broken Selector', 'Healed Selector', 'Confidence'].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selfHealingLogs.map((log: SelfHealingLog) => (
                    <tr key={log.id}>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)' }}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{log.testId}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{log.file}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{log.originalSelector}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{log.healedSelector}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--cyan)' }}>{(log.confidence * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
