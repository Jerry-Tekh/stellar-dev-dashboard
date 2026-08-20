import type {
  AnalyticsConsent,
  AnalyticsExport,
  AnalyticsSnapshot,
  AnalyticsStorageState,
  BehaviorEvent,
  ExperimentAssignment,
  ExperimentDefinition,
  TrackEventInput,
  RemoteSyncState,
} from '../../types/behaviorAnalytics';
import { behaviorAnalyticsApi, initialRemoteState, type BehaviorAnalyticsApi } from './remote';
import {
  buildRecommendations,
  calculateExperimentResults,
  assignExperiment,
  summarizeBehavior,
} from './engine';
import {
  buildPrivateAggregates,
  isValidTrackInput,
  pruneEvents,
  RETENTION_DAYS,
  sanitizeEventName,
  sanitizeEventProperties,
} from './privacy';

const STORAGE_KEY = 'stellar:behavior-analytics:v1';
const POLICY_VERSION = 1;

const DEFAULT_CONSENT: AnalyticsConsent = {
  status: 'pending',
  usage: false,
  personalization: false,
  updatedAt: null,
  policyVersion: POLICY_VERSION,
};

const EMPTY_SEGMENT = {
  persona: 'explorer' as const,
  experience: 'new' as const,
  engagement: 'casual' as const,
  confidence: 0.5,
  signals: ['No consented behavior has been analyzed'],
  updatedAt: new Date(0).toISOString(),
};

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function safeParseState(raw: string | null): AnalyticsStorageState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AnalyticsStorageState>;
    if (value.schemaVersion !== 1 || typeof value.pseudonymousId !== 'string') return null;
    if (!value.consent || !['pending', 'granted', 'denied'].includes(value.consent.status))
      return null;
    return {
      schemaVersion: 1,
      pseudonymousId: value.pseudonymousId,
      consent: {
        status: value.consent.status,
        usage: Boolean(value.consent.usage),
        personalization: Boolean(value.consent.personalization),
        updatedAt: typeof value.consent.updatedAt === 'string' ? value.consent.updatedAt : null,
        policyVersion: POLICY_VERSION,
      },
      events: Array.isArray(value.events) ? value.events : [],
      assignments: Array.isArray(value.assignments) ? value.assignments : [],
    };
  } catch {
    return null;
  }
}

function initialState(): AnalyticsStorageState {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = safeParseState(localStorage.getItem(STORAGE_KEY));
      if (stored) return { ...stored, events: pruneEvents(stored.events) };
    } catch {
      // Storage may be unavailable in privacy mode; the service remains in memory.
    }
  }
  return {
    schemaVersion: 1,
    pseudonymousId: newId('visitor'),
    consent: { ...DEFAULT_CONSENT },
    events: [],
    assignments: [],
  };
}

export class BehaviorAnalyticsService {
  private state: AnalyticsStorageState;
  private readonly sessionId = newId('session');
  private listeners = new Set<() => void>();
  private remoteSync: RemoteSyncState;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    state?: AnalyticsStorageState,
    private readonly api: BehaviorAnalyticsApi = behaviorAnalyticsApi
  ) {
    this.state = state
      ? { ...state, events: pruneEvents(state.events), assignments: [...state.assignments] }
      : initialState();
    this.remoteSync = initialRemoteState(api.enabled);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConsent(): AnalyticsConsent {
    return { ...this.state.consent };
  }

  setConsent(usage: boolean, personalization: boolean): AnalyticsConsent {
    const now = new Date().toISOString();
    const previousId = this.state.pseudonymousId;
    this.state.consent = {
      status: usage ? 'granted' : 'denied',
      usage,
      personalization: usage && personalization,
      updatedAt: now,
      policyVersion: POLICY_VERSION,
    };
    if (!usage) {
      this.state.events = [];
      this.state.assignments = [];
      this.state.pseudonymousId = newId('visitor');
      if (this.api.enabled) void this.api.erase(previousId).catch(() => undefined);
    }
    this.persistAndNotify();
    if (usage) this.scheduleRemoteSync();
    return this.getConsent();
  }

  track(input: TrackEventInput): BehaviorEvent | null {
    if (!isValidTrackInput(input) || !this.state.consent.usage) return null;
    const event: BehaviorEvent = {
      id: newId('event'),
      type: input.type,
      name: sanitizeEventName(input.name),
      occurredAt: new Date().toISOString(),
      sessionId: this.sessionId,
      properties: sanitizeEventProperties(input.properties),
    };
    this.state.events = pruneEvents([...this.state.events, event]);
    this.persistAndNotify();
    this.scheduleRemoteSync();
    return { ...event, properties: { ...event.properties } };
  }

  getSnapshot(now = Date.now()): AnalyticsSnapshot {
    const events = this.state.consent.usage ? pruneEvents(this.state.events, now) : [];
    const summary = events.length
      ? summarizeBehavior(events, now)
      : {
          eventCount: 0,
          sessionCount: 0,
          activeDays: 0,
          topFeatures: [],
          frictionPoints: [],
          segment: { ...EMPTY_SEGMENT, updatedAt: new Date(now).toISOString() },
          firstEventAt: null,
          lastEventAt: null,
        };
    const recommendations = this.state.consent.personalization ? buildRecommendations(summary) : [];
    const retainedUntil = summary.lastEventAt
      ? new Date(
          Date.parse(summary.lastEventAt) + RETENTION_DAYS * 24 * 60 * 60 * 1_000
        ).toISOString()
      : null;
    const serialized = JSON.stringify(this.state);

    return {
      consent: this.getConsent(),
      summary,
      recommendations,
      experiments: calculateExperimentResults(events, this.state.assignments),
      privateAggregates: buildPrivateAggregates(events),
      storageBytes: new Blob([serialized]).size,
      retainedUntil,
      remoteSync: { ...this.remoteSync },
    };
  }

  getExperimentAssignment(experiment: ExperimentDefinition): ExperimentAssignment | null {
    if (!this.state.consent.personalization) return null;
    const assignment = assignExperiment(
      experiment,
      this.state.pseudonymousId,
      this.state.assignments
    );
    if (
      assignment &&
      !this.state.assignments.some((item) => item.experimentId === assignment.experimentId)
    ) {
      this.state.assignments = [...this.state.assignments, assignment];
      this.persistAndNotify();
    }
    return assignment ? { ...assignment } : null;
  }

  recordExperimentExposure(experimentId: string, variantId: string): BehaviorEvent | null {
    return this.track({
      type: 'feature_use',
      name: `experiment_exposure:${experimentId}`,
      properties: { variant: variantId, feature: experimentId },
    });
  }

  recordExperimentConversion(experimentId: string, variantId: string): BehaviorEvent | null {
    return this.track({
      type: 'feature_use',
      name: `experiment_conversion:${experimentId}`,
      properties: { variant: variantId, feature: experimentId },
    });
  }

  exportData(): AnalyticsExport {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      consent: this.getConsent(),
      events: this.state.events.map((event) => ({ ...event, properties: { ...event.properties } })),
      assignments: this.state.assignments.map((assignment) => ({ ...assignment })),
    };
  }

  eraseData(): void {
    const previousId = this.state.pseudonymousId;
    this.state = {
      schemaVersion: 1,
      pseudonymousId: newId('visitor'),
      consent: { ...DEFAULT_CONSENT },
      events: [],
      assignments: [],
    };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // The in-memory copy has still been erased.
      }
    }
    if (this.api.enabled) void this.api.erase(previousId).catch(() => undefined);
    this.notify();
  }

  async syncRemote(): Promise<void> {
    if (!this.api.enabled || !this.state.consent.usage) return;
    this.remoteSync = { ...this.remoteSync, status: 'syncing', error: null };
    this.notify();
    try {
      await this.api.updateConsent(this.state.pseudonymousId, this.state.consent);
      await this.api.ingest(this.state.pseudonymousId, this.state.events);
      this.remoteSync = {
        enabled: true,
        status: 'synced',
        lastSyncedAt: new Date().toISOString(),
        error: null,
      };
    } catch {
      this.remoteSync = {
        ...this.remoteSync,
        status: 'error',
        error: 'Remote analytics is temporarily unavailable. Local insights are unaffected.',
      };
    }
    this.notify();
  }

  /** Test and diagnostics helper that never exposes the pseudonymous identifier. */
  getEventCount(): number {
    return this.state.events.length;
  }

  private persistAndNotify(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // Quota and privacy-mode failures degrade to in-memory analytics.
      }
    }
    this.notify();
  }

  private scheduleRemoteSync(): void {
    if (!this.api.enabled || this.syncTimer) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncRemote();
    }, 1_000);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const behaviorAnalytics = new BehaviorAnalyticsService();
