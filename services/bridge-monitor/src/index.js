import express from 'express'
import cors from 'cors'
import { buildSnapshot, CHAINS, BRIDGES } from './engine.js'

const app = express()
const PORT = process.env.PORT || 3099

app.use(cors())
app.use(express.json())

const startTime = Date.now()

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'bridge-monitor',
    uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    latencyMs: Date.now() - startTime,
    networksMonitored: CHAINS.length,
    bridgesSupported: BRIDGES.length,
  })
})

app.get('/api/v1/snapshot', (_req, res) => {
  res.json(buildSnapshot())
})

app.get('/api/v1/networks', (_req, res) => {
  res.json({ networks: CHAINS })
})

app.get('/api/v1/bridges', (_req, res) => {
  res.json({ bridges: BRIDGES })
})

app.get('/api/v1/transfers', (req, res) => {
  const snap = buildSnapshot()
  const status = req.query.status
  let transfers = snap.allTransfers
  if (status) transfers = transfers.filter(t => t.status === status)
  res.json({ transfers, count: transfers.length })
})

app.get('/api/v1/transfers/:id', (req, res) => {
  const snap = buildSnapshot()
  const transfer = snap.allTransfers.find(t => t.id === req.params.id)
  if (!transfer) return res.status(404).json({ error: 'Transfer not found' })
  const prediction = snap.predictions.find(p => p.transferId === transfer.id)
  res.json({ transfer, prediction })
})

app.get('/api/v1/alerts', (req, res) => {
  const snap = buildSnapshot()
  const severity = req.query.severity
  let alerts = snap.securityAlerts
  if (severity) alerts = alerts.filter(a => a.severity === severity)
  res.json({ alerts, count: alerts.length })
})

app.get('/api/v1/analytics/congestion', (_req, res) => {
  const snap = buildSnapshot()
  res.json({ forecasts: snap.congestionForecasts })
})

app.get('/api/v1/analytics/predictions', (_req, res) => {
  const snap = buildSnapshot()
  res.json({ predictions: snap.predictions })
})

app.get('/api/v1/routing/suggestions', (_req, res) => {
  const snap = buildSnapshot()
  res.json({ suggestions: snap.routingSuggestions })
})

app.get('/api/v1/routing/suggest', (req, res) => {
  const { source, dest, asset = 'USDC', amount = '10000' } = req.query
  if (!source || !dest) {
    return res.status(400).json({ error: 'source and dest query params required' })
  }
  const snap = buildSnapshot()
  const suggestion = snap.routingSuggestions.find(
    s => s.sourceChain === source && s.destinationChain === dest
  ) ?? snap.routingSuggestions[0]
  res.json({ suggestion, amountUsd: Number(amount), asset })
})

app.get('/api/v1/security/scan/:bridgeId', (req, res) => {
  const snap = buildSnapshot()
  const alerts = snap.securityAlerts.filter(a => a.bridgeId === req.params.bridgeId)
  res.json({ bridgeId: req.params.bridgeId, alerts, scannedAt: Date.now() })
})

app.get('/api/v1/liquidity', (_req, res) => {
  const snap = buildSnapshot()
  res.json({ pools: snap.liquidityPools })
})

app.get('/api/v1/reports/performance', (_req, res) => {
  const snap = buildSnapshot()
  res.json({ report: snap.performanceReport })
})

app.post('/api/v1/transfers/monitor', (req, res) => {
  const { transferId, sourceChain, destinationChain, protocol, amountUsd } = req.body ?? {}
  const id = transferId ?? `mon-${Date.now()}`
  res.status(201).json({
    monitoring: true,
    transferId: id,
    sourceChain: sourceChain ?? 'stellar',
    destinationChain: destinationChain ?? 'ethereum',
    protocol: protocol ?? 'allbridge',
    amountUsd: amountUsd ?? 0,
    message: 'Transfer added to monitoring queue',
  })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(PORT, () => {
  console.log(`Bridge monitor service listening on http://localhost:${PORT}`)
})
