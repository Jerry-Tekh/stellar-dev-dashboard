export interface SelfHealingLog {
  id: string;
  timestamp: string;
  testId: string;
  file: string;
  originalSelector: string;
  healedSelector: string;
  confidence: number;
  status: 'applied' | 'failed' | 'pending';
}

const initialLogs: SelfHealingLog[] = [
  {
    id: 'sh-1',
    timestamp: '2026-08-19T10:14:22Z',
    testId: 'e2e-3',
    file: 'tests/e2e/visual.spec.js',
    originalSelector: "button[aria-label='Connect Account']",
    healedSelector: "button:has-text('Connect Account')",
    confidence: 0.95,
    status: 'applied'
  },
  {
    id: 'sh-2',
    timestamp: '2026-08-18T16:45:10Z',
    testId: 'e2e-4',
    file: 'tests/e2e/account.spec.ts',
    originalSelector: '.balance-summary-card',
    healedSelector: "[data-testid='balance-card']",
    confidence: 0.92,
    status: 'applied'
  }
];

export class SelfHealingEngine {
  private logs: SelfHealingLog[] = [...initialLogs];

  getLogs(): SelfHealingLog[] {
    return this.logs;
  }

  addLog(log: Omit<SelfHealingLog, 'id' | 'timestamp'>): SelfHealingLog {
    const newLog: SelfHealingLog = {
      ...log,
      id: `sh-${Math.floor(Math.random() * 9000) + 1000}`,
      timestamp: new Date().toISOString()
    };
    this.logs.unshift(newLog);
    return newLog;
  }

  simulateHealing(testId: string, originalSelector: string, file: string): SelfHealingLog {
    let primaryWord = 'element';
    const quotedMatch = originalSelector.match(/['"]([^'"]+)['"]/);
    if (quotedMatch && quotedMatch[1]) {
      primaryWord = quotedMatch[1];
    } else {
      const words = originalSelector.replace(/[^a-zA-Z0-9]/g, ' ').split(/\s+/);
      const found = words.find(w => w.length > 3 && w !== 'button' && w !== 'input' && w !== 'name' && w !== 'class' && w !== 'type' && w !== 'data');
      if (found) primaryWord = found;
    }
    const healedSelector = `button:has-text('${primaryWord}')`;
    
    return this.addLog({
      testId,
      file,
      originalSelector,
      healedSelector,
      confidence: parseFloat((0.85 + Math.random() * 0.14).toFixed(2)),
      status: 'applied'
    });
  }
}

export const localSelfHealing = new SelfHealingEngine();
