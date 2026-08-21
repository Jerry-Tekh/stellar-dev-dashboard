import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecommendationServer, rank, validate } from './server.mjs';

const request = {
  profile: {
    pseudonymousId: 'rec_test-persona',
    interests: ['soroban', 'rust'],
    heldAssets: ['xlm'],
    usedItems: [],
    feedback: [],
    preferences: {
      goals: ['build'],
      riskTolerance: 'balanced',
      categories: ['account', 'asset', 'contract', 'service'],
      diversity: 0.7,
      discovery: 0.4,
      personalizationEnabled: true,
    },
  },
  context: { network: 'testnet', online: true },
  limit: 6,
};
async function withServer(run) {
  const server = createRecommendationServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test('ranks deterministic, explainable, diverse recommendations under 200ms', () => {
  const first = rank(request),
    second = rank(request);
  assert.deepEqual(
    first.recommendations.map((item) => item.item.id),
    second.recommendations.map((item) => item.item.id)
  );
  assert.ok(
    first.recommendations.every(
      (item, index) => item.rank === index + 1 && item.reasons.length && item.breakdown
    )
  );
  assert.ok(new Set(first.recommendations.map((item) => item.item.category)).size >= 3);
  assert.ok(first.processingMs < 200);
});
test('validates privacy and request bounds', () => {
  assert.equal(validate(request), null);
  assert.match(validate({ ...request, limit: 100 }), /limit/);
  assert.match(
    validate({ ...request, profile: { ...request.profile, interests: ['G'.repeat(56)] } }),
    /sensitive/
  );
});
test('serves health, catalog, recommendations, and aggregate feedback', () =>
  withServer(async (base) => {
    const health = await (await fetch(`${base}/healthz`)).json();
    assert.equal(health.status, 'ok');
    assert.ok(health.catalogSize >= 10);
    const response = await fetch(`${base}/api/v1/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.state, 'live');
    assert.equal(result.recommendations.length, 6);
    const feedback = await fetch(`${base}/api/v1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'service', value: 'saved', variant: 'balanced' }),
    });
    assert.equal(feedback.status, 202);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(metrics, /recommendation_feedback_total 1/);
  }));
test('rejects malformed payloads without reflecting private input', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/api/v1/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: { pseudonymousId: 'secret-value' } }),
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.doesNotMatch(text, /secret-value/);
    const malformed = await fetch(`${base}/api/v1/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(malformed.status, 400);
  }));
