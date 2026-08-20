import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBehaviorAnalytics } from '../../hooks/useBehaviorAnalytics';

export default function AnalyticsConsentBanner() {
  const navigate = useNavigate();
  const { snapshot, updateConsent } = useBehaviorAnalytics();
  const [expanded, setExpanded] = useState(false);

  if (snapshot.consent.status !== 'pending') return null;

  return (
    <section
      role="dialog"
      aria-label="Analytics privacy choices"
      aria-describedby="analytics-consent-description"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '18px',
        transform: 'translateX(-50%)',
        zIndex: 1300,
        width: 'min(680px, calc(100vw - 32px))',
        padding: '18px',
        border: '1px solid var(--cyan-dim)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-surface)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' }}>
        Your dashboard, your data
      </div>
      <p
        id="analytics-consent-description"
        style={{
          color: 'var(--text-secondary)',
          fontSize: '12px',
          lineHeight: 1.6,
          marginTop: '6px',
        }}
      >
        Optional analytics stays in this browser, excludes wallet addresses and transaction
        identifiers, and is deleted after 30 days. Personalization uses only consented activity.
      </p>

      {expanded && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            fontSize: '11px',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
          }}
        >
          Essential storage keeps your privacy choice. Usage analytics records coarse feature names
          and outcomes. Personalization derives an on-device persona and recommendations. If this
          deployment enables the first-party analytics service, sanitized events are synchronized
          there; the Privacy controls page always shows the current sync mode.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
        <button type="button" onClick={() => updateConsent(true, true)} style={primaryButton}>
          Allow & personalize
        </button>
        <button type="button" onClick={() => updateConsent(false, false)} style={secondaryButton}>
          Essential only
        </button>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          style={textButton}
        >
          {expanded ? 'Hide details' : 'How it works'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/behaviorInsights')}
          style={{ ...textButton, marginLeft: 'auto' }}
        >
          Privacy controls
        </button>
      </div>
    </section>
  );
}

const primaryButton: React.CSSProperties = {
  border: '1px solid var(--cyan)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--cyan)',
  color: 'var(--bg-base)',
  padding: '9px 12px',
  fontSize: '11px',
  fontWeight: 700,
};

const secondaryButton: React.CSSProperties = {
  ...primaryButton,
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  borderColor: 'var(--border-bright)',
};

const textButton: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'var(--cyan)',
  padding: '9px 6px',
  fontSize: '11px',
};
