import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getSnapshot,
  getFlakyTests,
  updateFlakyTestStatus,
  getSelfHealingLogs,
  generateTestCases,
  triggerTestRun,
  getTestRuns,
  getRunLogs
} from '../src/engine.js';

describe('QA Monitor Engine', () => {
  test('returns snapshot with valid structure', () => {
    const snapshot = getSnapshot();
    assert.strictEqual(typeof snapshot.qualityScore, 'number');
    assert.strictEqual(typeof snapshot.coverage.overall, 'number');
    assert.strictEqual(Array.isArray(snapshot.coverage.gaps), true);
    assert.strictEqual(Array.isArray(snapshot.riskAssessment.highRiskAreas), true);
  });

  test('manages flaky tests', () => {
    const tests = getFlakyTests();
    assert.strictEqual(Array.isArray(tests), true);
    assert.ok(tests.length > 0);

    const testId = tests[0].id;
    const originalStatus = tests[0].status;
    const newStatus = originalStatus === 'quarantined' ? 'active' : 'quarantined';

    const updated = updateFlakyTestStatus(testId, newStatus);
    assert.strictEqual(updated.status, newStatus);

    // Reset status back
    updateFlakyTestStatus(testId, originalStatus);
  });

  test('gets self-healing logs', () => {
    const logs = getSelfHealingLogs();
    assert.strictEqual(Array.isArray(logs), true);
    assert.ok(logs.length > 0);
    assert.ok(logs[0].originalSelector);
    assert.ok(logs[0].healedSelector);
  });

  test('generates test cases for a file', () => {
    const result = generateTestCases('src/lib/stellar.ts');
    assert.strictEqual(result.filePath, 'src/lib/stellar.ts');
    assert.ok(result.totalTestCases > 0);
    assert.ok(result.modules.length > 0);
    assert.ok(result.modules[0].testCases[0].code.includes('import'));
  });

  test('manages test runs', () => {
    const runsBefore = getTestRuns().length;
    const newRun = triggerTestRun('manual');
    
    assert.strictEqual(newRun.status, 'running');
    assert.strictEqual(newRun.trigger, 'manual');
    
    const runsAfter = getTestRuns().length;
    assert.strictEqual(runsAfter, runsBefore + 1);

    const logs = getRunLogs(newRun.id);
    assert.ok(logs.includes('QA Engine starting run'));
  });
});
