import React from 'react';
import type { VerificationReport } from '../../types/contractTesting';
import { cardStyle, mutedStyle, pillStyle, statusColor, tableStyle, tableWrapStyle, tdStyle, thStyle } from './styles';

export default function VerificationPanel({ verification }: { verification: VerificationReport }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={cardStyle}>
        <h2>Formal verification report</h2>
        <p style={mutedStyle}>{verification.disclaimer}</p>
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
          <span style={pillStyle(statusColor('pass'))}>{verification.passCount} pass</span>
          <span style={pillStyle(statusColor('fail'))}>{verification.failCount} fail</span>
          <span style={pillStyle(statusColor('needs-review'))}>{verification.needsReviewCount} needs review</span>
        </div>
      </div>
      {verification.obligations.length === 0 ? (
        <div style={cardStyle}>
          <p style={mutedStyle}>No invariants were derived for this contract to check obligations against.</p>
        </div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Function</th>
                <th style={thStyle}>Property</th>
                <th style={thStyle}>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {verification.obligations.map((obligation) => (
                <tr key={obligation.id}>
                  <td style={tdStyle}>
                    <span style={pillStyle(statusColor(obligation.status))}>{obligation.status}</span>
                  </td>
                  <td style={tdStyle}>
                    <code>{obligation.functionName}</code>
                  </td>
                  <td style={tdStyle}>{obligation.property}</td>
                  <td style={{ ...tdStyle, ...mutedStyle }}>{obligation.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
