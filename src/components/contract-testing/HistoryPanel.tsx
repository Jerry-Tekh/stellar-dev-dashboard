import React from 'react';
import type { AnalysisHistoryEntry } from '../../types/contractTesting';
import { cardStyle, mutedStyle, tableStyle, tableWrapStyle, tdStyle, thStyle } from './styles';

export default function HistoryPanel({ history }: { history: AnalysisHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <section style={cardStyle}>
        <h2>Run history</h2>
        <p style={mutedStyle}>No prior analyses yet in this browser. History is kept locally (last 10 runs).</p>
      </section>
    );
  }
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={cardStyle}>
        <h2>Run history</h2>
        <p style={mutedStyle}>Stored locally in this browser only — nothing here is sent anywhere.</p>
      </div>
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>When</th>
              <th style={thStyle}>Contract</th>
              <th style={thStyle}>Findings</th>
              <th style={thStyle}>Path coverage</th>
              <th style={thStyle}>Mutation score</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.requestId}>
                <td style={tdStyle}>{new Date(entry.generatedAt).toLocaleString()}</td>
                <td style={tdStyle}>
                  <code>{entry.contractName}</code>
                </td>
                <td style={tdStyle}>
                  {entry.findingsCount}
                  {entry.criticalFindingsCount > 0 && (
                    <span style={{ color: 'var(--red)' }}> ({entry.criticalFindingsCount} critical)</span>
                  )}
                </td>
                <td style={tdStyle}>{entry.estimatedPathCoveragePct}%</td>
                <td style={tdStyle}>{entry.estimatedMutationScorePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
