import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsStorageState, ExperimentDefinition } from '../../types/behaviorAnalytics';
import { BehaviorAnalyticsService } from './service';

function state(): AnalyticsStorageState {
  return {
    schemaVersion: 1,
    pseudonymousId: 'visitor-test',
    consent: {
      status: 'pending',
      usage: false,
      personalization: false,
      updatedAt: null,
      policyVersion: 1,
    },
    events: [],
    assignments: [],
  };
}

describe('BehaviorAnalyticsService', () => {
  beforeEach(() => localStorage.clear());

  it('does not track before explicit consent', () => {
    const service = new BehaviorAnalyticsService(state());
    expect(
      service.track({ type: 'navigation', name: 'view:overview', properties: { tab: 'overview' } })
    ).toBeNull();
    expect(service.getEventCount()).toBe(0);
  });

  it('tracks sanitized events after usage consent', () => {
    const service = new BehaviorAnalyticsService(state());
    service.setConsent(true, false);
    const result = service.track({
      type: 'navigation',
      name: 'View Account',
      properties: { tab: 'account', address: `G${'A'.repeat(55)}`, ignored: 'private' },
    });
    expect(result?.name).toBe('view_account');
    expect(result?.properties).toEqual({ tab: 'account' });
    expect(service.getEventCount()).toBe(1);
  });

  it('requires usage consent for personalization', () => {
    const service = new BehaviorAnalyticsService(state());
    expect(service.setConsent(false, true)).toMatchObject({
      status: 'denied',
      usage: false,
      personalization: false,
    });
  });

  it('deleting consented usage rotates state and removes events', () => {
    const service = new BehaviorAnalyticsService(state());
    service.setConsent(true, true);
    service.track({ type: 'navigation', name: 'view:builder', properties: { tab: 'builder' } });
    service.setConsent(false, false);
    expect(service.getEventCount()).toBe(0);
    expect(service.getConsent()).toMatchObject({
      status: 'denied',
      usage: false,
      personalization: false,
    });
  });

  it('publishes changes to subscribers', () => {
    const service = new BehaviorAnalyticsService(state());
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    service.setConsent(true, false);
    service.track({ type: 'navigation', name: 'view:overview', properties: { tab: 'overview' } });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    service.eraseData();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns recommendations only with personalization consent', () => {
    const service = new BehaviorAnalyticsService(state());
    service.setConsent(true, false);
    service.track({ type: 'navigation', name: 'view:contracts', properties: { tab: 'contracts' } });
    expect(service.getSnapshot().recommendations).toEqual([]);
    service.setConsent(true, true);
    expect(service.getSnapshot().recommendations.length).toBeGreaterThan(0);
  });

  it('exports a readable copy without its internal pseudonymous identifier', () => {
    const service = new BehaviorAnalyticsService(state());
    service.setConsent(true, true);
    service.track({ type: 'navigation', name: 'view:overview', properties: { tab: 'overview' } });
    const exported = service.exportData();
    expect(exported.schemaVersion).toBe(1);
    expect(exported.events).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain('visitor-test');
  });

  it('erases all state and resets consent to pending', () => {
    const service = new BehaviorAnalyticsService(state());
    service.setConsent(true, true);
    service.track({ type: 'navigation', name: 'view:overview' });
    service.eraseData();
    expect(service.getEventCount()).toBe(0);
    expect(service.getConsent().status).toBe('pending');
  });

  it('gates stable experiment assignment behind personalization consent', () => {
    const experiment: ExperimentDefinition = {
      id: 'layout',
      name: 'Layout',
      active: true,
      variants: [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
      ],
    };
    const service = new BehaviorAnalyticsService(state());
    expect(service.getExperimentAssignment(experiment)).toBeNull();
    service.setConsent(true, true);
    const first = service.getExperimentAssignment(experiment);
    const second = service.getExperimentAssignment(experiment);
    expect(first).toEqual(second);
    expect(service.getSnapshot().experiments).toHaveLength(1);
  });

  it('records exposures and conversions through the sanitized event pipeline', () => {
    const service = new BehaviorAnalyticsService(state());
    service.setConsent(true, true);
    service.recordExperimentExposure('layout', 'cards');
    service.recordExperimentConversion('layout', 'cards');
    expect(service.getEventCount()).toBe(2);
  });
});
