import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { server } from './server.mjs'

let baseUrl

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('exposes health, metrics, and a complete snapshot contract', async () => {
  const healthResponse = await fetch(`${baseUrl}/healthz`, { headers: { 'X-Request-Id': 'health-test' } })
  assert.equal(healthResponse.status, 200)
  assert.equal(healthResponse.headers.get('x-request-id'), 'health-test')
  const health = await healthResponse.json()
  assert.equal(health.status, 'ok')
  assert.equal(health.bufferedSamples, 0)
  assert.ok(health.uptimeSeconds >= 0)

  const snapshotResponse = await fetch(`${baseUrl}/v1/networks/testnet/snapshot`)
  assert.equal(snapshotResponse.status, 200)
  const { data } = await snapshotResponse.json()
  assert.equal(data.network, 'testnet')
  assert.equal(data.health.dimensions.length, 5)
  assert.equal(data.forecast.points.length, 12)
  assert.ok(data.history.length >= 36)

  const metricsResponse = await fetch(`${baseUrl}/metrics`)
  assert.equal(metricsResponse.status, 200)
  assert.match(await metricsResponse.text(), /network_monitor_requests_total/)
})

test('accepts and validates a 10,000-metric batch', async () => {
  const sample = {
    network: 'testnet',
    ledgerSequence: 56_000_100,
    timestamp: new Date().toISOString(),
    closeTimeSeconds: 5.1,
    operationsPerSecond: 125,
    transactionsPerSecond: 48,
    transactionSuccessRate: 99.7,
    transactionLatencyMs: 790,
    capacityUtilization: 44,
    validatorParticipation: 99.2,
    synchronizedValidators: 6,
    totalValidators: 6,
    horizonLatencyMs: 120,
    sorobanLatencyMs: 180,
  }
  const samples = Array.from({ length: 10_000 }, (_, index) => ({
    ...sample,
    id: `load-${index}`,
    ledgerSequence: sample.ledgerSequence + index,
  }))
  const response = await fetch(`${baseUrl}/v1/metrics/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ samples }),
  })
  assert.equal(response.status, 202)
  assert.deepEqual(await response.json(), { data: { accepted: 10_000, buffered: 10_000 } })
})

test('rejects unsafe inputs and computes bounded capacity scenarios', async () => {
  const invalid = await fetch(`${baseUrl}/v1/metrics/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ samples: [{}] }),
  })
  assert.equal(invalid.status, 422)
  const invalidBody = await invalid.json()
  assert.equal(invalidBody.error.code, 'invalid_request')
  assert.doesNotMatch(invalidBody.error.message, /authorization|bearer/i)

  const capacity = await fetch(`${baseUrl}/v1/networks/testnet/capacity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trafficGrowthPercent: 100, validatorLossPercent: 25, targetUtilizationPercent: 70 }),
  })
  assert.equal(capacity.status, 200)
  const capacityBody = await capacity.json()
  assert.ok(capacityBody.data.projectedUtilization > 44)
  assert.ok(['healthy', 'degraded', 'critical'].includes(capacityBody.data.risk))

  const missing = await fetch(`${baseUrl}/v1/not-a-route`)
  assert.equal(missing.status, 404)
})
