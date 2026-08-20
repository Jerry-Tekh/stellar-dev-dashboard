import React, { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Download,
  FlaskConical,
  Gauge,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  WifiOff,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useStore } from '../../lib/store'
import useNetworkIntelligence from '../../hooks/useNetworkIntelligence'
import type {
  CapacityPlan,
  CapacityScenario,
  HealthState,
  IntelligentAlert,
  NetworkIncident,
  Severity,
  ValidatorHealth,
} from '../../types/networkIntelligence'

type View = 'overview' | 'alerts' | 'incidents' | 'capacity' | 'validators'

const STATE_COLOR: Record<HealthState, string> = {
  healthy: 'var(--green)',
  degraded: 'var(--amber)',
  critical: 'var(--red)',
  unknown: 'var(--text-muted)',
}

const SEVERITY_COLOR: Record<Severity, string> = {
  info: 'var(--cyan)',
  warning: 'var(--amber)',
  critical: 'var(--red)',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '18px',
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '7px',
  minHeight: '36px',
  padding: '7px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: '11px',
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'unknown'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function downloadReport(snapshot: object, network: string): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `stellar-${network}-health-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(href)
}

function StatusPill({ state, label }: { state: HealthState; label?: string }) {
  const color = STATE_COLOR[state]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        border: `1px solid ${color}`,
        color,
        borderRadius: '999px',
        padding: '3px 8px',
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label ?? state}
    </span>
  )
}

function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span style={{ color: SEVERITY_COLOR[severity], fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
      {severity}
    </span>
  )
}

function Stat({
  label,
  value,
  detail,
  color = 'var(--text-primary)',
}: {
  label: string
  value: React.ReactNode
  detail?: string
  color?: string
}) {
  return (
    <div style={{ ...panelStyle, minWidth: 0 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color, fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, marginTop: 9 }}>
        {value}
      </div>
      {detail && <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: 5 }}>{detail}</div>}
    </div>
  )
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...panelStyle, minHeight: 94, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="spinner" />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Collecting network telemetry</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
            Correlating Horizon ledgers, Soroban RPC health, and validator signals…
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[0, 1, 2, 3].map((item) => (
          <div key={item} style={{ ...panelStyle, height: 112, opacity: 0.65 }} />
        ))}
      </div>
    </div>
  )
}

function ErrorState({ message, requestId, retryable, onRetry, onDemo }: {
  message: string
  requestId?: string
  retryable: boolean
  onRetry: () => void
  onDemo: () => void
}) {
  return (
    <div role="alert" style={{ ...panelStyle, borderColor: 'var(--red)', textAlign: 'center', padding: '40px 20px' }}>
      <WifiOff size={32} color="var(--red)" aria-hidden="true" />
      <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 14 }}>Monitoring sources unavailable</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '8px auto 0', maxWidth: 560 }}>{message}</p>
      {requestId && <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 8 }}>Request ID: {requestId}</p>}
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
        {retryable && <button type="button" onClick={onRetry} style={buttonStyle}><RefreshCw size={13} /> Retry</button>}
        <button type="button" onClick={onDemo} style={buttonStyle}><FlaskConical size={13} /> Explore simulated incident</button>
      </div>
    </div>
  )
}

function HealthOverview({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useNetworkIntelligence>['snapshot']> }) {
  const chartData = snapshot.history.map((point) => ({
    ...point,
    time: formatTime(point.timestamp),
  }))
  const forecastData = snapshot.forecast.points.map((point) => ({ ...point, time: formatTime(point.timestamp) }))
  const activeIncident = snapshot.incidents[0]

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Stat
          label="Network health"
          value={`${snapshot.health.score}/100`}
          detail={`${snapshot.health.confidence}% assessment confidence`}
          color={STATE_COLOR[snapshot.health.state]}
        />
        <Stat label="Ledger close" value={`${snapshot.current.closeTimeSeconds.toFixed(1)}s`} detail="Current observed interval" />
        <Stat label="Throughput" value={`${snapshot.current.operationsPerSecond.toFixed(1)} ops/s`} detail={`${snapshot.current.capacityUtilization.toFixed(1)}% utilization`} />
        <Stat
          label="Participation"
          value={`${snapshot.current.validatorParticipation.toFixed(1)}%`}
          detail={`${snapshot.current.synchronizedValidators}/${snapshot.current.totalValidators} modeled validators synchronized`}
          color={snapshot.current.validatorParticipation < 95 ? 'var(--amber)' : 'var(--green)'}
        />
      </div>

      {activeIncident && (
        <div role="status" style={{ ...panelStyle, borderColor: SEVERITY_COLOR[activeIncident.severity], display: 'flex', gap: 12 }}>
          <TriangleAlert size={22} color={SEVERITY_COLOR[activeIncident.severity]} aria-hidden="true" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <SeverityPill severity={activeIncident.severity} />
              <strong style={{ fontFamily: 'var(--font-display)' }}>{activeIncident.title}</strong>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 5 }}>{activeIncident.rootCause.summary}</p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 0.8fr)', gap: 16 }} className="network-intelligence-split">
        <section style={panelStyle} aria-labelledby="performance-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 id="performance-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>Historical performance</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 3 }}>Ledger close time and capacity utilization</p>
            </div>
            <Activity size={18} color="var(--cyan)" aria-hidden="true" />
          </div>
          {chartData.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 50 }}>No historical metrics available.</div>
          ) : (
            <div role="img" style={{ height: 270, marginTop: 14 }} aria-label="Historical network performance chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} minTickGap={32} />
                  <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 10 }} />
                  <Line yAxisId="left" type="monotone" dataKey="closeTimeSeconds" name="Close time (s)" stroke="var(--cyan)" dot={false} strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="utilization" name="Utilization (%)" stroke="var(--amber)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section style={panelStyle} aria-labelledby="dimensions-heading">
          <h2 id="dimensions-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>Health dimensions</h2>
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            {snapshot.health.dimensions.map((item) => (
              <div key={item.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                  <span>{item.label}</span>
                  <strong style={{ color: STATE_COLOR[item.state] }}>{item.score}</strong>
                </div>
                <div style={{ height: 5, borderRadius: 9, background: 'var(--bg-elevated)', overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ width: `${item.score}%`, height: '100%', background: STATE_COLOR[item.state] }} />
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 4 }}>{item.summary}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.8fr)', gap: 16 }} className="network-intelligence-split">
        <section style={panelStyle} aria-labelledby="forecast-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <h2 id="forecast-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>Congestion forecast</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 3 }}>
                {snapshot.forecast.horizonMinutes}-minute model · {snapshot.forecast.confidence}% confidence
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: snapshot.forecast.congestionProbability > 65 ? 'var(--amber)' : 'var(--green)', fontSize: 18, fontWeight: 700 }}>
                {snapshot.forecast.congestionProbability}%
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>congestion risk</div>
            </div>
          </div>
          <div role="img" style={{ height: 230, marginTop: 14 }} aria-label="Congestion utilization forecast chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} minTickGap={26} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 10 }} />
                <ReferenceLine y={80} stroke="var(--red)" strokeDasharray="4 4" label={{ value: 'capacity risk', fill: 'var(--red)', fontSize: 9 }} />
                <Area type="monotone" dataKey="upperBound" name="Upper confidence" stroke="transparent" fill="var(--amber)" fillOpacity={0.08} />
                <Area type="monotone" dataKey="expected" name="Expected utilization" stroke="var(--amber)" fill="var(--amber)" fillOpacity={0.16} strokeWidth={2} />
                <Line type="monotone" dataKey="lowerBound" name="Lower confidence" stroke="var(--text-muted)" strokeDasharray="3 3" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section style={panelStyle} aria-labelledby="services-heading">
          <h2 id="services-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>Collection sources</h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {snapshot.services.map((service) => (
              <div key={service.id} style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', borderRadius: 8, padding: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 11 }}>{service.label}</strong>
                  <StatusPill state={service.state} />
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 6 }}>
                  {service.latencyMs === null ? service.error ?? 'No response' : `${service.latencyMs}ms response`}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 9, marginTop: 13 }}>
            <span>Ingest {snapshot.collectionRate.toLocaleString()} metrics/s</span>
            <span>{snapshot.retentionDays}d retention</span>
          </div>
        </section>
      </div>

      <section style={panelStyle} aria-labelledby="slo-heading">
        <h2 id="slo-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>SLA and error budgets</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 14 }}>
          {snapshot.slos.map((slo) => (
            <div key={slo.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11 }}>{slo.name}</span>
                {slo.met ? <CheckCircle2 size={15} color="var(--green)" aria-label="SLO met" /> : <AlertTriangle size={15} color="var(--red)" aria-label="SLO missed" />}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>{slo.actual}{slo.unit === '%' ? '%' : ` ${slo.unit}`}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 3 }}>Target {slo.target}{slo.unit === '%' ? '%' : ` ${slo.unit}`} · {slo.errorBudgetRemaining}% budget remaining</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function AlertsView({ alerts, onStatus }: {
  alerts: IntelligentAlert[]
  onStatus: (_id: string, _status: IntelligentAlert['status']) => void
}) {
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const filtered = alerts.filter((alert) => filter === 'all' || alert.severity === filter)
  return (
    <section style={panelStyle} aria-labelledby="alerts-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 id="alerts-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Intelligent alerts</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 3 }}>Correlated by source, signal, and affected component</p>
        </div>
        <label style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          Severity{' '}
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} style={{ ...buttonStyle, marginLeft: 5 }}>
            <option value="all">All</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '52px 16px', color: 'var(--text-muted)' }}>
          <ShieldCheck size={30} color="var(--green)" aria-hidden="true" />
          <div style={{ marginTop: 10 }}>No alerts match this filter.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {filtered.map((alert) => (
            <article key={alert.id} style={{ border: `1px solid ${SEVERITY_COLOR[alert.severity]}`, borderRadius: 9, padding: 14, background: 'var(--bg-elevated)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <SeverityPill severity={alert.severity} />
                    <strong style={{ fontFamily: 'var(--font-display)', fontSize: 12 }}>{alert.title}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>{alert.occurrences} occurrence{alert.occurrences === 1 ? '' : 's'}</span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 7 }}>{alert.message}</p>
                  <p style={{ color: 'var(--cyan)', fontSize: 10, marginTop: 7 }}>Suggested: {alert.recommendation}</p>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 7 }}>{alert.affectedComponents.join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {alert.status === 'active' && <button type="button" style={buttonStyle} onClick={() => onStatus(alert.id, 'acknowledged')}>Acknowledge</button>}
                  {alert.status !== 'resolved' && <button type="button" style={buttonStyle} onClick={() => onStatus(alert.id, 'resolved')}>Resolve</button>}
                  {alert.status === 'resolved' && <span style={{ color: 'var(--green)', fontSize: 10 }}>Resolved</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function IncidentCard({ incident }: { incident: NetworkIncident }) {
  return (
    <article style={{ ...panelStyle, borderColor: SEVERITY_COLOR[incident.severity] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><SeverityPill severity={incident.severity} /><strong style={{ fontFamily: 'var(--font-display)' }}>{incident.title}</strong></div>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 6 }}>Started {new Date(incident.startedAt).toLocaleString()} · {incident.status}</div>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{incident.affectedServices.join(' · ')}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 0.8fr)', gap: 18, marginTop: 18 }} className="network-intelligence-split">
        <div>
          <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Incident timeline</h3>
          <ol style={{ listStyle: 'none', marginTop: 12 }}>
            {incident.timeline.map((event, index) => (
              <li key={event.id} style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 10, paddingBottom: 16, position: 'relative' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: index === incident.timeline.length - 1 ? 'var(--cyan)' : 'var(--text-muted)', marginTop: 3 }} />
                <div><strong style={{ fontSize: 10 }}>{event.title}</strong><div style={{ color: 'var(--text-secondary)', fontSize: 9, marginTop: 3 }}>{event.detail}</div><time style={{ color: 'var(--text-muted)', fontSize: 8 }}>{new Date(event.timestamp).toLocaleTimeString()}</time></div>
              </li>
            ))}
          </ol>
        </div>
        <div style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', borderRadius: 9, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3 style={{ fontSize: 11 }}>Probable root cause</h3><span style={{ color: 'var(--cyan)', fontSize: 10 }}>{incident.rootCause.confidence}% confidence</span></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 8 }}>{incident.rootCause.summary}</p>
          <h4 style={{ fontSize: 10, marginTop: 14 }}>Recommended response</h4>
          <ul style={{ paddingLeft: 16, color: 'var(--text-secondary)', fontSize: 9, marginTop: 7, display: 'grid', gap: 5 }}>
            {incident.rootCause.suggestedActions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
      </div>
    </article>
  )
}

function IncidentsView({ incidents }: { incidents: NetworkIncident[] }) {
  return incidents.length === 0 ? (
    <div style={{ ...panelStyle, textAlign: 'center', padding: 56 }}><ShieldCheck size={32} color="var(--green)" /><h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginTop: 10 }}>No active incidents</h2><p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 5 }}>Anomaly signals have not formed an incident cluster.</p></div>
  ) : <div style={{ display: 'grid', gap: 14 }}>{incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}</div>
}

function CapacityView({ initialUtilization, calculate }: {
  initialUtilization: number
  calculate: (_scenario: CapacityScenario) => CapacityPlan | null
}) {
  const [scenario, setScenario] = useState<CapacityScenario>({ trafficGrowthPercent: 35, validatorLossPercent: 10, sorobanGrowthPercent: 50, targetUtilizationPercent: 70 })
  const plan = calculate(scenario)
  const slider = (key: keyof CapacityScenario, label: string, max: number, suffix = '%') => (
    <label style={{ display: 'grid', gap: 7, fontSize: 10 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><strong style={{ color: 'var(--cyan)' }}>{scenario[key]}{suffix}</strong></span>
      <input type="range" min={0} max={max} step={5} value={scenario[key]} onChange={(event) => setScenario((current) => ({ ...current, [key]: Number(event.target.value) }))} aria-label={label} />
    </label>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.8fr) minmax(0, 1.2fr)', gap: 16 }} className="network-intelligence-split">
      <section style={panelStyle} aria-labelledby="scenario-heading">
        <SlidersHorizontal size={20} color="var(--cyan)" />
        <h2 id="scenario-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginTop: 10 }}>What-if scenario</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>Model growth, node loss, and Soroban demand against current {initialUtilization.toFixed(1)}% utilization.</p>
        <div style={{ display: 'grid', gap: 22, marginTop: 24 }}>
          {slider('trafficGrowthPercent', 'Annual traffic growth', 200)}
          {slider('sorobanGrowthPercent', 'Soroban workload growth', 300)}
          {slider('validatorLossPercent', 'Validator capacity unavailable', 50)}
          {slider('targetUtilizationPercent', 'Safe utilization target', 90)}
        </div>
      </section>
      {plan && (
        <section style={panelStyle} aria-labelledby="plan-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><h2 id="plan-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Capacity projection</h2><p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 3 }}>Deterministic stress model based on current network observations</p></div><StatusPill state={plan.risk} label={`${plan.risk} risk`} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 18 }}>
            <Stat label="Projected use" value={`${plan.projectedUtilization}%`} color={STATE_COLOR[plan.risk]} />
            <Stat label="Headroom" value={`${plan.headroomPercent}%`} color={plan.headroomPercent < 0 ? 'var(--red)' : 'var(--green)'} />
            <Stat label="Projected OPS" value={plan.projectedThroughput.toFixed(0)} />
            <Stat label="Capacity units" value={plan.requiredValidatorCapacity} detail="Validator equivalents" />
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 9, marginTop: 16, padding: 14 }}>
            <h3 style={{ fontSize: 11 }}>Resource plan</h3>
            <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 7 }}>{plan.timeToCapacityDays === null ? 'No capacity exhaustion projected under static demand.' : `${plan.timeToCapacityDays} days to the configured utilization threshold.`}</div>
            <ul style={{ paddingLeft: 18, marginTop: 10, color: 'var(--text-secondary)', fontSize: 10, display: 'grid', gap: 7 }}>{plan.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </section>
      )}
    </div>
  )
}

function ValidatorRow({ validator }: { validator: ValidatorHealth }) {
  return (
    <tr>
      <td><strong>{validator.name}</strong><div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{validator.organization}</div></td>
      <td><StatusPill state={validator.status} /></td>
      <td>{validator.participation.toFixed(2)}%</td><td>{validator.latencyMs === null ? 'offline' : `${validator.latencyMs}ms`}</td><td>{validator.ledgerLag}</td><td>{validator.uptime30d.toFixed(3)}%</td>
      <td style={{ color: validator.anomalyScore >= 2.5 ? 'var(--amber)' : 'var(--text-secondary)' }}>{validator.anomalyScore.toFixed(2)}</td>
    </tr>
  )
}

function ValidatorsView({ validators }: { validators: ValidatorHealth[] }) {
  return (
    <section style={{ ...panelStyle, overflowX: 'auto' }} aria-labelledby="validators-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><h2 id="validators-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Validator operations</h2><p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 3 }}>Modeled continuity view; attach validator telemetry to confirm node-level findings</p></div><Server size={20} color="var(--cyan)" /></div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, minWidth: 760, textAlign: 'left', fontSize: 10 }}>
        <thead><tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}><th>Validator</th><th>Status</th><th>Participation</th><th>Latency</th><th>Ledger lag</th><th>30d uptime</th><th>Anomaly</th></tr></thead>
        <tbody>{validators.map((validator) => <ValidatorRow key={validator.id} validator={validator} />)}</tbody>
      </table>
    </section>
  )
}

export default function NetworkIntelligenceDashboard() {
  const { network } = useStore()
  const monitoring = useNetworkIntelligence(network)
  const [view, setView] = useState<View>('overview')
  const severityThreshold = useMemo(() => ({ info: 1, warning: 2, critical: 3 })[monitoring.preferences.minimumSeverity], [monitoring.preferences.minimumSeverity])
  const visibleAlerts = useMemo(() => monitoring.snapshot?.alerts.filter((alert) => ({ info: 1, warning: 2, critical: 3 })[alert.severity] >= severityThreshold) ?? [], [monitoring.snapshot?.alerts, severityThreshold])

  if (monitoring.loading && !monitoring.snapshot) return <LoadingState />
  if (monitoring.error && !monitoring.snapshot) return <ErrorState message={monitoring.error.message} requestId={monitoring.error.requestId} retryable={monitoring.error.retryable} onRetry={() => void monitoring.refresh(true)} onDemo={monitoring.simulateIncident} />
  if (!monitoring.snapshot) return <ErrorState message="No network metrics were returned." retryable onRetry={() => void monitoring.refresh(true)} onDemo={monitoring.simulateIncident} />

  const snapshot = monitoring.snapshot
  const views: Array<{ id: View; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: <CircleGauge size={13} /> },
    { id: 'alerts', label: 'Alerts', icon: <BellRing size={13} />, count: visibleAlerts.filter((item) => item.status !== 'resolved').length },
    { id: 'incidents', label: 'Incidents', icon: <AlertTriangle size={13} />, count: snapshot.incidents.length },
    { id: 'capacity', label: 'Capacity', icon: <Gauge size={13} /> },
    { id: 'validators', label: 'Validators', icon: <Server size={13} /> },
  ]

  return (
    <div className="animate-in network-intelligence" style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Network Intelligence</h1>
            <StatusPill state={snapshot.health.state} />
            {monitoring.demoIncident && <span style={{ color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 999, padding: '3px 8px', fontSize: 9, fontWeight: 700 }}>SIMULATION</span>}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 5 }}>Predictive protocol health, anomaly detection, and operational guidance for {network}.</p>
          <div aria-live="polite" style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 5 }}>
            Updated {new Date(snapshot.generatedAt).toLocaleTimeString()} · {snapshot.health.dataFreshnessSeconds}s freshness
            {monitoring.usingCachedData ? ' · cached snapshot' : ''}
            {monitoring.lastRequestId ? ` · request ${monitoring.lastRequestId.slice(0, 8)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {monitoring.demoIncident
            ? <button type="button" style={buttonStyle} onClick={monitoring.exitSimulation}><ChevronRight size={13} /> Return to live data</button>
            : <button type="button" style={buttonStyle} onClick={monitoring.simulateIncident}><FlaskConical size={13} /> Simulate incident</button>}
          <button type="button" style={buttonStyle} onClick={() => downloadReport(snapshot, network)}><Download size={13} /> Report</button>
          <button type="button" style={buttonStyle} disabled={monitoring.refreshing} onClick={() => void monitoring.refresh(true)}><RefreshCw size={13} /> {monitoring.refreshing ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </header>

      {(monitoring.error || monitoring.usingCachedData) && (
        <div role="status" style={{ border: '1px solid var(--amber)', background: 'var(--amber-glow)', borderRadius: 8, color: 'var(--amber)', padding: '10px 12px', fontSize: 10 }}>
          Live collection is degraded. The last valid snapshot remains visible. {monitoring.error?.message ?? ''}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <nav aria-label="Network intelligence views" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {views.map((item) => (
            <button key={item.id} type="button" aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)} style={{ ...buttonStyle, color: view === item.id ? 'var(--cyan)' : 'var(--text-secondary)', borderColor: view === item.id ? 'var(--cyan)' : 'var(--border)', background: view === item.id ? 'var(--cyan-glow-sm)' : 'var(--bg-elevated)' }}>
              {item.icon}{item.label}{typeof item.count === 'number' && <span style={{ borderRadius: 999, background: 'var(--bg-card)', padding: '1px 5px' }}>{item.count}</span>}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <label style={{ color: 'var(--text-muted)', fontSize: 9 }}>Alerts <select aria-label="Minimum alert severity" value={monitoring.preferences.minimumSeverity} onChange={(event) => monitoring.setPreferences({ minimumSeverity: event.target.value as Severity })} style={{ ...buttonStyle, marginLeft: 4, minHeight: 30, padding: '4px 7px' }}><option value="info">Info+</option><option value="warning">Warning+</option><option value="critical">Critical</option></select></label>
          <label style={{ display: 'inline-flex', gap: 5, color: 'var(--text-muted)', fontSize: 9 }}><input type="checkbox" checked={monitoring.preferences.autoRefresh} onChange={(event) => monitoring.setPreferences({ autoRefresh: event.target.checked })} /> Auto refresh</label>
        </div>
      </div>

      {view === 'overview' && <HealthOverview snapshot={snapshot} />}
      {view === 'alerts' && <AlertsView alerts={visibleAlerts} onStatus={monitoring.changeAlertStatus} />}
      {view === 'incidents' && <IncidentsView incidents={snapshot.incidents} />}
      {view === 'capacity' && <CapacityView initialUtilization={snapshot.current.capacityUtilization} calculate={monitoring.capacityPlan} />}
      {view === 'validators' && <ValidatorsView validators={snapshot.validators} />}
    </div>
  )
}
