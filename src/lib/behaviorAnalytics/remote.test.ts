import { describe, expect, it, vi } from 'vitest';
import type { BehaviorEvent } from '../../types/behaviorAnalytics';
import { AnalyticsApiError, BehaviorAnalyticsApi } from './remote';

function response(body: unknown = {}, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function event(index: number): BehaviorEvent {
  return {
    id: `event-${index}`,
    type: 'navigation',
    name: 'view:overview',
    occurredAt: new Date().toISOString(),
    sessionId: 'session',
    properties: { tab: 'overview' },
  };
}

describe('BehaviorAnalyticsApi', () => {
  it('is disabled when no service URL is configured', async () => {
    const fetcher = vi.fn();
    const api = new BehaviorAnalyticsApi('', fetcher);
    await api.ingest('client-id', [event(1)]);
    expect(api.enabled).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends consent with an anonymous client header', async () => {
    const fetcher = vi.fn().mockResolvedValue(response());
    const api = new BehaviorAnalyticsApi('https://analytics.example/', fetcher);
    await api.updateConsent('anonymous-client', {
      status: 'granted',
      usage: true,
      personalization: true,
      updatedAt: new Date().toISOString(),
      policyVersion: 1,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://analytics.example/api/v1/consent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Analytics-Client': 'anonymous-client' }),
      })
    );
  });

  it('chunks ingestion at the server contribution limit', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response({}, 202)));
    const api = new BehaviorAnalyticsApi('https://analytics.example', fetcher);
    await api.ingest(
      'anonymous-client',
      Array.from({ length: 501 }, (_, index) => event(index))
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetcher.mock.calls[0]![1].body as string);
    const secondBody = JSON.parse(fetcher.mock.calls[1]![1].body as string);
    expect(firstBody.events).toHaveLength(500);
    expect(secondBody.events).toHaveLength(1);
  });

  it('returns a user-safe typed error for service failures', async () => {
    const api = new BehaviorAnalyticsApi(
      'https://analytics.example',
      vi.fn().mockResolvedValue(response({ error: 'internal details' }, 503))
    );
    await expect(api.profile('anonymous-client')).rejects.toEqual(
      expect.objectContaining<Partial<AnalyticsApiError>>({
        name: 'AnalyticsApiError',
        status: 503,
        message: 'Analytics service returned 503.',
      })
    );
  });

  it('handles deletion responses without parsing an empty body', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(undefined, 204));
    const api = new BehaviorAnalyticsApi('https://analytics.example', fetcher);
    await expect(api.erase('anonymous-client')).resolves.toBeUndefined();
  });
});
