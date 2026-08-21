import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react'
import { AlertTriangle, CheckCircle2, Download, Eye, FlaskConical, RefreshCw, ShieldAlert, Upload, X } from 'lucide-react'
import useFraudDetection from '../../hooks/useFraudDetection'
import { FRAUD_RULES, sourceLabel } from '../../lib/fraudDetection'
import { useStore } from '../../lib/store'
import type { FraudAlert, FraudRiskAssessment, FraudSeverity, FraudSignal, FraudSnapshot } from '../../types/fraud'

type View = 'overview' | 'alerts' | 'network' | 'prevention' | 'education' | 'methodology'
const COLORS: Record<FraudSeverity, string> = { low: 'var(--green)', medium: 'var(--amber)', high: 'var(--orange, #f97316)', critical: 'var(--red)' }
const panel: CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18 }
const button: CSSProperties = { minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }
const short = (value: string) => value.length > 13 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value

function SeverityPill({ severity }: { severity: FraudSeverity }) {
  return <span style={{ color: COLORS[severity], border: `1px solid ${COLORS[severity]}`, borderRadius: 999, padding: '3px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{severity}</span>
}

function Stat({ label, value, detail, color = 'var(--text-primary)' }: { label: string; value: string | number; detail: string; color?: string }) {
  return <div style={panel}><div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div><div style={{ color, fontSize: 26, fontWeight: 700, margin: '8px 0 4px', fontFamily: 'var(--font-display)' }}>{value}</div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{detail}</div></div>
}

function SignalRow({ signal }: { signal: FraudSignal }) {
  return <div style={{ borderTop: '1px solid var(--border)', padding: '13px 0', display: 'grid', gap: 7 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><strong style={{ fontSize: 12, color: COLORS[signal.severity] }}>{signal.title}</strong><span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{Math.round(signal.confidence * 100)}% · +{signal.score}</span></div>
    <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{signal.explanation}</div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{signal.evidence.map((item) => <span key={item} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '3px 7px', borderRadius: 4, fontSize: 10 }}>{item}</span>)}</div>
    <span style={{ color: 'var(--cyan)', fontSize: 10 }}>{sourceLabel(signal.source)} · privacy-safe evidence</span>
  </div>
}

function AssessmentDetail({ assessment, onClose }: { assessment: FraudRiskAssessment; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [onClose])
  return <div role="dialog" aria-modal="true" aria-label="Fraud assessment details" style={{ ...panel, position: 'fixed', zIndex: 1200, right: 20, top: 80, width: 'min(500px, calc(100vw - 40px))', maxHeight: 'calc(100vh - 110px)', overflow: 'auto', boxShadow: '0 18px 45px rgba(0,0,0,.35)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}><div><div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Explainable decision</div><h2 id="assessment-title" style={{ margin: '5px 0', fontSize: 20 }}>Transaction {short(assessment.subject)}</h2></div><button ref={closeRef} type="button" aria-label="Close details" onClick={onClose} style={{ ...button, padding: 7 }}><X size={15} /></button></div>
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '15px 0' }}><div style={{ fontSize: 40, fontWeight: 700, color: COLORS[assessment.severity] }}>{assessment.score}</div><div><SeverityPill severity={assessment.severity} /><div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>Decision: <strong style={{ color: 'var(--text-primary)' }}>{assessment.decision}</strong> · {Math.round(assessment.confidence * 100)}% confidence</div></div></div>
    <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Signals contributing to this score</div>
    {assessment.signals.length ? assessment.signals.map((signal) => <SignalRow key={signal.id} signal={signal} />) : <div style={{ color: 'var(--green)', padding: '12px 0' }}>No suspicious signals found. Continue monitoring.</div>}
    <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 14 }}>Policy {assessment.modelVersion} · {assessment.latencyMs}ms · assessed {new Date(assessment.assessedAt).toLocaleString()}</div>
  </div>
}

function Overview({ snapshot, inspect }: { snapshot: FraudSnapshot; inspect: (_value: FraudRiskAssessment) => void }) {
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}><Stat label="Open alerts" value={snapshot.summary.openAlerts} detail="Needs investigation" color="var(--amber)" /><Stat label="High risk" value={snapshot.summary.highRiskCount} detail="High or critical" color="var(--red)" /><Stat label="Average risk" value={`${snapshot.summary.averageRisk}/100`} detail={`${snapshot.summary.monitoredTransactions} transactions`} /><Stat label="Blocked intel" value={snapshot.summary.blockedAddresses} detail={`${snapshot.metrics.intelAddressCount.toLocaleString()} address capacity`} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
      <div style={panel}><h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Recent risk assessments</h2>{snapshot.assessments.map((assessment) => <div key={assessment.subject} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)', padding: '12px 0' }}><div><strong style={{ fontSize: 12 }}>{short(assessment.subject)}</strong><div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>{assessment.signals[0]?.title || 'No indicators'} · {assessment.decision}</div></div><div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><span aria-label={`Risk score ${assessment.score} out of 100`} style={{ color: COLORS[assessment.severity], fontWeight: 700 }}>{assessment.score}</span><button type="button" aria-label={`Inspect ${assessment.subject}`} onClick={() => inspect(assessment)} style={{ ...button, padding: 7 }}><Eye size={14} /></button></div></div>)}</div>
      <div style={panel}><h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Detection posture</h2>{[['Detection accuracy', `${(snapshot.metrics.detectionAccuracy * 100).toFixed(1)}%`, 'Target ≥95%'], ['False positive rate', `${(snapshot.metrics.falsePositiveRate * 100).toFixed(1)}%`, 'Target <2%'], ['P95 decision latency', `${snapshot.metrics.p95LatencyMs}ms`, 'Target <500ms'], ['Alert response', `${snapshot.metrics.alertResponseMs}ms`, 'Target <1 second']].map(([label, metric, target]) => <div key={label} style={{ borderTop: '1px solid var(--border)', padding: '12px 0', display: 'flex', justifyContent: 'space-between' }}><div><strong style={{ fontSize: 11 }}>{label}</strong><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{target}</div></div><span style={{ color: 'var(--green)', fontWeight: 700 }}>{metric}</span></div>)}<p style={{ color: 'var(--text-muted)', fontSize: 10 }}>Deterministic fixtures demonstrate the evaluation pipeline; production accuracy requires representative labeled data.</p></div>
    </div>
  </>
}

function AlertsView({ snapshot, alerts, query, setQuery, inspect, update }: { snapshot: FraudSnapshot; alerts: FraudAlert[]; query: string; setQuery: (_value: string) => void; inspect: (_value: FraudRiskAssessment) => void; update: (_id: string, _status: FraudAlert['status']) => void }) {
  const rows = alerts.filter((alert) => !query || `${alert.title} ${alert.category} ${alert.status} ${alert.assessmentId}`.toLowerCase().includes(query.toLowerCase()))
  return <div style={panel}><div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}><div><h2 style={{ margin: 0, fontSize: 16 }}>Investigation queue</h2><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Evidence, recommended response, and auditable case status.</span></div><input aria-label="Filter alerts" placeholder="Filter alerts" value={query} onChange={(event) => setQuery(event.target.value)} style={{ ...button, minWidth: 220 }} /></div>
    {rows.length ? rows.map((alert) => { const assessment = snapshot.assessments.find((item) => item.subject === alert.assessmentId); return <article key={alert.id} style={{ borderTop: '1px solid var(--border)', padding: '14px 0', display: 'grid', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><SeverityPill severity={alert.severity} /><strong style={{ fontSize: 12 }}>{alert.title}</strong></div><div style={{ display: 'flex', gap: 6 }}>{alert.status === 'open' && <button type="button" onClick={() => update(alert.id, 'acknowledged')} style={{ ...button, padding: '5px 9px' }}>Acknowledge</button>}{assessment && <button type="button" onClick={() => inspect(assessment)} style={{ ...button, padding: '5px 9px' }}><Eye size={13} /> Evidence</button>}</div></div><span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{alert.summary}</span><span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{alert.recommendedAction}</span><label style={{ color: 'var(--text-muted)', fontSize: 10 }}>Case status <select aria-label={`Status for ${alert.title}`} value={alert.status} onChange={(event) => update(alert.id, event.target.value as FraudAlert['status'])} style={{ ...button, marginLeft: 8 }}>{['open', 'acknowledged', 'investigating', 'resolved', 'false-positive'].map((status) => <option key={status}>{status}</option>)}</select></label></article> }) : <div style={{ padding: 25, color: 'var(--green)' }}><CheckCircle2 size={16} /> No alerts match this filter.</div>}
  </div>
}

function NetworkView({ snapshot }: { snapshot: FraudSnapshot }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}><div style={panel}><h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Account relationship map</h2><p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Privacy-preserving fund-flow relationships; no private keys, names, or raw device fingerprints.</p>{snapshot.graph.nodes.map((node) => <div key={node.id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0', display: 'flex', justifyContent: 'space-between' }}><div><strong style={{ fontSize: 11 }}>{node.label}</strong><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{short(node.id)} · {node.kind}</div></div><SeverityPill severity={node.risk} /></div>)}</div><div style={panel}><h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Threat intelligence</h2>{snapshot.threatIntel.map((entry) => <div key={`${entry.source}:${entry.address}`} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}><SeverityPill severity={entry.confidence >= .9 ? 'critical' : 'high'} /><strong style={{ display: 'block', fontSize: 12, marginTop: 7 }}>{entry.label}</strong><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{short(entry.address)} · {Math.round(entry.confidence * 100)}% · {entry.source}</div></div>)}</div></div>
}

function ModelsView({ snapshot }: { snapshot: FraudSnapshot }) {
  return <div style={panel}><h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Models and policy coverage</h2><p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Independent candidate generators feed an explainable ensemble.</p>{snapshot.models.map((model) => <div key={model.id} style={{ borderTop: '1px solid var(--border)', padding: '14px 0', display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(3, minmax(70px, .5fr))', gap: 10 }}><div><strong style={{ fontSize: 12 }}>{model.name}</strong><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{model.version} · {model.notes}</div></div><div>{(model.accuracyEstimate * 100).toFixed(1)}%<small style={{ display: 'block', color: 'var(--text-muted)' }}>accuracy</small></div><div>{(model.falsePositiveEstimate * 100).toFixed(1)}%<small style={{ display: 'block', color: 'var(--text-muted)' }}>false positive</small></div><div>{model.latencyBudgetMs}ms<small style={{ display: 'block', color: 'var(--text-muted)' }}>budget</small></div></div>)}<h3 style={{ fontSize: 13 }}>Enabled rules</h3><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{FRAUD_RULES.map((rule) => <span key={rule.id} style={{ background: 'var(--bg-elevated)', padding: 7, fontSize: 10 }}>{rule.id} · {rule.name}</span>)}</div></div>
}

function PreventionView({ snapshot }: { snapshot: FraudSnapshot }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}><div style={panel}><h2 style={{ margin: 0, fontSize: 16 }}>Prevention workflows</h2>{snapshot.prevention.map((action) => <div key={action.id} style={{ borderTop: '1px solid var(--border)', padding: '13px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 12 }}>{action.title}</strong><SeverityPill severity={action.severity} /></div><p style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{action.description}</p><span style={{ color: action.automated ? 'var(--green)' : 'var(--amber)', fontSize: 10 }}>{action.automated ? 'AUTOMATED' : 'HUMAN REVIEW'} · {action.appliesTo}</span></div>)}</div><div style={panel}><h2 style={{ margin: 0, fontSize: 16 }}>User education</h2>{snapshot.education.map((tip) => <div key={tip.id} style={{ borderTop: '1px solid var(--border)', padding: '13px 0' }}><strong style={{ color: COLORS[tip.severity], fontSize: 12 }}>{tip.title}</strong><p style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{tip.body}</p></div>)}</div></div>
}

function EducationView({ snapshot }: { snapshot: FraudSnapshot }) {
  return <div style={panel}><h2 style={{ margin: 0, fontSize: 16 }}>User education</h2>{snapshot.education.map((tip) => <div key={tip.id} style={{ borderTop: '1px solid var(--border)', padding: '13px 0' }}><strong style={{ color: COLORS[tip.severity], fontSize: 12 }}>{tip.title}</strong><p style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{tip.body}</p></div>)}</div>
}

function MethodologyView({ snapshot }: { snapshot: FraudSnapshot }) {
  return <div style={{ display: 'grid', gap: 16 }}><div style={panel}><h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Methodology</h2><p style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Rule, behavioral, graph, NLP, and threat-intelligence signals are calibrated into an explainable ensemble. The production target is 95%+ detection accuracy with a false-positive rate below 2%.</p><ModelsView snapshot={snapshot} /></div><div style={panel}><h2 style={{ margin: 0, fontSize: 16 }}>Known limitations</h2>{snapshot.caveats.map((caveat) => <p key={caveat} style={{ color: 'var(--text-muted)', fontSize: 11 }}>{caveat}</p>)}</div></div>
}

export default function FraudDetectionDashboard() {
  const { connectedAddress, network } = useStore()
  const fraud = useFraudDetection(network, connectedAddress)
  const [view, setView] = useState<View>('overview')
  const [selected, setSelected] = useState<FraudRiskAssessment | null>(null)
  const [query, setQuery] = useState('')
  const { snapshot: currentSnapshot, meetsSeverity } = fraud
  const alerts = useMemo(() => currentSnapshot?.alerts.filter((alert) => meetsSeverity(alert.severity)) || [], [currentSnapshot, meetsSeverity])
  const exportReport = () => { if (!fraud.snapshot) return; const url = URL.createObjectURL(new Blob([JSON.stringify(fraud.snapshot, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `stellar-fraud-report-${network}.json`; anchor.click(); URL.revokeObjectURL(url) }
  const importIntel = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { fraud.importThreatIntel(JSON.parse(String(reader.result))) } catch { fraud.importThreatIntel(null) } }; reader.onerror = () => fraud.importThreatIntel(null); reader.readAsText(file); event.target.value = '' }

  if (fraud.loading && !fraud.snapshot) return <section role="status" style={panel}><RefreshCw size={16} /> Loading fraud intelligence…</section>
  if (fraud.error && !fraud.snapshot) return <section role="alert" style={{ ...panel, display: 'grid', gap: 12 }}><strong><AlertTriangle size={17} /> Fraud intelligence unavailable</strong><span>{fraud.error.message} No transaction was automatically blocked.</span>{fraud.error.retryable && <button type="button" onClick={() => void fraud.refresh(true)} style={{ ...button, width: 'fit-content' }}>Retry</button>}</section>
  const snapshot = fraud.snapshot
  if (!snapshot) return null

  return <section aria-labelledby="fraud-title" style={{ display: 'grid', gap: 16, '--text-muted': 'var(--text-secondary)' } as CSSProperties}>
    <header style={{ ...panel, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}><div><div style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>SECURITY CENTER · {network.toUpperCase()}</div><h1 id="fraud-title" style={{ margin: '6px 0', fontSize: 25 }}>Fraud detection &amp; prevention</h1><p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, maxWidth: 650 }}>Real-time, explainable analysis for phishing, account takeover, investment scams, dust attacks, and malicious networks.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={exportReport} style={button}><Download size={14} /> Export evidence</button><label style={button}><Upload size={14} /> Import intel<input aria-label="Import threat intelligence" type="file" accept="application/json" onChange={importIntel} style={{ display: 'none' }} /></label><button type="button" onClick={fraud.simulation ? fraud.exitSimulation : fraud.simulateIncident} style={button}><FlaskConical size={14} /> {fraud.simulation ? 'Exit scenario' : 'Simulate incident'}</button></div></header>
    {(snapshot.state === 'degraded' || fraud.cached) && <div role="status" style={{ ...panel, color: 'var(--text-secondary)', padding: 12 }}><AlertTriangle size={14} color="var(--amber)" /> Showing cached intelligence. Manually verify decisions until live monitoring recovers.</div>}
    {fraud.intelMessage && <div role="status" style={{ ...panel, color: fraud.intelMessage.startsWith('Import rejected') ? 'var(--red)' : 'var(--green)', padding: 12 }}>{fraud.intelMessage}</div>}
    <nav aria-label="Fraud views" style={{ display: 'flex', gap: 5, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>{(['overview', 'alerts', 'network', 'prevention', 'education', 'methodology'] as View[]).map((item) => <button type="button" key={item} aria-current={view === item ? 'page' : undefined} onClick={() => setView(item)} style={{ ...button, border: 0, borderBottom: view === item ? '2px solid var(--cyan)' : '2px solid transparent', borderRadius: 0, background: 'transparent', textTransform: 'capitalize' }}>{item}</button>)}</nav>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Last assessment: {new Date(snapshot.generatedAt).toLocaleTimeString()} · {snapshot.state}</span><div style={{ display: 'flex', gap: 8 }}><select aria-label="Minimum alert severity" value={fraud.preferences.minimumSeverity} onChange={(event) => fraud.setPreferences({ minimumSeverity: event.target.value as FraudSeverity })} style={button}>{(['low', 'medium', 'high', 'critical'] as FraudSeverity[]).map((severity) => <option key={severity} value={severity}>{severity}+ alerts</option>)}</select><button type="button" disabled={fraud.refreshing} onClick={() => void fraud.refresh(true)} style={button}><RefreshCw size={13} /> {fraud.refreshing ? 'Refreshing…' : 'Refresh'}</button></div></div>
    {view === 'overview' && <Overview snapshot={snapshot} inspect={setSelected} />}
    {view === 'alerts' && <AlertsView snapshot={snapshot} alerts={alerts} query={query} setQuery={setQuery} inspect={setSelected} update={fraud.changeAlertStatus} />}
    {view === 'network' && <NetworkView snapshot={snapshot} />}{view === 'prevention' && <PreventionView snapshot={snapshot} />}{view === 'education' && <EducationView snapshot={snapshot} />}{view === 'methodology' && <MethodologyView snapshot={snapshot} />}
    <div style={{ ...panel, padding: 12, color: 'var(--text-muted)', fontSize: 10, display: 'flex', gap: 8 }}><ShieldAlert size={14} /> {snapshot.caveats[0]} Request ID: {fraud.requestId || 'local'}.</div>
    {selected && <AssessmentDetail assessment={selected} onClose={() => setSelected(null)} />}
  </section>
}
