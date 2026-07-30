# Cross-Chain Bridge Monitoring

AI-enhanced bridge monitoring for Stellar and 11+ blockchain networks. Tracks cross-chain transfers, detects security anomalies, forecasts congestion, and suggests optimal routing paths.

## Architecture

```
┌─────────────────────┐     REST API      ┌──────────────────────────┐
│  React Dashboard    │ ◄───────────────► │  bridge-monitor service  │
│  BridgeMonitor.tsx  │   (fallback:      │  services/bridge-monitor/  │
│  useBridgeMonitor   │    local engine)  │  Express on :3099          │
└─────────┬───────────┘                   └────────────┬─────────────┘
          │                                              │
          ▼                                              ▼
┌─────────────────────┐                   ┌──────────────────────────┐
│  src/lib/bridge/    │                   │  Multi-chain data pipeline│
│  monitorEngine      │                   │  ML anomaly detection     │
│  anomalyDetection   │                   │  Security scanner         │
│  predictiveAnalytics│                   │  Routing optimizer        │
│  securityAnalysis   │                   └──────────────────────────┘
│  routingOptimizer   │
└─────────────────────┘
```

## Supported Networks (12)

| Network | Native Asset | Status |
|---------|-------------|--------|
| Stellar | XLM | Primary |
| Ethereum | ETH | Supported |
| Polygon | MATIC | Supported |
| Arbitrum | ETH | Supported |
| Optimism | ETH | Supported |
| Avalanche | AVAX | Supported |
| BNB Chain | BNB | Supported |
| Solana | SOL | Supported |
| Cosmos Hub | ATOM | Supported |
| Polkadot | DOT | Supported |
| NEAR | NEAR | Supported |
| Base | ETH | Supported |

## Supported Bridge Protocols (10)

- **Allbridge** — Stellar ↔ EVM/Solana/NEAR
- **Wormhole** — Stellar ↔ major L1/L2 chains
- **Celer cBridge** — Stellar ↔ EVM/Cosmos
- **Stellar Anchor Bridge** — Stellar ↔ EVM (SEP-24 style)
- **Pendulum / Spacewalk** — Stellar ↔ Polkadot/NEAR
- **LayerZero**, **Stargate**, **Portal**, **deBridge**, **Chainlink CCIP**

## Core Capabilities

### Transaction Tracking
- Real-time monitoring of cross-chain transfer lifecycle
- Status tracking: initiated → source_confirmed → relaying → destination_pending → completed
- Gas cost and slippage analysis

### Security Analysis
- Automated vulnerability scanning (CVE-pattern matching)
- ML anomaly detection (Z-score based transfer/pool analysis)
- MEV and coordinated attack detection
- Liquidity drain monitoring
- Relayer behavior analysis

### Performance Optimization
- Optimal routing suggestions with 20%+ cost savings
- Multi-hop path recommendations
- Bridge congestion forecasting
- Optimal timing windows

### Predictive Analytics
- Transfer completion time predictions (80%+ accuracy target)
- Congestion forecasting (1h and 24h horizons)
- Liquidity shortage anticipation
- Gas price recommendations

## REST API

Start the microservice:

```bash
cd services/bridge-monitor
npm install
npm start          # http://localhost:3099
```

Or via Docker Compose:

```bash
docker compose up bridge-monitor
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health and uptime |
| GET | `/api/v1/snapshot` | Full monitoring snapshot |
| GET | `/api/v1/networks` | Supported blockchain networks |
| GET | `/api/v1/bridges` | Supported bridge protocols |
| GET | `/api/v1/transfers` | All transfers (filter: `?status=relaying`) |
| GET | `/api/v1/transfers/:id` | Single transfer with prediction |
| GET | `/api/v1/alerts` | Security alerts (filter: `?severity=critical`) |
| GET | `/api/v1/analytics/congestion` | Congestion forecasts |
| GET | `/api/v1/analytics/predictions` | Completion predictions |
| GET | `/api/v1/routing/suggestions` | Routing optimization suggestions |
| GET | `/api/v1/routing/suggest?source=stellar&dest=ethereum` | Route for pair |
| GET | `/api/v1/security/scan/:bridgeId` | Vulnerability scan |
| GET | `/api/v1/liquidity` | Liquidity pool snapshots |
| GET | `/api/v1/reports/performance` | Performance report |
| POST | `/api/v1/transfers/monitor` | Add transfer to monitoring |

## Dashboard

Open the **Bridge Monitor** tab in the sidebar (under Tools). The dashboard shows:

- Health score and active transfer count
- Network status grid (12 chains)
- Congestion forecast charts
- Active transfer table with lifecycle status
- Security alerts with severity and confidence
- Routing suggestions with cost savings
- Liquidity pool monitoring
- Protocol performance reports

## Configuration

Set the API URL for the dashboard to connect to the microservice:

```bash
VITE_BRIDGE_MONITOR_URL=http://localhost:3099 npm run dev
```

When the API is unavailable, the dashboard falls back to the local monitoring engine in `src/lib/bridge/`.

## Security Best Practices

1. Monitor bridge contract upgrades and governance proposals
2. Set alerts for liquidity drops exceeding 8% in 24h
3. Compare relayer failure rates across protocols
4. Use routing suggestions to minimize slippage on large transfers
5. Review critical CVE-pattern alerts within 30 seconds
6. Cross-reference anomalies across multiple bridges for coordinated attacks

## Testing

```bash
# Frontend unit tests
npm test -- src/lib/__tests__/bridgeMonitor.test.ts

# Microservice tests
cd services/bridge-monitor && npm test
```

## Performance Standards

| Metric | Target |
|--------|--------|
| Networks monitored | 10+ |
| Anomaly detection latency | < 30 seconds |
| Concurrent transfer monitoring | 1000+ |
| Prediction accuracy | 80%+ |
| Cost savings from routing | 20%+ |
