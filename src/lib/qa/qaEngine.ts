import {
  initialGaps,
  initialRiskAreas,
  initialFlakyTests,
  type QAStats,
  type FlakyTest,
  type CoverageGap,
  type HighRiskArea
} from './qualityAnalytics';
import { localSelfHealing, type SelfHealingLog } from './selfHealing';
import { localGenerateTests, type GeneratedTestSuite } from './testGenerator';

export interface TestRun {
  id: string;
  timestamp: string;
  status: 'completed' | 'running' | 'failed';
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  trigger: 'manual' | 'git-push' | 'cron';
  logUrl: string;
}

// Client-side local in-memory DB for fallback mode
class LocalQAEngine {
  private qualityScore = 88.5;
  private overallCoverage = 82.4;
  private coverageByType = {
    unit: 89.1,
    integration: 78.5,
    e2e: 71.2,
    visual: 85.0,
    performance: 88.3
  };
  private gaps: CoverageGap[] = [...initialGaps];
  private highRiskAreas: HighRiskArea[] = [...initialRiskAreas];
  private flakyTests: FlakyTest[] = [...initialFlakyTests];
  private testRuns: TestRun[] = [
    {
      id: 'run-102',
      timestamp: '2026-08-19T18:00:00Z',
      status: 'completed',
      durationMs: 423500,
      summary: { total: 444, passed: 444, failed: 0, skipped: 0 },
      trigger: 'manual',
      logUrl: '/api/v1/qa/runs/run-102/logs'
    },
    {
      id: 'run-101',
      timestamp: '2026-08-19T14:12:05Z',
      status: 'completed',
      durationMs: 435000,
      summary: { total: 444, passed: 443, failed: 1, skipped: 0 },
      trigger: 'git-push',
      logUrl: '/api/v1/qa/runs/run-101/logs'
    }
  ];

  getSnapshot(): QAStats & {
    flakySummary: { total: number; quarantined: number };
    selfHealingSummary: { totalApplied: number; avgConfidence: number };
    recentRuns: TestRun[];
  } {
    const shLogs = localSelfHealing.getLogs();
    const appliedLogs = shLogs.filter(l => l.status === 'applied');
    const avgConfidence = appliedLogs.reduce((acc, curr) => acc + curr.confidence, 0) / (appliedLogs.length || 1);

    return {
      qualityScore: parseFloat(this.qualityScore.toFixed(2)),
      overallCoverage: parseFloat(this.overallCoverage.toFixed(2)),
      coverageByType: this.coverageByType,
      gaps: this.gaps,
      highRiskAreas: this.highRiskAreas,
      flakyTests: this.flakyTests,
      flakySummary: {
        total: this.flakyTests.length,
        quarantined: this.flakyTests.filter(t => t.status === 'quarantined').length
      },
      selfHealingSummary: {
        totalApplied: appliedLogs.length,
        avgConfidence: parseFloat(avgConfidence.toFixed(2))
      },
      recentRuns: this.testRuns
    };
  }

  getFlakyTests(): FlakyTest[] {
    return this.flakyTests;
  }

  updateFlakyTestStatus(id: string, status: 'active' | 'quarantined'): FlakyTest | null {
    const t = this.flakyTests.find(x => x.id === id);
    if (!t) return null;
    t.status = status;
    t.quarantinedAt = status === 'quarantined' ? new Date().toISOString() : null;
    return { ...t };
  }

  getSelfHealingLogs(): SelfHealingLog[] {
    return localSelfHealing.getLogs();
  }

  generateTestCases(filePath: string): GeneratedTestSuite {
    return localGenerateTests(filePath);
  }

  getTestRuns(): TestRun[] {
    return this.testRuns;
  }

  triggerTestRun(triggerType: 'manual' | 'git-push' | 'cron' = 'manual'): TestRun {
    const newRunId = `run-${Math.floor(Math.random() * 900) + 200}`;
    const totalTests = 444;

    const newRun: TestRun = {
      id: newRunId,
      timestamp: new Date().toISOString(),
      status: 'running',
      durationMs: 0,
      summary: { total: totalTests, passed: 0, failed: 0, skipped: 0 },
      trigger: triggerType,
      logUrl: `/api/v1/qa/runs/${newRunId}/logs`
    };

    this.testRuns.unshift(newRun);

    // Simulate execution timing
    const startTime = Date.now();
    const runInterval = setInterval(() => {
      const run = this.testRuns.find(r => r.id === newRunId);
      if (!run) {
        clearInterval(runInterval);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 3000) {
        run.status = 'running';
        run.summary.passed = Math.min(totalTests, Math.floor((elapsed / 3000) * totalTests));
      } else {
        run.status = 'completed';
        run.summary.passed = totalTests;
        run.summary.failed = 0;
        run.durationMs = elapsed;

        // Visual improvements on local score state
        this.overallCoverage = Math.min(95, parseFloat((this.overallCoverage + 0.1).toFixed(2)));
        this.qualityScore = Math.min(100, parseFloat((this.qualityScore + 0.05).toFixed(2)));

        if (Math.random() > 0.5) {
          localSelfHealing.simulateHealing(
            `e2e-${Math.floor(Math.random() * 20) + 5}`,
            `[data-testid='btn-submit-${Math.random().toString(36).substring(7)}']`,
            'tests/e2e/visual.spec.js'
          );
        }

        clearInterval(runInterval);
      }
    }, 1000);

    return newRun;
  }

  getRunLogs(runId: string): string {
    const run = this.testRuns.find(r => r.id === runId);
    if (!run) return 'Run not found';

    return `[${run.timestamp}] Local QA Engine starting run ${run.id}...
[${run.timestamp}] Loading config: vitest.config.js
[${run.timestamp}] Smart Scheduling: prioritized high-risk modules (stellar.ts, transactionOutbox.ts)
[${run.timestamp}] Running unit tests (vitest)...
[${run.timestamp}] Running integration tests (vitest)...
[${run.timestamp}] Running visual regression tests (playwright)...
[${run.timestamp}] Running performance tests...
[${run.timestamp}] Quarantined tests bypassed: ${this.flakyTests.filter(t => t.status === 'quarantined').map(t => t.name).join(', ') || 'None'}
[${run.timestamp}] Run finished. Status: ${run.status}. Duration: ${run.durationMs}ms. Passed: ${run.summary.passed}/${run.summary.total}.`;
  }
}

export const localQAEngine = new LocalQAEngine();
export type { LocalQAEngine };
export type { GeneratedTestSuite, TestCase } from './testGenerator';
export type { SelfHealingLog } from './selfHealing';
