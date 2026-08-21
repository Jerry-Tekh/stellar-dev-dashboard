import { memo, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useRecommendations } from '../../hooks/useRecommendations';
import type {
  FeedbackValue,
  RankedRecommendation,
  RecommendationCategory,
  RecommendationGoal,
  RecommendationPreferences,
} from '../../types/recommendations';
import './recommendations.css';

type View = 'discover' | 'preferences' | 'methodology';
const CATEGORIES: Array<{ id: RecommendationCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'account', label: 'Accounts' },
  { id: 'asset', label: 'Assets' },
  { id: 'contract', label: 'Contracts' },
  { id: 'service', label: 'Services & tools' },
];
const GOALS: Array<{ id: RecommendationGoal; label: string; description: string }> = [
  { id: 'build', label: 'Build', description: 'SDKs, contracts, and infrastructure' },
  { id: 'invest', label: 'Invest', description: 'Assets, research, and diversification' },
  { id: 'payments', label: 'Payments', description: 'Anchors, wallets, and stable value' },
  { id: 'defi', label: 'DeFi', description: 'Liquidity, protocols, and market tools' },
  { id: 'learn', label: 'Learn', description: 'Documentation and trusted examples' },
];

function accountInterests(
  accountData: ReturnType<typeof useStore.getState>['accountData']
): string[] {
  if (!accountData) return [];
  const balances = accountData.balances ?? [];
  return balances.flatMap((balance) => {
    if (balance.asset_type === 'native') return ['xlm', 'payments'];
    return 'asset_code' in balance && balance.asset_code ? [balance.asset_code] : [];
  });
}

function StateBadge({ state }: { state: 'live' | 'local' | 'offline' }) {
  const label =
    state === 'live' ? 'Live service' : state === 'offline' ? 'Offline · on-device' : 'On-device';
  return (
    <span className={`recommendation-state ${state}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function ScoreMeter({ value, label }: { value: number; label: string }) {
  return (
    <div className="recommendation-meter" title={`${label}: ${Math.round(value * 100)}%`}>
      <span>{label}</span>
      <div aria-hidden="true">
        <i style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <strong>{Math.round(value * 100)}</strong>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  onFeedback,
  onImpression,
}: {
  recommendation: RankedRecommendation;
  onFeedback: (_value: FeedbackValue) => void;
  onImpression: () => void;
}) {
  const [details, setDetails] = useState(false);
  useEffect(() => onImpression(), [onImpression]);
  const { item, breakdown } = recommendation;
  return (
    <article className="recommendation-card" data-testid={`recommendation-${item.id}`}>
      <div className="recommendation-card-heading">
        <span className={`recommendation-kind ${item.category}`}>{item.category}</span>
        <span className="recommendation-confidence">
          {Math.round(recommendation.confidence * 100)}% confidence
        </span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <ul className="recommendation-reasons" aria-label={`Why ${item.title} was recommended`}>
        {recommendation.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <div className="recommendation-tags" aria-label="Topics">
        {item.tags.slice(0, 4).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <button
        className="recommendation-explain"
        type="button"
        onClick={() => setDetails((value) => !value)}
        aria-expanded={details}
      >
        {details ? 'Hide ranking details' : 'Why this ranking?'}
      </button>
      {details && (
        <div className="recommendation-breakdown">
          <ScoreMeter label="Interest match" value={breakdown.content} />
          <ScoreMeter label="Similar users" value={breakdown.collaborative} />
          <ScoreMeter label="Quality" value={breakdown.quality} />
          <ScoreMeter label="Discovery" value={breakdown.novelty} />
          {breakdown.diversityPenalty > 0 && (
            <small>
              Diversity adjustment: −{Math.round(breakdown.diversityPenalty * 100)} points
            </small>
          )}
        </div>
      )}
      <div className="recommendation-actions">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onFeedback('accepted')}
        >
          Explore <span className="sr-only">{item.title} (opens in a new tab)</span>
          <span aria-hidden="true">↗</span>
        </a>
        <button type="button" onClick={() => onFeedback('saved')} aria-label={`Save ${item.title}`}>
          ☆ Save
        </button>
        <button
          type="button"
          onClick={() => onFeedback('dismissed')}
          aria-label={`Not interested in ${item.title}`}
        >
          Not for me
        </button>
      </div>
    </article>
  );
}

function Discover({
  recommendations,
  category,
  setCategory,
  recordFeedback,
  recordImpression,
}: {
  recommendations: RankedRecommendation[];
  category: RecommendationCategory | 'all';
  setCategory: (_category: RecommendationCategory | 'all') => void;
  recordFeedback: (_itemId: string, _value: FeedbackValue, _rank: number) => void;
  recordImpression: (_category: RecommendationCategory, _rank: number) => void;
}) {
  const visible =
    category === 'all'
      ? recommendations
      : recommendations.filter((item) => item.item.category === category);
  return (
    <>
      <div className="recommendation-filters" role="group" aria-label="Filter recommendations">
        {CATEGORIES.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={category === option.id}
            onClick={() => setCategory(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="recommendation-list" aria-live="polite">
          {visible.map((recommendation) => (
            <RecommendationCard
              key={recommendation.item.id}
              recommendation={recommendation}
              onFeedback={(value) =>
                recordFeedback(recommendation.item.id, value, recommendation.rank)
              }
              onImpression={() =>
                recordImpression(recommendation.item.category, recommendation.rank)
              }
            />
          ))}
        </div>
      ) : (
        <section className="recommendation-empty">
          <span aria-hidden="true">◇</span>
          <h2>No matches in this category</h2>
          <p>Try another category or widen your goals in Preferences.</p>
          <button type="button" onClick={() => setCategory('all')}>
            Show all recommendations
          </button>
        </section>
      )}
    </>
  );
}

function Preferences({
  preferences,
  feedbackCount,
  onChange,
  onClear,
}: {
  preferences: RecommendationPreferences;
  feedbackCount: number;
  onChange: (_patch: Partial<RecommendationPreferences>) => void;
  onClear: () => void;
}) {
  const toggleGoal = (goal: RecommendationGoal) => {
    const selected = preferences.goals.includes(goal);
    const next = selected
      ? preferences.goals.filter((item) => item !== goal)
      : [...preferences.goals, goal];
    if (next.length) onChange({ goals: next });
  };
  return (
    <div className="recommendation-settings">
      <section>
        <div className="recommendation-section-heading">
          <div>
            <h2>Personalization</h2>
            <p>Control whether on-device activity can influence results.</p>
          </div>
          <label className="recommendation-switch">
            <input
              type="checkbox"
              checked={preferences.personalizationEnabled}
              onChange={(event) => onChange({ personalizationEnabled: event.target.checked })}
            />
            <span aria-hidden="true" />
            {preferences.personalizationEnabled ? 'Enabled' : 'Disabled'}
          </label>
        </div>
        <p className="recommendation-privacy-note">
          Your public key and transaction history are never stored by this feature. Asset symbols,
          settings, and feedback stay in this browser unless you configure the optional
          recommendation API.
        </p>
      </section>
      <section>
        <h2>Your goals</h2>
        <p>Select one or more outcomes. At least one goal must remain active.</p>
        <div className="recommendation-goals">
          {GOALS.map((goal) => (
            <button
              key={goal.id}
              type="button"
              aria-pressed={preferences.goals.includes(goal.id)}
              onClick={() => toggleGoal(goal.id)}
            >
              <strong>{goal.label}</strong>
              <span>{goal.description}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="recommendation-setting-grid">
        <label>
          <span>Risk tolerance</span>
          <select
            value={preferences.riskTolerance}
            onChange={(event) =>
              onChange({
                riskTolerance: event.target.value as RecommendationPreferences['riskTolerance'],
              })
            }
          >
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="growth">Growth</option>
          </select>
          <small>Changes the fit score; it is not financial advice.</small>
        </label>
        <label>
          <span>Discovery: {Math.round(preferences.discovery * 100)}%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={preferences.discovery}
            onChange={(event) => onChange({ discovery: Number(event.target.value) })}
          />
          <small>Higher values surface less familiar ecosystem items.</small>
        </label>
        <label>
          <span>Diversity: {Math.round(preferences.diversity * 100)}%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={preferences.diversity}
            onChange={(event) => onChange({ diversity: Number(event.target.value) })}
          />
          <small>Higher values reduce repeated sectors and categories.</small>
        </label>
      </section>
      <section className="recommendation-delete">
        <div>
          <h2>Local recommendation data</h2>
          <p>
            {feedbackCount} feedback signal{feedbackCount === 1 ? '' : 's'} stored on this device.
          </p>
        </div>
        <button type="button" onClick={onClear}>
          Clear data & reset ID
        </button>
      </section>
    </div>
  );
}

function Methodology({ variant }: { variant: string }) {
  return (
    <div className="recommendation-methodology">
      <section>
        <span>01</span>
        <div>
          <h2>Content matching</h2>
          <p>
            Goal, interest, asset, network, and risk features are compared with structured ecosystem
            metadata. No free-form wallet data enters the model.
          </p>
        </div>
      </section>
      <section>
        <span>02</span>
        <div>
          <h2>Collaborative signals</h2>
          <p>
            Pre-computed anonymous cohort factors approximate matrix-factorization inference. Your
            selected goals form the user vector; individual users are not exposed.
          </p>
        </div>
      </section>
      <section>
        <span>03</span>
        <div>
          <h2>Quality and context</h2>
          <p>
            Verification, security record, network availability, popularity, and context contribute
            bounded scores. These are discovery signals, not endorsements.
          </p>
        </div>
      </section>
      <section>
        <span>04</span>
        <div>
          <h2>Diversity re-ranking</h2>
          <p>
            Maximal marginal relevance penalizes near-duplicate categories, sectors, and tags so a
            relevant list still supports discovery.
          </p>
        </div>
      </section>
      <section>
        <span>05</span>
        <div>
          <h2>Online learning</h2>
          <p>
            Save, explore, and dismiss actions update later rankings immediately. Feedback is
            capped, replaceable, and removable from Preferences.
          </p>
        </div>
      </section>
      <aside>
        <strong>Experiment assignment</strong>
        <p>
          You are in the <code>{variant}</code> ranking variant. Assignment is stable for a random
          local identifier and rotates when recommendation data is cleared.
        </p>
      </aside>
      <p className="recommendation-disclaimer">
        <strong>Important:</strong> Recommendations are automated ecosystem discovery aids, not
        financial, legal, or security advice. Verify issuers, contract IDs, audit reports, and
        destination URLs independently.
      </p>
    </div>
  );
}

function RecommendationDashboard() {
  const network = useStore((state) => state.network);
  const accountData = useStore((state) => state.accountData);
  const interests = useMemo(() => accountInterests(accountData), [accountData]);
  const {
    snapshot,
    loading,
    refreshing,
    error,
    refresh,
    setPreferences,
    recordFeedback,
    recordImpression,
    clearPersonalization,
  } = useRecommendations({
    network,
    interests,
    heldAssets: interests.filter((value) => value !== 'payments'),
  });
  const [view, setView] = useState<View>('discover');
  const [category, setCategory] = useState<RecommendationCategory | 'all'>('all');
  return (
    <div className="recommendation-dashboard">
      <header className="recommendation-hero">
        <div>
          <p className="recommendation-eyebrow">ECOSYSTEM INTELLIGENCE</p>
          <h1>Recommendations for you</h1>
          <p>Discover Stellar accounts, assets, contracts, and tools ranked for your goals.</p>
        </div>
        <div className="recommendation-hero-meta">
          <StateBadge state={snapshot.state} />
          <span>Model {snapshot.modelVersion}</span>
          <span>{snapshot.processingMs.toFixed(1)}ms ranking</span>
        </div>
      </header>
      {snapshot.coldStart && view === 'discover' && (
        <div className="recommendation-notice" role="status">
          <strong>Getting started</strong>
          <span>
            These high-quality results use your selected goals. Rankings learn as you save, explore,
            or dismiss items.
          </span>
        </div>
      )}
      {snapshot.state === 'offline' && (
        <div className="recommendation-notice warning" role="status">
          <strong>Offline mode</strong>
          <span>Showing cached catalog results ranked entirely on this device.</span>
        </div>
      )}
      {error && (
        <div className="recommendation-notice warning" role="alert">
          <strong>Refresh unavailable</strong>
          <span>{error} Your last on-device results remain available.</span>
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}
      <nav className="recommendation-tabs" aria-label="Recommendation views">
        {(['discover', 'preferences', 'methodology'] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-current={view === item ? 'page' : undefined}
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
        <button
          className="recommendation-refresh"
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </nav>
      {loading ? (
        <div
          className="recommendation-loading"
          aria-busy="true"
          aria-label="Loading recommendations"
        >
          <i />
          <i />
          <i />
        </div>
      ) : (
        <>
          {view === 'discover' && (
            <Discover
              recommendations={snapshot.recommendations}
              category={category}
              setCategory={setCategory}
              recordFeedback={recordFeedback}
              recordImpression={recordImpression}
            />
          )}
          {view === 'preferences' && (
            <Preferences
              preferences={snapshot.preferences}
              feedbackCount={snapshot.feedbackCount}
              onChange={setPreferences}
              onClear={clearPersonalization}
            />
          )}
          {view === 'methodology' && <Methodology variant={snapshot.experiment.variant} />}
        </>
      )}
      <footer className="recommendation-footer">
        Catalog metadata is curated and versioned with the dashboard. Always verify live project
        details before taking action.
      </footer>
    </div>
  );
}

export default memo(RecommendationDashboard);
