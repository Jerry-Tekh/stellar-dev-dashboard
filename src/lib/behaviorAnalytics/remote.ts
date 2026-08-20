import type {
  AnalyticsConsent,
  BehaviorEvent,
  RemoteSyncState,
  UserSegment,
  PersonalizationRecommendation,
} from '../../types/behaviorAnalytics';

interface RemoteProfile {
  segment: UserSegment;
  recommendations: PersonalizationRecommendation[];
  eventCount: number;
  sessionCount: number;
  generatedAt: string;
}

export class AnalyticsApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'AnalyticsApiError';
  }
}

export class BehaviorAnalyticsApi {
  readonly enabled: boolean;

  constructor(
    private readonly baseUrl = import.meta.env.VITE_ANALYTICS_API_URL || '',
    private readonly fetcher: typeof fetch = fetch
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.enabled = Boolean(this.baseUrl);
  }

  async updateConsent(clientId: string, consent: AnalyticsConsent): Promise<void> {
    if (!this.enabled) return;
    await this.request('/api/v1/consent', clientId, {
      method: 'POST',
      body: JSON.stringify({ usage: consent.usage, personalization: consent.personalization }),
    });
  }

  async ingest(clientId: string, events: BehaviorEvent[]): Promise<void> {
    if (!this.enabled || !events.length) return;
    for (let offset = 0; offset < events.length; offset += 500) {
      await this.request('/api/v1/events/batch', clientId, {
        method: 'POST',
        body: JSON.stringify({ events: events.slice(offset, offset + 500) }),
      });
    }
  }

  async profile(clientId: string): Promise<RemoteProfile | null> {
    if (!this.enabled) return null;
    return this.request<RemoteProfile>('/api/v1/profile', clientId);
  }

  async erase(clientId: string): Promise<void> {
    if (!this.enabled) return;
    await this.request('/api/v1/data', clientId, { method: 'DELETE' });
  }

  private async request<T = unknown>(
    path: string,
    clientId: string,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Analytics-Client': clientId,
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new AnalyticsApiError(
        `Analytics service returned ${response.status}.`,
        response.status
      );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

export function initialRemoteState(enabled: boolean): RemoteSyncState {
  return {
    enabled,
    status: enabled ? 'idle' : 'local-only',
    lastSyncedAt: null,
    error: null,
  };
}

export const behaviorAnalyticsApi = new BehaviorAnalyticsApi();
