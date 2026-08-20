import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeFeedback,
  assignVariant,
  clusterPersona,
  predictChurn,
  workflowSequences,
} from '../src/engine.js';
import { deriveSubjectId, sanitizeEvent, sanitizeProperties } from '../src/privacy.js';
import { AnalyticsStore } from '../src/store.js';

const now = Date.parse('2026-08-20T10:00:00.000Z');
const subject = 'a'.repeat(64);

function event(id, tab = 'builder', overrides = {}) {
  return {
    id,
    type: 'navigation',
    name: `view:${tab}`,
    occurredAt: new Date(now).toISOString(),
    sessionId: 'browser-session',
    properties: { tab },
    ...overrides,
  };
}

test('pseudonymizes client IDs with a deployment salt', () => {
  const one = deriveSubjectId('anonymous-client-1', 'salt-a');
  const two = deriveSubjectId('anonymous-client-1', 'salt-b');
  assert.equal(one.length, 64);
  assert.notEqual(one, two);
  assert.equal(deriveSubjectId('short', 'salt'), null);
});

test('removes identifiers and arbitrary properties at ingestion', () => {
  assert.deepEqual(
    sanitizeProperties({
      tab: 'builder',
      address: `G${'A'.repeat(55)}`,
      source: `G${'B'.repeat(55)}`,
      arbitrary: 'value',
    }),
    { tab: 'builder' }
  );
  assert.equal(
    sanitizeEvent({ ...event('one'), name: `S${'A'.repeat(55)}` }, now).name,
    'sensitive_value_removed'
  );
});

test('requires consent before accepting events', () => {
  const store = new AnalyticsStore();
  assert.deepEqual(store.ingest(subject, [event('one')], now), {
    accepted: 0,
    rejected: 1,
    duplicates: 0,
    reason: 'consent_required',
  });
});

test('deduplicates events and builds a cross-session profile', () => {
  const store = new AnalyticsStore();
  store.setConsent(subject, { usage: true, personalization: true }, now);
  assert.deepEqual(
    store.ingest(subject, [event('one'), event('one'), event('two', 'contracts')], now),
    {
      accepted: 2,
      rejected: 0,
      duplicates: 1,
    }
  );
  const profile = store.profile(subject, now);
  assert.equal(profile.eventCount, 2);
  assert.equal(profile.sessionCount, 1);
  assert.equal(profile.segment.persona, 'developer');
  assert.ok(profile.recommendations.length > 0);
});

test('enforces retention and per-subject contribution bounds', () => {
  const store = new AnalyticsStore({ retentionDays: 30, maxEventsPerSubject: 2 });
  store.setConsent(subject, { usage: true }, now);
  store.ingest(subject, [event('one'), event('two'), event('three')], now);
  assert.equal(store.profile(subject, now).eventCount, 2);
  const expired = event('expired', 'overview', { occurredAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(store.ingest(subject, [expired], now).rejected, 1);
});

test('withdrawal erases the complete subject record', () => {
  const store = new AnalyticsStore();
  store.setConsent(subject, { usage: true, personalization: true }, now);
  store.ingest(subject, [event('one')], now);
  store.setConsent(subject, { usage: false }, now);
  assert.equal(store.profile(subject, now), null);
  assert.equal(store.exportSubject(subject), null);
});

test('returns noisy aggregates without raw identifiers', () => {
  const store = new AnalyticsStore();
  store.setConsent(subject, { usage: true }, now);
  store.ingest(subject, [event('one')], now);
  const aggregate = store.aggregate(1);
  assert.equal(aggregate.noiseApplied, true);
  assert.equal(aggregate.epsilon, 1);
  assert.equal(JSON.stringify(aggregate).includes(subject), false);
});

test('assigns experiments only with personalization consent', () => {
  const store = new AnalyticsStore();
  const experiment = {
    id: 'layout',
    active: true,
    variants: [
      { id: 'control', weight: 1 },
      { id: 'cards', weight: 1 },
    ],
  };
  store.setConsent(subject, { usage: true, personalization: false }, now);
  assert.equal(store.assignment(subject, experiment, assignVariant), null);
  store.setConsent(subject, { usage: true, personalization: true }, now);
  const first = store.assignment(subject, experiment, assignVariant);
  assert.deepEqual(store.assignment(subject, experiment, assignVariant), first);
});

test('analyzes feedback sentiment without storing feedback text', () => {
  assert.deepEqual(analyzeFeedback('The wallet documentation is clear and helpful'), {
    sentiment: 'positive',
    score: 2,
    topics: ['wallet', 'documentation'],
  });
  assert.equal(analyzeFeedback('The transaction flow is confusing and slow').sentiment, 'negative');
});

test('clusters personas, predicts churn, and models workflow sequences', () => {
  const events = [
    event('one', 'builder', { sessionId: 'session-a' }),
    event('two', 'contracts', {
      sessionId: 'session-a',
      occurredAt: new Date(now + 1_000).toISOString(),
    }),
    event('three', 'faucet', {
      sessionId: 'session-a',
      occurredAt: new Date(now + 2_000).toISOString(),
    }),
  ].map((value) => sanitizeEvent(value, now + 3_000));
  assert.equal(clusterPersona(events).persona, 'developer');
  assert.equal(workflowSequences(events)[0].path, 'builder→contracts');
  assert.equal(predictChurn(events, now + 40 * 86_400_000).risk, 'high');
});

test('supports the configured concurrent subject capacity', () => {
  const store = new AnalyticsStore({ maxSubjects: 100_000 });
  for (let index = 0; index < 100_000; index += 1) {
    store.setConsent(index.toString(16).padStart(64, '0'), { usage: true }, now + index);
  }
  assert.equal(store.operationalMetrics().subjects, 100_000);
  assert.equal(store.operationalMetrics().capacitySubjects, 100_000);
});
