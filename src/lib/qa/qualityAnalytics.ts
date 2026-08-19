export interface CoverageGap {
  file: string;
  coverage: number;
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

export interface HighRiskArea {
  path: string;
  churn: 'low' | 'medium' | 'high';
  complexity: 'low' | 'medium' | 'high' | 'critical';
  bugHistory: number;
  riskFactor: number;
}

export interface FlakyTest {
  id: string;
  name: string;
  suite: string;
  flakeRate: number;
  status: 'active' | 'quarantined';
  quarantinedAt: string | null;
}

export interface QAStats {
  qualityScore: number;
  overallCoverage: number;
  coverageByType: {
    unit: number;
    integration: number;
    e2e: number;
    visual: number;
    performance: number;
  };
  gaps: CoverageGap[];
  highRiskAreas: HighRiskArea[];
  flakyTests: FlakyTest[];
}

export const initialGaps: CoverageGap[] = [
  { file: 'src/lib/stellar.ts', coverage: 68.2, risk: 'high', reason: 'Complex SDK interaction paths' },
  { file: 'src/components/dashboard/TransactionBuilder.tsx', coverage: 55.4, risk: 'high', reason: 'Highly interactive state branches' },
  { file: 'src/components/dashboard/BridgeMonitor.tsx', coverage: 72.1, risk: 'medium', reason: 'API polling and fallback branches' },
  { file: 'src/lib/store.ts', coverage: 79.4, risk: 'medium', reason: 'Zustand state transition permutations' }
];

export const initialRiskAreas: HighRiskArea[] = [
  { path: 'src/lib/stellar.ts', churn: 'high', complexity: 'critical', bugHistory: 4, riskFactor: 9.2 },
  { path: 'src/components/dashboard/TransactionBuilder.tsx', churn: 'medium', complexity: 'high', bugHistory: 3, riskFactor: 8.5 },
  { path: 'src/components/dashboard/BridgeMonitor.tsx', churn: 'high', complexity: 'medium', bugHistory: 1, riskFactor: 6.8 },
  { path: 'src/lib/transactionOutbox.ts', churn: 'medium', complexity: 'medium', bugHistory: 2, riskFactor: 6.2 }
];

export const initialFlakyTests: FlakyTest[] = [
  { id: 'e2e-1', name: 'Freighter wallet connector auto-sign flow', suite: 'e2e/wallet.spec.ts', flakeRate: 4.8, status: 'quarantined', quarantinedAt: '2026-08-18T12:00:00Z' },
  { id: 'e2e-2', name: 'Bridge Monitor SSE stream reconnect latency', suite: 'e2e/visual.spec.js', flakeRate: 3.2, status: 'active', quarantinedAt: null },
  { id: 'unit-5', name: 'RateLimiter sliding window burst requests', suite: 'unit/rateLimiter.test.ts', flakeRate: 2.1, status: 'active', quarantinedAt: null }
];
