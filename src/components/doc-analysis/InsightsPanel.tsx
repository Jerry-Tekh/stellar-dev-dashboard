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
import type {
  DocAnalysisSnapshot,
  FactValidationStatus,
  SkillLevel,
} from '../../types/documentAnalysis';

interface InsightsPanelProps {
  snapshot: DocAnalysisSnapshot;
  validations: FactValidationStatus[];
  onValidateFact: (_key: string, _status: FactValidationStatus['status']) => void;
}

const LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export default function InsightsPanel({
  snapshot,
  validations,
  onValidateFact,
}: InsightsPanelProps) {
  const [openPath, setOpenPath] = useState<SkillLevel>('beginner');
  const { insights } = snapshot;

  const trendChartData = useMemo(() => {
    const periods = new Set<string>();
    for (const trend of insights.trends.slice(0, 4)) {
      for (const point of trend.points) periods.add(point.period);
    }
    const sorted = [...periods].sort();
    return sorted.map((period) => {
      const row: Record<string, number | string> = { period };
      for (const trend of insights.trends.slice(0, 4)) {
        const point = trend.points.find((item) => item.period === period);
        row[trend.concept] = point?.documents ?? 0;
      }
      return row;
    });
  }, [insights.trends]);

  const validationFor = (key: string): FactValidationStatus['status'] | null =>
    validations.find((item) => item.key === key)?.status ?? null;

  return (
    <div className="doc-grid">
      <div className="doc-grid halves">
        <div className="doc-card">
          <h2>Topic clusters</h2>
          <p className="doc-muted">
            Automatically grouped concepts discovered by graph clustering.
          </p>
          <div className="doc-list">
            {snapshot.graph.clusters.length ? (
              snapshot.graph.clusters.slice(0, 6).map((cluster) => (
                <div key={cluster.id} className="doc-item">
                  <strong>{cluster.label}</strong>
                  <small className="doc-muted">
                    {' '}
                    · {cluster.nodeIds.length} concepts · {cluster.documentCount} documents ·
                    cohesion {Math.round(cluster.cohesion * 100)}%
                  </small>
                  <div style={{ marginTop: 6 }}>
                    {cluster.topTerms.map((term) => (
                      <span key={term} className="doc-chip">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="doc-muted">No clusters yet — ingest more documents.</p>
            )}
          </div>
        </div>
        <div className="doc-card">
          <h2>Concept trends</h2>
          <p className="doc-muted">Document coverage per concept over publication time.</p>
          {trendChartData.length > 1 ? (
            <div
              role="img"
              aria-label="Concept mention trends over time"
              style={{ height: 240 }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                    }}
                  />
                  {insights.trends.slice(0, 4).map((trend, index) => (
                    <Line
                      key={trend.concept}
                      type="monotone"
                      dataKey={trend.concept}
                      stroke={
                        ['var(--cyan)', 'var(--green)', 'var(--amber)', 'var(--purple,#a78bfa)'][
                          index
                        ]
                      }
                      dot={false}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="doc-muted">Not enough dated documents to compute trends.</p>
          )}
          <div style={{ marginTop: 8 }}>
            {insights.trends.slice(0, 5).map((trend) => (
              <div className="doc-trend-row" key={trend.concept}>
                <span>{trend.concept}</span>
                <small
                  className="doc-muted"
                  style={{
                    color:
                      trend.direction === 'rising'
                        ? 'var(--green)'
                        : trend.direction === 'falling'
                          ? 'var(--red)'
                          : undefined,
                  }}
                >
                  {trend.direction} ({trend.changePct >= 0 ? '+' : ''}
                  {trend.changePct}%)
                </small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="doc-grid halves">
        <div className="doc-card">
          <h2>Knowledge gaps</h2>
          <p className="doc-muted">Where documentation coverage looks thin or disconnected.</p>
          {insights.gaps.length ? (
            <ul>
              {insights.gaps.slice(0, 8).map((gap) => (
                <li key={`${gap.reason}:${gap.concept}`}>
                  <span className={`doc-badge`}>{gap.reason}</span> <strong>{gap.concept}</strong> —{' '}
                  {gap.suggestion}
                </li>
              ))}
            </ul>
          ) : (
            <p className="doc-muted">No obvious gaps detected in the current corpus.</p>
          )}
        </div>
        <div className="doc-card">
          <h2>Community experts</h2>
          <p className="doc-muted">Ranked by contribution analysis across community sources.</p>
          {insights.experts.length ? (
            insights.experts.map((expert) => (
              <div className="doc-trend-row" key={expert.author}>
                <span>
                  <strong>{expert.author}</strong>{' '}
                  <small className="doc-muted">
                    {expert.contributions} posts · top: {expert.concepts[0]?.concept ?? 'n/a'}
                  </small>
                </span>
                <small className="doc-muted">score {expert.score}</small>
              </div>
            ))
          ) : (
            <p className="doc-muted">
              No authored community sources ingested yet.
            </p>
          )}
        </div>
      </div>
      <div className="doc-card">
        <h2>Learning paths</h2>
        <p className="doc-muted">
          Ordered by concept dependencies. Validate steps to help curate the curriculum.
        </p>
        <div className="doc-actions">
          {(Object.keys(LEVEL_LABELS) as SkillLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={openPath === level}
              onClick={() => setOpenPath(level)}
              style={
                openPath === level
                  ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' }
                  : undefined
              }
            >
              {LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
        {insights.learningPaths
          .filter((path) => path.level === openPath)
          .map((path) =>
            path.steps.length ? (
              <ol key={path.id} style={{ margin: '12px 0 0', paddingLeft: 20 }}>
                {path.steps.map((step, index) => {
                  const factKey = `${path.id}:${index}`;
                  const status = validationFor(factKey);
                  return (
                    <li key={factKey} style={{ marginBottom: 10 }}>
                      <strong>{step.title}</strong>
                      <p className="doc-snippet">{step.description}</p>
                      <small className="doc-muted">
                        Source: {step.documentTitle}
                        {step.heading ? ` — ${step.heading}` : ''}
                      </small>
                      <div className="doc-actions" style={{ marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => onValidateFact(factKey, 'confirmed')}
                          style={
                            status === 'confirmed'
                              ? { borderColor: 'var(--green)', color: 'var(--green)' }
                              : undefined
                          }
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => onValidateFact(factKey, 'flagged')}
                          style={
                            status === 'flagged'
                              ? { borderColor: 'var(--red)', color: 'var(--red)' }
                              : undefined
                          }
                        >
                          Flag
                        </button>
                        {status && (
                          <small className="doc-muted" role="status">
                            marked {status}
                          </small>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p key={path.id} className="doc-muted" style={{ marginTop: 12 }}>
                Not enough corpus coverage to build the {LEVEL_LABELS[path.level]} path yet.
              </p>
            )
          )}
      </div>
    </div>
  );
}
