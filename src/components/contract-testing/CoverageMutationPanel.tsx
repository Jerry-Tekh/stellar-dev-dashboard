import React from 'react';
import type { CoverageReport, MutationReport } from '../../types/contractTesting';
import { cardStyle, gridStyle, mutedStyle, tableStyle, tableWrapStyle, tdStyle, thStyle } from './styles';

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={cardStyle}>
      <div style={mutedStyle}>{label}</div>
      <strong style={{ fontSize: '28px' }}>{value}</strong>
      {hint && <div style={mutedStyle}>{hint}</div>}
    </div>
  );
}

export default function CoverageMutationPanel({ coverage, mutation }: { coverage: CoverageReport; mutation: MutationReport }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={gridStyle}>
        <Metric label="Estimated path coverage" value={`${coverage.estimatedPathCoveragePct}%`} hint="Static estimate, not instrumented coverage" />
        <Metric label="Function coverage" value={`${coverage.coveredFunctions}/${coverage.totalFunctions}`} />
        <Metric label="Branch coverage" value={`${coverage.estimatedBranchCoveragePct}%`} hint={`${coverage.coveredBranches}/${coverage.totalBranches} branches`} />
        <Metric label="Estimated mutation score" value={`${mutation.estimatedMutationScorePct}%`} hint={`${mutation.likelyKilled}/${mutation.totalMutants} mutants likely killed`} />
      </div>
      {coverage.uncoveredFunctions.length > 0 && (
        <div style={cardStyle}>
          <h2>Uncovered functions</h2>
          <p style={mutedStyle}>No generated test case targets these — treat them as the next place to add coverage.</p>
          <ul>
            {coverage.uncoveredFunctions.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={cardStyle}>
        <h2>Mutants</h2>
        <p style={mutedStyle}>
          Estimated from generated-test assertion strength, not an executed <code>cargo-mutants</code> run — the
          generated CI workflow runs the real thing.
        </p>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Function</th>
                <th style={thStyle}>Operator</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Likely killed?</th>
              </tr>
            </thead>
            <tbody>
              {mutation.mutants.map((mutant) => (
                <tr key={mutant.id}>
                  <td style={tdStyle}>
                    <code>{mutant.functionName}</code>
                  </td>
                  <td style={tdStyle}>{mutant.operator}</td>
                  <td style={tdStyle}>{mutant.description}</td>
                  <td style={{ ...tdStyle, color: mutant.likelyKilled ? 'var(--green)' : 'var(--red)' }}>
                    {mutant.likelyKilled ? 'Likely killed' : 'Likely survives'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
