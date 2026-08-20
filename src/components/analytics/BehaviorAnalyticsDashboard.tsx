import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBehaviorAnalytics } from '../../hooks/useBehaviorAnalytics';
import type {
  AnalyticsSnapshot,
  FeatureUsage,
  PersonalizationRecommendation,
} from '../../types/behaviorAnalytics';

type View = 'insights' | 'personalization' | 'privacy';

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '16px',
};

const button: React.CSSProperties = {
  border: '1px solid var(--border-bright)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  padding: '9px 12px',
  fontSize: '11px',
};

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div style={card}>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: 'var(--cyan)',
          fontFamily: 'var(--font-display)',
          fontSize: '24px',
          fontWeight: 700,
          marginTop: '6px',
        }}
      >
        {value}
      </div>
      {detail && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginTop: '4px' }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function EmptyInsights({ onEnable }: { onEnable: () => void }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '42px 20px' }}>
      <div aria-hidden="true" style={{ fontSize: '30px', color: 'var(--cyan)' }}>
        ◌
      </div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', marginTop: '12px' }}>
        No behavior insights yet
      </h2>
      <p
        style={{
          color: 'var(--text-secondary)',
          maxWidth: '500px',
          margin: '8px auto 18px',
          fontSize: '12px',
          lineHeight: 1.6,
        }}
      >
        Enable private on-device analytics, then use the dashboard normally. Insights become more
        useful across sessions and are automatically removed after 30 days.
      </p>
      <button
        type="button"
        onClick={onEnable}
        style={{ ...button, borderColor: 'var(--cyan)', color: 'var(--cyan)' }}
      >
        Enable private analytics
      </button>
    </div>
  );
}

function UsageBars({ items }: { items: FeatureUsage[] }) {
  if (!items.length)
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
        Explore a few dashboard features to populate this view.
      </p>
    );
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {items.map((item) => (
        <div key={item.feature}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              marginBottom: '5px',
            }}
          >
            <span style={{ textTransform: 'capitalize' }}>
              {item.feature.replace(/([A-Z])/g, ' $1')}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {item.count} visits · {item.percentage}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`${item.feature} usage`}
            aria-valuenow={item.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              height: '6px',
              background: 'var(--bg-elevated)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(4, item.percentage)}%`,
                height: '100%',
                background: 'var(--cyan)',
                borderRadius: '3px',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightsView({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const { summary } = snapshot;
  if (!snapshot.consent.usage || !summary.eventCount) return null;
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
        }}
      >
        <Stat
          label="Consented events"
          value={summary.eventCount}
          detail="Stored only on this device"
        />
        <Stat label="Sessions" value={summary.sessionCount} detail="Anonymous session groups" />
        <Stat label="Active days" value={summary.activeDays} detail="Within the retention window" />
        <Stat
          label="Friction signals"
          value={summary.frictionPoints.length}
          detail="Incomplete repeated workflows"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
        }}
      >
        <section style={card} aria-labelledby="feature-usage-title">
          <h2
            id="feature-usage-title"
            style={{ fontFamily: 'var(--font-display)', fontSize: '14px', marginBottom: '16px' }}
          >
            Feature usage
          </h2>
          <UsageBars items={summary.topFeatures} />
        </section>
        <section style={card} aria-labelledby="segment-title">
          <h2 id="segment-title" style={{ fontFamily: 'var(--font-display)', fontSize: '14px' }}>
            On-device segment
          </h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '14px' }}>
            <span
              style={{
                color: 'var(--cyan)',
                fontSize: '22px',
                fontFamily: 'var(--font-display)',
                textTransform: 'capitalize',
              }}
            >
              {summary.segment.persona}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {Math.round(summary.segment.confidence * 100)}% confidence
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            {[summary.segment.experience, summary.segment.engagement].map((label) => (
              <span
                key={label}
                style={{
                  padding: '5px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: '999px',
                  color: 'var(--text-secondary)',
                  fontSize: '10px',
                  textTransform: 'capitalize',
                }}
              >
                {label}
              </span>
            ))}
          </div>
          <ul
            style={{
              margin: '16px 0 0 18px',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              lineHeight: 1.8,
            }}
          >
            {summary.segment.signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </section>
      </div>

      <section style={card} aria-labelledby="friction-title">
        <h2 id="friction-title" style={{ fontFamily: 'var(--font-display)', fontSize: '14px' }}>
          Workflow friction
        </h2>
        {!summary.frictionPoints.length ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '10px' }}>
            No repeated workflow friction detected.
          </p>
        ) : (
          summary.frictionPoints.map((point) => (
            <div
              key={point.workflow}
              style={{
                marginTop: '12px',
                padding: '12px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '12px' }}>{point.workflow}</span>
              <span
                style={{
                  fontSize: '11px',
                  color: point.severity === 'high' ? 'var(--red)' : 'var(--amber)',
                }}
              >
                {Math.round(point.abandonmentRate * 100)}% incomplete
              </span>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function RecommendationCard({
  item,
  onOpen,
}: {
  item: PersonalizationRecommendation;
  onOpen: (_item: PersonalizationRecommendation) => void;
}) {
  return (
    <article style={{ ...card, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span
        style={{
          alignSelf: 'flex-start',
          color: 'var(--cyan)',
          fontSize: '9px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {item.kind}
      </span>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px' }}>{item.title}</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.6, flex: 1 }}>
        {item.reason}
      </p>
      <button
        type="button"
        onClick={() => onOpen(item)}
        style={{ ...button, alignSelf: 'flex-start', color: 'var(--cyan)' }}
      >
        Open feature
      </button>
    </article>
  );
}

function PersonalizationView({
  snapshot,
  variant,
  onConversion,
}: {
  snapshot: AnalyticsSnapshot;
  variant: string;
  onConversion: () => void;
}) {
  const navigate = useNavigate();
  const { track } = useBehaviorAnalytics();
  const open = (item: PersonalizationRecommendation) => {
    track({
      type: 'feature_use',
      name: 'recommendation_opened',
      properties: { feature: item.actionTab, source: item.id },
    });
    onConversion();
    navigate(`/${item.actionTab}`);
  };

  if (!snapshot.consent.personalization) {
    return (
      <div style={card}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          Personalization is off. Enable it in Privacy & controls to receive on-device suggestions.
        </p>
      </div>
    );
  }
  return (
    <>
      <section style={card}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px' }}>
          Recommended next steps
        </h2>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '11px',
            marginTop: '6px',
            lineHeight: 1.6,
          }}
        >
          Ranked locally from your feature usage and experience level. Recommendations never use
          wallet contents.
        </p>
      </section>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            variant === 'compact'
              ? 'repeat(auto-fit, minmax(300px, 1fr))'
              : 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '12px',
        }}
      >
        {snapshot.recommendations.map((item) => (
          <RecommendationCard key={item.id} item={item} onOpen={open} />
        ))}
        {!snapshot.recommendations.length && (
          <div style={card}>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              Use more dashboard features to receive a recommendation.
            </p>
          </div>
        )}
      </div>
      <section style={card} aria-labelledby="experiments-title">
        <h2 id="experiments-title" style={{ fontFamily: 'var(--font-display)', fontSize: '14px' }}>
          Experiments
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '6px' }}>
          A/B assignments are stable, pseudonymous, and disabled when personalization is off.
        </p>
        {!snapshot.experiments.length ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '12px' }}>
            No active experiment assignments.
          </p>
        ) : (
          snapshot.experiments.map((result) => (
            <div
              key={result.experimentId}
              style={{
                marginTop: '12px',
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '16px',
                padding: '10px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                fontSize: '11px',
              }}
            >
              <span>
                {result.experimentId} · {result.variantId}
              </span>
              <span>{result.exposures} views</span>
              <span>{Math.round(result.conversionRate * 100)}% conversion</span>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function PrivacyView({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const { updateConsent, eraseData, exportData, syncRemote } = useBehaviorAnalytics();
  const [notice, setNotice] = useState('');
  const [usage, setUsage] = useState(snapshot.consent.usage);
  const [personalization, setPersonalization] = useState(snapshot.consent.personalization);

  const save = () => {
    updateConsent(usage, usage && personalization);
    setNotice('Privacy choices saved.');
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `stellar-analytics-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('A copy of your on-device data was exported.');
  };
  const erase = () => {
    if (!window.confirm('Erase all behavior analytics data and reset your consent choice?')) return;
    eraseData();
    setUsage(false);
    setPersonalization(false);
    setNotice('All analytics events and assignments were erased.');
  };

  return (
    <>
      <section style={card} aria-labelledby="consent-title">
        <h2 id="consent-title" style={{ fontFamily: 'var(--font-display)', fontSize: '15px' }}>
          Consent choices
        </h2>
        <label
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            marginTop: '16px',
            fontSize: '12px',
          }}
        >
          <input
            type="checkbox"
            checked={usage}
            onChange={(event) => {
              setUsage(event.target.checked);
              if (!event.target.checked) setPersonalization(false);
            }}
          />
          <span>
            <strong>Private usage analytics</strong>
            <br />
            <span style={{ color: 'var(--text-secondary)' }}>
              Record coarse feature activity and workflow outcomes in this browser.
            </span>
          </span>
        </label>
        <label
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            marginTop: '14px',
            fontSize: '12px',
            opacity: usage ? 1 : 0.55,
          }}
        >
          <input
            type="checkbox"
            checked={personalization}
            disabled={!usage}
            onChange={(event) => setPersonalization(event.target.checked)}
          />
          <span>
            <strong>On-device personalization</strong>
            <br />
            <span style={{ color: 'var(--text-secondary)' }}>
              Build segments, rank recommendations, and allow privacy-safe experiments.
            </span>
          </span>
        </label>
        <button
          type="button"
          onClick={save}
          style={{ ...button, borderColor: 'var(--cyan)', color: 'var(--cyan)', marginTop: '18px' }}
        >
          Save choices
        </button>
        {notice && (
          <div role="status" style={{ color: 'var(--green)', fontSize: '11px', marginTop: '10px' }}>
            {notice}
          </div>
        )}
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
        }}
      >
        <section style={card}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px' }}>Data lifecycle</h2>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '10px',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              marginTop: '14px',
            }}
          >
            <dt>Storage location</dt>
            <dd>This browser</dd>
            <dt>Approximate size</dt>
            <dd>{snapshot.storageBytes} bytes</dd>
            <dt>Retention</dt>
            <dd>30 days</dd>
            <dt>Next expiry</dt>
            <dd>
              {snapshot.retainedUntil
                ? new Date(snapshot.retainedUntil).toLocaleDateString()
                : 'No events'}
            </dd>
            <dt>Analytics service</dt>
            <dd style={{ textTransform: 'capitalize' }}>
              {snapshot.remoteSync.status.replace('-', ' ')}
            </dd>
          </dl>
          {snapshot.remoteSync.enabled && (
            <button
              type="button"
              onClick={() => void syncRemote()}
              disabled={snapshot.remoteSync.status === 'syncing'}
              style={{ ...button, marginTop: '14px' }}
            >
              {snapshot.remoteSync.status === 'syncing' ? 'Syncing…' : 'Sync now'}
            </button>
          )}
          {snapshot.remoteSync.error && (
            <p role="status" style={{ color: 'var(--amber)', fontSize: '10px', marginTop: '8px' }}>
              {snapshot.remoteSync.error}
            </p>
          )}
        </section>
        <section style={card}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px' }}>Your data rights</h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '11px',
              lineHeight: 1.6,
              marginTop: '8px',
            }}
          >
            Download a readable copy or erase everything immediately. Disabling analytics also
            deletes collected events.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button type="button" onClick={download} style={button}>
              Export data
            </button>
            <button
              type="button"
              onClick={erase}
              style={{ ...button, color: 'var(--red)', borderColor: 'var(--red)' }}
            >
              Erase data
            </button>
          </div>
        </section>
      </div>

      <section style={card}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px' }}>Privacy methodology</h2>
        <ul
          style={{
            color: 'var(--text-secondary)',
            fontSize: '11px',
            lineHeight: 1.9,
            margin: '10px 0 0 18px',
          }}
        >
          <li>
            Allow-listed properties reject addresses, public keys, secrets, transaction hashes,
            memos, and free-form identity fields.
          </li>
          <li>
            Aggregate counters apply Laplace differential privacy with ε=1 before they are eligible
            for reporting.
          </li>
          <li>
            The random visitor identifier is pseudonymous and rotates whenever data is erased or
            consent is withdrawn. A configured first-party service stores only its salted hash.
          </li>
          <li>
            Raw events are capped at 2,000 and expire after 30 days; no third-party analytics SDK is
            loaded.
          </li>
        </ul>
      </section>
    </>
  );
}

export default function BehaviorAnalyticsDashboard() {
  const {
    snapshot,
    updateConsent,
    getExperimentAssignment,
    recordExperimentExposure,
    recordExperimentConversion,
  } = useBehaviorAnalytics();
  const [view, setView] = useState<View>('insights');
  const [recommendationVariant, setRecommendationVariant] = useState('control');
  const exposureRecorded = useRef(false);
  const tabs = useMemo(
    () =>
      [
        ['insights', 'Usage insights'],
        ['personalization', 'Personalization'],
        ['privacy', 'Privacy & controls'],
      ] as const,
    []
  );

  useEffect(() => {
    if (!snapshot.consent.personalization) return;
    const assignment = getExperimentAssignment({
      id: 'recommendation-layout',
      name: 'Recommendation layout engagement',
      active: true,
      variants: [
        { id: 'control', weight: 1 },
        { id: 'compact', weight: 1 },
      ],
    });
    if (!assignment) return;
    setRecommendationVariant(assignment.variantId);
    if (!exposureRecorded.current) {
      exposureRecorded.current = true;
      recordExperimentExposure(assignment.experimentId, assignment.variantId);
    }
  }, [snapshot.consent.personalization, getExperimentAssignment, recordExperimentExposure]);

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <header>
        <div
          style={{
            color: 'var(--cyan)',
            fontSize: '10px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Privacy-first analytics
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', marginTop: '4px' }}>
          Behavior & personalization
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '12px',
            lineHeight: 1.6,
            marginTop: '6px',
            maxWidth: '720px',
          }}
        >
          Understand how you use the Stellar dashboard and get relevant shortcuts without sending
          wallet activity or identity data to a third party.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Behavior analytics views"
        style={{
          display: 'flex',
          gap: '6px',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
        }}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            style={{
              border: 0,
              borderBottom: `2px solid ${view === id ? 'var(--cyan)' : 'transparent'}`,
              background: 'transparent',
              color: view === id ? 'var(--cyan)' : 'var(--text-secondary)',
              padding: '10px 12px',
              whiteSpace: 'nowrap',
              fontSize: '11px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'insights' && !snapshot.summary.eventCount && (
        <EmptyInsights onEnable={() => updateConsent(true, true)} />
      )}
      {view === 'insights' && <InsightsView snapshot={snapshot} />}
      {view === 'personalization' && (
        <PersonalizationView
          snapshot={snapshot}
          variant={recommendationVariant}
          onConversion={() =>
            recordExperimentConversion('recommendation-layout', recommendationVariant)
          }
        />
      )}
      {view === 'privacy' && <PrivacyView snapshot={snapshot} />}
    </div>
  );
}
