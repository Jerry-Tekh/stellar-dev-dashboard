import assert from 'node:assert/strict';
import test from 'node:test';
import { createSentimentServer, MAX_BATCH } from './server.mjs';
async function withServer(run) {
  const server = createSentimentServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test('reports health and Prometheus metrics', () =>
  withServer(async (base) => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(metrics, /sentiment_requests_total/);
  }));
test('validates, ingests, analyzes, and serves sentiment snapshots', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/v1/sentiment/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        network: 'testnet',
        items: [
          {
            id: 'one',
            source: 'news',
            language: 'en',
            text: 'Stellar adoption growth is strong and bullish',
            publishedAt: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(response.status, 202);
    const snapshot = await (await fetch(`${base}/v1/sentiment/testnet/snapshot`)).json();
    assert.equal(snapshot.state, 'live');
    assert.equal(snapshot.recentDocuments[0].label, 'bullish');
    assert.equal(snapshot.recentDocuments[0].modelVersion, 'stellar-lexicon-ensemble-1.0.0');
  }));
test(`accepts a ${MAX_BATCH.toLocaleString()} document batch within the API limit`, () =>
  withServer(async (base) => {
    const now = new Date().toISOString(),
      items = Array.from({ length: MAX_BATCH }, (_, i) => ({
        id: `load-${i}`,
        source: i % 2 ? 'reddit' : 'x',
        language: 'en',
        text: 'Stellar network growth is strong',
        publishedAt: now,
      })),
      started = performance.now();
    const response = await fetch(`${base}/v1/sentiment/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).accepted, MAX_BATCH);
    assert.ok(performance.now() - started < 5000);
  }));
test('rejects malformed and oversized logical batches safely', () =>
  withServer(async (base) => {
    const invalid = await fetch(`${base}/v1/sentiment/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: 'x', source: 'unknown', text: 'x', publishedAt: 'bad' }],
      }),
    });
    assert.equal(invalid.status, 400);
    const tooMany = await fetch(`${base}/v1/sentiment/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: Array(MAX_BATCH + 1).fill({}) }),
    });
    assert.equal(tooMany.status, 400);
  }));
