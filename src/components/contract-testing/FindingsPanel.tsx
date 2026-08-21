import React from 'react';
import type { StaticFinding } from '../../types/contractTesting';
import { cardStyle, mutedStyle, pillStyle, severityColor, tableStyle, tableWrapStyle, tdStyle, thStyle } from './styles';

export default function FindingsPanel({ findings }: { findings: StaticFinding[] }) {
  if (findings.length === 0) {
    return (
      <section style={cardStyle}>
        <h2>Static findings</h2>
        <p style={mutedStyle}>No heuristic findings were raised for this contract. This does not guarantee correctness — see the Formal Verification tab for what was, and wasn&apos;t, checked.</p>
      </section>
    );
  }
  const sorted = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={cardStyle}>
        <h2>Static findings ({findings.length})</h2>
        <p style={mutedStyle}>
          Pattern-based static analysis results — access control, arithmetic, panic-safety, reentrancy shape, and
          storage-growth heuristics. Not a substitute for manual audit.
        </p>
      </div>
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Severity</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Function</th>
              <th style={thStyle}>Finding</th>
              <th style={thStyle}>Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((finding) => (
              <tr key={finding.id}>
                <td style={tdStyle}>
                  <span style={pillStyle(severityColor(finding.severity))}>{finding.severity}</span>
                </td>
                <td style={tdStyle}>{finding.category}</td>
                <td style={tdStyle}>
                  <code>{finding.functionName ?? '—'}</code>
                  {finding.line ? <div style={mutedStyle}>line {finding.line}</div> : null}
                </td>
                <td style={tdStyle}>{finding.message}</td>
                <td style={{ ...tdStyle, ...mutedStyle }}>{finding.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function severityRank(severity: StaticFinding['severity']): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity];
}
