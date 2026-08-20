import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { AnalyticsStore } from '../src/store.js';

let server;
let baseUrl;

before(async () => {
  const app = createApp({
    store: new AnalyticsStore(),
    salt: 'test-salt',
    adminToken: 'admin-secret',
    allowedOrigins: 'http://localhost:5173',
  });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => new Promise((resolve) => server.close(resolve)));

async function request(path, init = {}, client = 'anonymous-browser-client') {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Analytics-Client': client, ...init.headers },
  });
}

test('health endpoint exposes operational capacity', async () => {
  const response = await request('/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.service, 'behavior-analytics');
  assert.equal(body.capacitySubjects, 100_000);
});

test('event ingestion is rejected before consent', async () => {
  const response = await request(
    '/api/v1/events/batch',
    { method: 'POST', body: JSON.stringify({ events: [] }) },
    'no-consent-client'
  );
  assert.equal(response.status, 403);
});

test('consent, batch ingestion, profile, export, and erasure form one flow', async () => {
  const consent = await request('/api/v1/consent', {
    method: 'POST',
    body: JSON.stringify({ usage: true, personalization: true }),
  });
  assert.equal(consent.status, 200);
  const event = {
    id: 'event-1',
    type: 'navigation',
    name: 'view:builder',
    occurredAt: new Date().toISOString(),
    sessionId: 'session-1',
    properties: { tab: 'builder', address: 'removed' },
  };
  const ingest = await request('/api/v1/events/batch', {
    method: 'POST',
    body: JSON.stringify({ events: [event] }),
  });
  assert.equal(ingest.status, 202);
  assert.equal((await ingest.json()).accepted, 1);
  const profile = await request('/api/v1/profile');
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).segment.persona, 'developer');
  const exported = await request('/api/v1/data-export');
  assert.equal(exported.status, 200);
  assert.equal(JSON.stringify(await exported.json()).includes('address'), false);
  assert.equal((await request('/api/v1/data', { method: 'DELETE' })).status, 204);
  assert.equal((await request('/api/v1/profile')).status, 404);
});

test('batch size and feedback length are bounded', async () => {
  await request(
    '/api/v1/consent',
    { method: 'POST', body: JSON.stringify({ usage: true }) },
    'bounded-client'
  );
  const batch = await request(
    '/api/v1/events/batch',
    { method: 'POST', body: JSON.stringify({ events: Array(501).fill({}) }) },
    'bounded-client'
  );
  assert.equal(batch.status, 400);
  const feedback = await request(
    '/api/v1/feedback/analyze',
    { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(2_001) }) },
    'bounded-client'
  );
  assert.equal(feedback.status, 400);
});

test('feedback analysis requires usage consent', async () => {
  const response = await request(
    '/api/v1/feedback/analyze',
    { method: 'POST', body: JSON.stringify({ text: 'The builder is helpful.' }) },
    'feedback-without-consent'
  );
  assert.equal(response.status, 403);
});

test('aggregate and experiment reports require an admin token', async () => {
  assert.equal((await request('/api/v1/aggregates')).status, 401);
  const response = await request('/api/v1/aggregates', {
    headers: { Authorization: 'Bearer admin-secret' },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).noiseApplied, true);
});

test('unknown routes and invalid clients receive safe errors', async () => {
  assert.equal((await request('/missing')).status, 404);
  assert.equal((await request('/api/v1/profile', {}, 'short')).status, 400);
});
