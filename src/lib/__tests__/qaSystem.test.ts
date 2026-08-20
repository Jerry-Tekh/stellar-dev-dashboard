import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  localQAEngine,
  localGenerateTests,
  localSelfHealing,
  initialFlakyTests
} from '../qa';

describe('QA Local Library Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('generates test cases successfully for a target file path', () => {
    const result = localGenerateTests('src/lib/stellar.ts');
    expect(result.filePath).toBe('src/lib/stellar.ts');
    expect(result.totalTestCases).toBeGreaterThan(0);
    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.modules[0].testCases[0].code).toContain('describe');
    expect(result.modules[0].testCases[0].code).toContain('fetchAccount');
  });

  it('provides default test cases when path signature is not registered', () => {
    const result = localGenerateTests('src/unknown-file.ts');
    expect(result.filePath).toBe('src/unknown-file.ts');
    expect(result.totalTestCases).toBe(2);
    expect(result.modules[0].functionName).toBe('defaultExport');
  });

  it('manages self healing log generation and simulation', () => {
    const originalLogs = localSelfHealing.getLogs().length;
    const healed = localSelfHealing.simulateHealing('e2e-9', 'button[name="save"]', 'tests/e2e/settings.spec.ts');
    
    expect(localSelfHealing.getLogs().length).toBe(originalLogs + 1);
    expect(healed.originalSelector).toBe('button[name="save"]');
    expect(healed.healedSelector).toBe("button:has-text('save')");
    expect(healed.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('orchestrates local QA engine snapshot state', () => {
    const snapshot = localQAEngine.getSnapshot();
    expect(snapshot.qualityScore).toBe(88.5);
    expect(snapshot.overallCoverage).toBe(82.4);
    expect(snapshot.flakySummary.total).toBe(initialFlakyTests.length);
  });

  it('updates flaky test statuses and toggles quarantine state', () => {
    const testId = initialFlakyTests[0].id;
    const originalStatus = initialFlakyTests[0].status;
    const oppositeStatus = originalStatus === 'quarantined' ? 'active' : 'quarantined';

    const updated = localQAEngine.updateFlakyTestStatus(testId, oppositeStatus);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe(oppositeStatus);

    // Reset back
    localQAEngine.updateFlakyTestStatus(testId, originalStatus);
  });

  it('runs new test scheduling and logs execution outputs', () => {
    const run = localQAEngine.triggerTestRun('manual');
    expect(run.status).toBe('running');
    expect(run.trigger).toBe('manual');

    const logs = localQAEngine.getRunLogs(run.id);
    expect(logs).toContain('Local QA Engine starting run');
    expect(logs).toContain('Smart Scheduling: prioritized');
  });
});
