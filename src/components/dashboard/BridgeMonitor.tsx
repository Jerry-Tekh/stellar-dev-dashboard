import React, { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts'
import { useBridgeMonitor } from '../../hooks/useBridgeMonitor'
import { StatCard } from './Card'
import type { BridgeTransfer, SecurityAlert, RoutingSuggestion } from '../../types/bridge'

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'var(--red)'
    case 'high':
      return 'var(--amber)'
    case 'medium':
      return 'var(--cyan)'
    default:
      return 'var(--text-muted)'
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'var(--green)'
    case 'failed':
      return 'var(--red)'
    case 'relaying':
      return 'var(--cyan)'
    default:
      return 'var(--amber)'
  }
}

function TransferRow({ transfer }: { transfer: BridgeTransfer }) {
  return (
    <tr>
      <td style={cellStyle}>{transfer.id.slice(0, 16)}…</td>
      <td style={cellStyle}>{transfer.protocol}</td>
      <td style={cellStyle}>
        {transfer.sourceChain} → {transfer.destinationChain}
      </td>
      <td style={cellStyle}>
        {transfer.amountUsd.toLocaleString()} {transfer.asset}
      </td>
      <td style={{ ...cellStyle, color: statusColor(transfer.status) }}>{transfer.status}</td>
      <td style={cellStyle}>${transfer.gasCostUsd.toFixed(2)}</td>
    </tr>
  )
}

function AlertCard({ alert }: { alert: SecurityAlert }) {
  const color = severityColor(alert.severity)
  return (
    <div
      style={{
        border: `1px solid ${color}`,
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        background: 'var(--bg-elevated)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '12px', color, fontWeight: 700 }}>{alert.title}</div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {(alert.confidence * 100).toFixed(0)}% conf
        </span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
        {alert.description}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
        {alert.bridgeId} · {alert.chain} · {alert.category}
        {alert.cveId ? ` · ${alert.cveId}` : ''}
      </div>
    </div>
  )
}

function RouteCard({ route }: { route: RoutingSuggestion }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px',
        background: 'var(--bg-elevated)',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 600 }}>
        {route.sourceChain} → {route.destinationChain} ({route.asset})
      </div>
      <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '4px' }}>
        Save ~{route.savingsPct}% via {route.recommendedProtocol}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
        Est. {route.estimatedTimeSec}s · ${route.estimatedCostUsd.toFixed(2)} · {route.reason}
      </div>
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '11px',
  borderBottom: '1px solid var(--border)',
}

type TabId = 'overview' | 'transfers' | 'security' | 'routing' | 'liquidity' | 'report'

export default function BridgeMonitor() {
  const { snapshot, loading, error, apiConnected, criticalAlerts, refresh, lastRefresh } =
    useBridgeMonitor()
  const [activeSection, setActiveSection] = useState<TabId>('overview')

  if (loading && !snapshot) {
    return (
      <div className="animate-in" style={{ padding: '40px', textAlign: 'center' }}>
        Loading bridge monitor…
      </div>
    )
  }

  if (error && !snapshot) {
    return (
      <div className="animate-in" style={{ padding: '20px' }}>
        <div style={{ color: 'var(--red)' }}>{error}</div>
        <button onClick={refresh} style={{ marginTop: '12px' }}>
          Retry
        </button>
      </div>
    )
  }

  if (!snapshot) return null

  const report = snapshot.performanceReport
  const congestionChart = snapshot.congestionForecasts.slice(0, 8).map((f, i) => ({
    name: `${f.bridgeId.slice(0, 6)}-${f.chain.slice(0, 3)}`,
    current: Math.round(f.currentLevel * 100),
    predicted: Math.round(f.predictedLevel1h * 100),
    idx: i,
  }))

  const protocolPerf = Object.entries(report.byProtocol ?? {})
    .filter(([, v]) => v.transfers > 0)
    .slice(0, 6)
    .map(([id, v]) => ({
      name: id.slice(0, 8),
      success: Math.round(v.successRate * 100),
      transfers: v.transfers,
    }))

  const sections: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'security', label: 'Security' },
    { id: 'routing', label: 'Routing' },
    { id: 'liquidity', label: 'Liquidity' },
    { id: 'report', label: 'Report' },
  ]

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700 }}>
            Cross-Chain Bridge Monitor
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            AI-enhanced monitoring across {snapshot.networks.length} networks ·{' '}
            {snapshot.bridges.length} bridge protocols
            {apiConnected ? ' · API connected' : ' · Local engine'}
          </div>
        </div>
        <button
          onClick={refresh}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        <StatCard label="Health Score" value={snapshot.healthScore} accent="var(--green)" />
        <StatCard label="Active Transfers" value={snapshot.activeTransfers.length} accent="var(--cyan)" />
        <StatCard
          label="Security Alerts"
          value={snapshot.securityAlerts.filter((a) => !a.resolved).length}
          accent={criticalAlerts.length ? 'var(--red)' : 'var(--amber)'}
        />
        <StatCard label="Success Rate" value={`${(report.successRate * 100).toFixed(1)}%`} accent="var(--green)" />
        <StatCard label="Cost Savings" value={`${report.costSavingsPct}%`} accent="var(--cyan)" />
        <StatCard label="Prediction Accuracy" value={`${report.predictionAccuracyPct}%`} accent="var(--green)" />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              border: `1px solid ${activeSection === s.id ? 'var(--cyan)' : 'var(--border)'}`,
              background: activeSection === s.id ? 'var(--bg-elevated)' : 'transparent',
              color: activeSection === s.id ? 'var(--cyan)' : 'var(--text-secondary)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'overview' && (
        <>
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
              Congestion Forecast
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={congestionChart}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} />
                <Line type="monotone" dataKey="current" stroke="var(--cyan)" name="Current %" dot={false} />
                <Line type="monotone" dataKey="predicted" stroke="var(--amber)" name="Predicted 1h %" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
              Network Status
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
              {snapshot.networks.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{n.name}</div>
                  <div
                    style={{
                      color:
                        n.status === 'healthy'
                          ? 'var(--green)'
                          : n.status === 'degraded'
                            ? 'var(--amber)'
                            : 'var(--red)',
                      marginTop: '2px',
                    }}
                  >
                    {n.status} · {n.rpcLatencyMs}ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeSection === 'transfers' && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['ID', 'Protocol', 'Route', 'Amount', 'Status', 'Gas'].map((h) => (
                  <th key={h} style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.activeTransfers.slice(0, 20).map((t) => (
                <TransferRow key={t.id} transfer={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {snapshot.securityAlerts.slice(0, 15).map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}

      {activeSection === 'routing' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
          {snapshot.routingSuggestions.map((r) => (
            <RouteCard key={r.id} route={r} />
          ))}
        </div>
      )}

      {activeSection === 'liquidity' && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Bridge', 'Chain', 'Asset', 'Liquidity', 'Utilization', '24h Change'].map((h) => (
                  <th key={h} style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.liquidityPools.slice(0, 20).map((p) => (
                <tr key={`${p.bridgeId}-${p.chain}-${p.asset}`}>
                  <td style={cellStyle}>{p.bridgeId}</td>
                  <td style={cellStyle}>{p.chain}</td>
                  <td style={cellStyle}>{p.asset}</td>
                  <td style={cellStyle}>${(p.liquidityUsd / 1e6).toFixed(2)}M</td>
                  <td style={cellStyle}>{p.utilizationPct.toFixed(1)}%</td>
                  <td
                    style={{
                      ...cellStyle,
                      color: p.change24hPct < 0 ? 'var(--red)' : 'var(--green)',
                    }}
                  >
                    {p.change24hPct > 0 ? '+' : ''}
                    {p.change24hPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === 'report' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
            <StatCard label="Total Transfers (24h)" value={report.totalTransfers} />
            <StatCard label="Volume" value={`$${(report.totalVolumeUsd / 1e6).toFixed(2)}M`} />
            <StatCard label="Avg Completion" value={`${Math.round(report.avgCompletionTimeSec)}s`} />
          </div>
          {protocolPerf.length > 0 && (
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '14px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
                Protocol Performance
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={protocolPerf}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} />
                  <Bar dataKey="success" fill="var(--green)" name="Success %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {lastRefresh && (
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right' }}>
          Last updated {new Date(lastRefresh).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
