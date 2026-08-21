import assert from 'node:assert/strict'
import test from 'node:test'
import { assess, createFraudServer, MAX_BATCH, validateTx } from './server.mjs'

async function withServer(run) {
  const server = createFraudServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('reports health and Prometheus metrics', () =>
  withServer(async (base) => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200)
    const metrics = await (await fetch(`${base}/metrics`)).text()
    assert.match(metrics, /fraud_requests_total/)
  }))

test('serves fraud snapshots and assesses batches', () =>
  withServer(async (base) => {
    const snapshot = await (await fetch(`${base}/v1/fraud/testnet/snapshot`)).json()
    assert.equal(snapshot.state, 'live')
    assert.ok(snapshot.assessments.length >= 1)

    const response = await fetch(`${base}/v1/fraud/assess`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        network: 'testnet',
        items: [
          {
            id: 'svc-1',
            source: `G${'A'.repeat(55)}`,
            destination: `G${'M'.repeat(55)}`,
            amount: 0.000001,
            asset: 'XLM',
            timestamp: new Date().toISOString(),
            operation: 'payment',
            memo: 'guaranteed investment return',
            signerCount: 1,
          },
        ],
        intel: [
          {
            address: `G${'M'.repeat(55)}`,
            label: 'scam',
            category: 'investment-scam',
            confidence: 0.97,
            source: 'test',
            lastUpdated: '2026-08-21',
            revoked: false,
          },
        ],
      }),
    })
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.count, 1)
    assert.ok(payload.assessments[0].score >= 45)
  }))

test('ingests threat intelligence entries', () =>
  withServer(async (base) => {
    const response = await fetch(`${base}/v1/fraud/intel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        network: 'testnet',
        entries: [
          {
            address: `G${'P'.repeat(55)}`,
            category: 'phishing',
            source: 'unit-test',
            confidence: 0.9,
            lastUpdated: '2026-08-21',
          },
        ],
      }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).accepted, 1)
  }))

test(`accepts a ${MAX_BATCH.toLocaleString()} transaction batch within the API limit`, () =>
  withServer(async (base) => {
    const now = new Date().toISOString()
    const items = Array.from({ length: Math.min(MAX_BATCH, 2000) }, (_, i) => ({
      id: `load-${i}`,
      source: `G${'A'.repeat(55)}`,
      destination: `G${'B'.repeat(55)}`,
      amount: 1,
      asset: 'XLM',
      timestamp: now,
      operation: 'payment',
      signerCount: 1,
    }))
    const started = performance.now()
    const response = await fetch(`${base}/v1/fraud/assess`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).count, items.length)
    assert.ok(performance.now() - started < 5000)
  }))

test('rejects malformed batches safely', () =>
  withServer(async (base) => {
    const invalid = await fetch(`${base}/v1/fraud/assess`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ id: 'x' }] }),
    })
    assert.equal(invalid.status, 400)
  }))

test('local assess helper flags scam memos', () => {
  const result = assess({
    id: 'local',
    source: 'GAAA',
    destination: 'GBBB',
    amount: 1,
    timestamp: new Date().toISOString(),
    memo: 'verify wallet seed phrase',
  })
  assert.ok(result.signals.some((signal) => signal.ruleId === 'NLP-001'))
  assert.equal(validateTx({ id: 'ok', source: 'a', destination: 'b', amount: 1, timestamp: new Date().toISOString() }, 0), null)
})
