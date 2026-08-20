import { describe, expect, it } from 'vitest';
import type { BehaviorEvent } from '../../types/behaviorAnalytics';
import {
  addLaplaceNoise,
  buildPrivateAggregates,
  containsSensitiveValue,
  pruneEvents,
  sanitizeEventName,
  sanitizeEventProperties,
} from './privacy';

function event(overrides: Partial<BehaviorEvent> = {}): BehaviorEvent {
  return {
    id: 'event-1',
    type: 'navigation',
    name: 'view:overview',
    occurredAt: new Date().toISOString(),
    sessionId: 'session-1',
    properties: { tab: 'overview' },
    ...overrides,
  };
}

describe('behavior analytics privacy', () => {
  it('keeps only allow-listed primitive properties', () => {
    expect(
      sanitizeEventProperties({
        tab: 'builder',
        outcome: 'success',
        rating: 5,
        ignored: 'value',
        nested: { unsafe: true },
      })
    ).toEqual({ tab: 'builder', outcome: 'success', rating: 5 });
  });

  it('rejects sensitive keys even when their values look harmless', () => {
    expect(
      sanitizeEventProperties({
        address: 'redacted',
        wallet: 'freighter',
        publicKey: 'not-a-key',
        tab: 'account',
      })
    ).toEqual({ tab: 'account' });
  });

  it('rejects Stellar account, seed, and transaction hash values', () => {
    const account = `G${'A'.repeat(55)}`;
    const seed = `S${'B'.repeat(55)}`;
    const hash = 'a'.repeat(64);
    expect(containsSensitiveValue(account)).toBe(true);
    expect(containsSensitiveValue(seed)).toBe(true);
    expect(containsSensitiveValue(hash)).toBe(true);
    expect(sanitizeEventProperties({ source: account, feature: 'builder' })).toEqual({
      feature: 'builder',
    });
  });

  it('normalizes names to bounded non-identifying identifiers', () => {
    expect(sanitizeEventName(' Recommendation Opened! ')).toBe('recommendation_opened');
    expect(sanitizeEventName('***')).toBe('unknown');
    expect(sanitizeEventName('x'.repeat(100))).toHaveLength(64);
  });

  it('removes sensitive identifiers supplied as event names', () => {
    expect(sanitizeEventName(`G${'A'.repeat(55)}`)).toBe('sensitive_value_removed');
    expect(sanitizeEventName('a'.repeat(64))).toBe('sensitive_value_removed');
  });

  it('prunes expired and future events', () => {
    const now = Date.parse('2026-08-20T12:00:00.000Z');
    const events = [
      event({ id: 'expired', occurredAt: '2026-07-01T00:00:00.000Z' }),
      event({ id: 'retained', occurredAt: '2026-08-19T00:00:00.000Z' }),
      event({ id: 'future', occurredAt: '2026-08-21T00:00:00.000Z' }),
    ];
    expect(pruneEvents(events, now).map((item) => item.id)).toEqual(['retained']);
  });

  it('caps retained events to protect storage and analysis latency', () => {
    const events = Array.from({ length: 2_100 }, (_, index) => event({ id: String(index) }));
    const retained = pruneEvents(events);
    expect(retained).toHaveLength(2_000);
    expect(retained[0]?.id).toBe('100');
  });

  it('applies bounded Laplace noise to count metrics', () => {
    expect(addLaplaceNoise(10, 1, () => 0.75)).toBe(11);
    expect(addLaplaceNoise(0, 1, () => 0.01)).toBe(0);
    expect(addLaplaceNoise(Number.NaN)).toBe(0);
    expect(addLaplaceNoise(5, 0)).toBe(0);
  });

  it('creates private aggregates without exposing event properties', () => {
    const events = [
      event(),
      event({
        id: '2',
        type: 'transaction_workflow',
        properties: { workflow: 'payment', outcome: 'success' },
      }),
    ];
    const aggregates = buildPrivateAggregates(events, 1, () => 0.75);
    expect(aggregates.map((item) => item.metric)).toEqual([
      'events',
      'sessions',
      'navigation',
      'successful_workflows',
    ]);
    expect(aggregates.every((item) => item.noiseApplied && item.epsilon === 1)).toBe(true);
    expect(JSON.stringify(aggregates)).not.toContain('payment');
  });
});
