import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import useMarketSentiment from '../../hooks/useMarketSentiment';
import { useStore } from '../../lib/store';
import type { SentimentLabel, SentimentSnapshot } from '../../types/marketSentiment';

type View = 'overview' | 'sources' | 'signals' | 'alerts' | 'methodology';
const tone = (score: number) =>
  score >= 0.18 ? 'var(--green)' : score <= -0.18 ? 'var(--red)' : 'var(--yellow)';
const pct = (value: number) => `${Math.round(value * 100)}%`;
const time = (value: string) =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value)
  );
const sourceName = (source: string) =>
  source === 'x' ? 'X / Twitter' : source.replace(/(^|-)./g, (value) => value.toUpperCase());

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`sentiment-card ${className}`}>{children}</section>;
}
function Badge({ label }: { label: SentimentLabel }) {
  return <span className={`sentiment-badge ${label}`}>{label.toUpperCase()}</span>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="sentiment-empty">{children}</div>;
}

function Overview({ snapshot }: { snapshot: SentimentSnapshot }) {
  const chart = snapshot.trend.map((point) => ({
    ...point,
    label: time(point.timestamp),
    sentiment: Math.round(point.score * 100),
    price: Number(point.priceUsd.toFixed(4)),
  }));
  return (
    <>
      <div className="sentiment-kpis">
        <Card>
          <span>Composite sentiment</span>
          <strong style={{ color: tone(snapshot.summary.score) }}>
            {Math.round(snapshot.summary.score * 100)}
          </strong>
          <Badge label={snapshot.summary.label} />
          <small>
            {snapshot.summary.change24h >= 0 ? '+' : ''}
            {Math.round(snapshot.summary.change24h * 100)} pts / 24h
          </small>
        </Card>
        <Card>
          <span>Model confidence</span>
          <strong>{pct(snapshot.summary.confidence)}</strong>
          <small>Credibility-weighted ensemble</small>
        </Card>
        <Card>
          <span>Mentions / 24h</span>
          <strong>{snapshot.summary.mentionVolume24h.toLocaleString()}</strong>
          <small>{snapshot.summary.processedToday.toLocaleString()} processed today</small>
        </Card>
        <Card>
          <span>Direction indicator</span>
          <strong
            style={{
              color: tone(
                snapshot.forecast.direction === 'bullish'
                  ? 0.5
                  : snapshot.forecast.direction === 'bearish'
                    ? -0.5
                    : 0
              ),
            }}
          >
            {snapshot.forecast.direction}
          </strong>
          <small>{pct(snapshot.forecast.probability)} probability · experimental</small>
        </Card>
      </div>
      <div className="sentiment-grid wide">
        <Card>
          <h2>Sentiment and price trend</h2>
          <p className="sentiment-muted">
            Hourly normalized sentiment overlaid with XLM reference price.
          </p>
          <div
            className="sentiment-chart"
            role="img"
            aria-label="48-hour sentiment and XLM price trend"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  interval={7}
                />
                <YAxis
                  yAxisId="left"
                  domain={[-100, 100]}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="sentiment"
                  stroke="var(--cyan)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="price"
                  stroke="var(--purple,#a78bfa)"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2>Price correlation</h2>
          <strong
            className="sentiment-score"
            style={{ color: tone(snapshot.priceCorrelation.coefficient) }}
          >
            {snapshot.priceCorrelation.coefficient.toFixed(2)}
          </strong>
          <p>{snapshot.priceCorrelation.interpretation}</p>
          <dl>
            <div>
              <dt>Observations</dt>
              <dd>{snapshot.priceCorrelation.sampleSize}</dd>
            </div>
            <div>
              <dt>Lag</dt>
              <dd>{snapshot.priceCorrelation.lagHours}h</dd>
            </div>
            <div>
              <dt>Estimated p-value</dt>
              <dd>{snapshot.priceCorrelation.pValueEstimate.toFixed(3)}</dd>
            </div>
          </dl>
          <small>Correlation is descriptive and does not establish causation.</small>
        </Card>
      </div>
      <div className="sentiment-grid thirds">
        <Card>
          <h2>Source pulse</h2>
          {snapshot.sourceBreakdown.slice(0, 6).map((source) => (
            <div className="sentiment-row" key={source.source}>
              <span>
                {sourceName(source.source)} <small>{source.volume} samples</small>
              </span>
              <strong style={{ color: tone(source.score) }}>
                {Math.round(source.score * 100)}
              </strong>
            </div>
          ))}
        </Card>
        <Card>
          <h2>Aspect intelligence</h2>
          {snapshot.aspects.length ? (
            snapshot.aspects.map((aspect) => (
              <div className="sentiment-row" key={aspect.aspect}>
                <span>
                  {aspect.aspect} <small>{aspect.mentions} mentions</small>
                </span>
                <strong style={{ color: tone(aspect.score) }}>
                  {Math.round(aspect.score * 100)}
                </strong>
              </div>
            ))
          ) : (
            <Empty>No aspect signals in this window.</Empty>
          )}
        </Card>
        <Card>
          <h2>Forecast drivers</h2>
          <Badge label={snapshot.forecast.direction} />
          <p>
            {pct(snapshot.forecast.confidence)} confidence over {snapshot.forecast.horizonHours}{' '}
            hours
          </p>
          <ul>
            {snapshot.forecast.drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ul>
          <small>{snapshot.forecast.disclaimer}</small>
        </Card>
      </div>
    </>
  );
}

function Sources({ snapshot }: { snapshot: SentimentSnapshot }) {
  return (
    <div className="sentiment-grid wide">
      <Card>
        <h2>Ingestion health</h2>
        <p className="sentiment-muted">
          Connector availability and freshness. Credential-dependent sources degrade independently.
        </p>
        <div className="sentiment-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Credibility</th>
                <th>Samples</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.sources.map((source) => (
                <tr key={source.source}>
                  <td>{source.label}</td>
                  <td>
                    <span className={`source-state ${source.live ? 'live' : 'degraded'}`}>
                      {source.live ? 'LIVE' : 'DEMO'}
                    </span>
                    {source.error && <small className="block">{source.error}</small>}
                  </td>
                  <td>{pct(source.credibility)}</td>
                  <td>{source.sampleCount.toLocaleString()}</td>
                  <td>{source.latencySeconds ? `${source.latencySeconds}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <h2>Global language coverage</h2>
        <p className="sentiment-muted">
          Language-aware tokenization is configured for 20+ locale codes; the current window
          contains:
        </p>
        {snapshot.languageBreakdown.map((language) => (
          <div className="sentiment-row" key={language.language}>
            <span>
              <code>{language.language}</code> · {language.volume} samples
            </span>
            <strong style={{ color: tone(language.score) }}>
              {Math.round(language.score * 100)}
            </strong>
          </div>
        ))}
        <p className="sentiment-note">
          Production deployments should use reviewed, language-specific transformer models. Lexicon
          fallback is intentionally confidence-limited.
        </p>
      </Card>
    </div>
  );
}

function Signals({ snapshot }: { snapshot: SentimentSnapshot }) {
  return (
    <>
      <div className="sentiment-grid wide">
        <Card>
          <h2>Viral content and entities</h2>
          {snapshot.viralSignals.length ? (
            snapshot.viralSignals.map((signal) => (
              <article className="sentiment-signal" key={signal.id}>
                <div>
                  <strong>{signal.topic}</strong>
                  <small>
                    {sourceName(signal.source)} · {signal.velocity}% share of voice
                  </small>
                </div>
                <span style={{ color: tone(signal.score) }}>{Math.round(signal.score * 100)}</span>
              </article>
            ))
          ) : (
            <Empty>No viral signals exceeded the configured threshold.</Empty>
          )}
        </Card>
        <Card>
          <h2>Entity intelligence</h2>
          {snapshot.entities.map((entity) => (
            <div className="sentiment-row" key={entity.entity}>
              <span>
                {entity.entity}
                <small>
                  {entity.type} · {entity.mentions} mentions
                </small>
              </span>
              <strong style={{ color: tone(entity.score) }}>
                {Math.round(entity.score * 100)}
              </strong>
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <h2>Recent analyzed content</h2>
        <div className="sentiment-feed">
          {snapshot.recentDocuments.map((document) => (
            <article key={document.id}>
              <div>
                <span>
                  {sourceName(document.source)} · {document.language.toUpperCase()}
                </span>
                <Badge label={document.label} />
              </div>
              <p>{document.text}</p>
              <small>
                Confidence {pct(document.confidence)} · Credibility {pct(document.credibility)} ·
                Spam risk {pct(document.spamProbability)}
                {document.translated ? ' · multilingual fallback' : ''}
              </small>
            </article>
          ))}
        </div>
      </Card>
    </>
  );
}

function Alerts({
  snapshot,
  onStatus,
}: {
  snapshot: SentimentSnapshot;
  onStatus: (_id: string, _status: 'acknowledged' | 'resolved') => void;
}) {
  return (
    <Card>
      <h2>Sentiment alerts</h2>
      <p className="sentiment-muted">
        Rolling-baseline shifts require independent source verification before action.
      </p>
      {snapshot.alerts.length ? (
        snapshot.alerts.map((alert) => (
          <article className="sentiment-alert" key={alert.id}>
            <div>
              <span className={`severity ${alert.severity}`}>{alert.severity}</span>
              <strong>{alert.title}</strong>
              <small>
                {time(alert.createdAt)} · z-score {alert.zScore}
              </small>
            </div>
            <p>{alert.message}</p>
            <p>
              <strong>Guidance:</strong> {alert.recommendation}
            </p>
            <div className="sentiment-actions">
              {alert.status === 'active' && (
                <button onClick={() => onStatus(alert.id, 'acknowledged')}>Acknowledge</button>
              )}
              {alert.status !== 'resolved' && (
                <button onClick={() => onStatus(alert.id, 'resolved')}>Resolve</button>
              )}
              <span>{alert.status}</span>
            </div>
          </article>
        ))
      ) : (
        <Empty>No statistically unusual sentiment shifts are active.</Empty>
      )}
    </Card>
  );
}

function Methodology({ snapshot }: { snapshot: SentimentSnapshot }) {
  return (
    <div className="sentiment-grid wide">
      <Card>
        <h2>Methodology</h2>
        <ol>
          <li>Validate and normalize timestamps, languages, sources, and content.</li>
          <li>
            Remove duplicates and down-weight spam, unverified publishers, and coordinated
            amplification.
          </li>
          <li>Run language-aware sentiment, entity, and aspect classifiers.</li>
          <li>
            Aggregate using model confidence, source credibility, and bounded influence weights.
          </li>
          <li>
            Compare rolling baselines, correlate against price/on-chain series, and publish
            confidence with every forecast.
          </li>
        </ol>
        <dl>
          <div>
            <dt>Methodology</dt>
            <dd>{snapshot.methodologyVersion}</dd>
          </div>
          <div>
            <dt>Retention target</dt>
            <dd>{snapshot.retentionDays} days</dd>
          </div>
          <div>
            <dt>Freshness</dt>
            <dd>{snapshot.summary.dataFreshnessSeconds}s</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <h2>Limitations and responsible use</h2>
        <ul>
          {snapshot.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
        <p className="sentiment-note">
          The 75% price-direction objective is an evaluation target, not a guaranteed result. It
          must be measured with time-split, out-of-sample labeled production data and compared with
          a naive baseline.
        </p>
        <a href="/docs/market-sentiment.md" download>
          Download methodology reference
        </a>
      </Card>
    </div>
  );
}

export default function MarketSentimentDashboard() {
  const { network } = useStore(),
    state = useMarketSentiment(network),
    [view, setView] = useState<View>('overview');
  const filtered = useMemo(
    () =>
      state.snapshot
        ? {
            ...state.snapshot,
            recentDocuments: state.snapshot.recentDocuments.filter(
              (document) =>
                (state.preferences.selectedLanguage === 'all' ||
                  document.language === state.preferences.selectedLanguage) &&
                (state.preferences.includeLowCredibility || document.credibility >= 0.5) &&
                document.confidence >= state.preferences.minimumConfidence
            ),
          }
        : null,
    [state.snapshot, state.preferences]
  );
  if (state.loading && !filtered)
    return (
      <div className="market-sentiment" aria-busy="true">
        <Card>
          <h1>Market Sentiment Intelligence</h1>
          <p>Analyzing ecosystem sentiment…</p>
        </Card>
      </div>
    );
  if (state.error && !filtered)
    return (
      <div className="market-sentiment">
        <div className="sentiment-error" role="alert">
          <h1>Sentiment intelligence unavailable</h1>
          <p>{state.error.message}</p>
          <button onClick={() => void state.refresh(true)}>Retry</button>
          <button onClick={state.simulateCrisis}>Explore demonstration</button>
        </div>
      </div>
    );
  if (!filtered)
    return (
      <div className="market-sentiment">
        <Empty>No sentiment observations are available.</Empty>
      </div>
    );
  const exportReport = () => {
    const report = {
      exportedAt: new Date().toISOString(),
      network,
      methodologyVersion: filtered.methodologyVersion,
      summary: filtered.summary,
      sourceBreakdown: filtered.sourceBreakdown,
      languageBreakdown: filtered.languageBreakdown,
      aspects: filtered.aspects,
      entities: filtered.entities,
      alerts: filtered.alerts,
      forecast: filtered.forecast,
      priceCorrelation: filtered.priceCorrelation,
      caveats: filtered.caveats,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `stellar-sentiment-${network}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="market-sentiment">
      <header className="sentiment-header">
        <div>
          <div className="sentiment-eyebrow">STELLAR MARKET INTELLIGENCE</div>
          <h1>Market Sentiment Intelligence</h1>
          <p>Credibility-weighted social, news, on-chain, and market signals.</p>
        </div>
        <div className="sentiment-actions">
          {filtered.state === 'simulation' && (
            <span className="simulation-label">DEMONSTRATION DATA</span>
          )}
          {state.cached && <span>Cached</span>}
          {state.refreshing && <span aria-live="polite">Refreshing…</span>}
          <button onClick={() => void state.refresh(true)} disabled={state.refreshing}>
            Refresh
          </button>
          <button onClick={exportReport}>Export report</button>
          <button onClick={state.simulation ? state.exitSimulation : state.simulateCrisis}>
            {state.simulation ? 'Return to live data' : 'Simulate shift'}
          </button>
        </div>
      </header>
      {filtered.state !== 'live' && (
        <div className="sentiment-notice" role="status">
          <strong>{filtered.state === 'degraded' ? 'DEGRADED' : 'DEMONSTRATION'}:</strong>{' '}
          {filtered.state === 'degraded'
            ? 'Showing the last valid snapshot while live collection recovers.'
            : 'Credentialed connectors are not configured. Values are deterministic fixtures and not trading signals.'}
        </div>
      )}
      <nav className="sentiment-tabs" aria-label="Market sentiment views">
        {(['overview', 'sources', 'signals', 'alerts', 'methodology'] as View[]).map((item) => (
          <button
            key={item}
            aria-current={view === item ? 'page' : undefined}
            onClick={() => setView(item)}
          >
            {item}
            {item === 'alerts' && filtered.alerts.length ? ` (${filtered.alerts.length})` : ''}
          </button>
        ))}
      </nav>
      {view === 'overview' && <Overview snapshot={filtered} />}{' '}
      {view === 'sources' && <Sources snapshot={filtered} />}{' '}
      {view === 'signals' && <Signals snapshot={filtered} />}{' '}
      {view === 'alerts' && <Alerts snapshot={filtered} onStatus={state.changeAlertStatus} />}{' '}
      {view === 'methodology' && <Methodology snapshot={filtered} />}
      <footer>
        Generated {new Date(filtered.generatedAt).toLocaleString()} · Request{' '}
        {state.requestId?.slice(0, 12) ?? 'local'} · Network {network}
      </footer>
    </main>
  );
}
