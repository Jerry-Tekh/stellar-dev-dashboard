import React, { useState } from 'react';
import type { GeneratedTestKind, GeneratedTestSuite } from '../../types/contractTesting';
import { buttonStyle, cardStyle, codeBlockStyle, gridStyle, mutedStyle, primaryButtonStyle } from './styles';

const KIND_LABEL: Record<GeneratedTestKind, string> = {
  unit: 'Unit',
  property: 'Property-based',
  fuzz: 'Fuzz seeds',
  regression: 'Regression',
};
const ALL: GeneratedTestKind[] = ['unit', 'property', 'fuzz', 'regression'];

export default function TestSuitePanel({
  suite,
  onDownload,
}: {
  suite: GeneratedTestSuite;
  onDownload: () => void;
}) {
  const [filter, setFilter] = useState<GeneratedTestKind | 'all'>('all');
  const visible = suite.testCases.filter((tc) => filter === 'all' || tc.kind === filter);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2>Generated test suite ({suite.totalTestCases})</h2>
            <p style={mutedStyle}>
              {ALL.map((kind) => `${suite.byKind[kind]} ${KIND_LABEL[kind].toLowerCase()}`).join(' · ')}
            </p>
          </div>
          <button style={primaryButtonStyle} onClick={onDownload}>
            Download .rs
          </button>
        </div>
        <div role="tablist" aria-label="Filter generated tests by kind" style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button
            role="tab"
            aria-selected={filter === 'all'}
            style={filter === 'all' ? primaryButtonStyle : buttonStyle}
            onClick={() => setFilter('all')}
          >
            All ({suite.totalTestCases})
          </button>
          {ALL.map((kind) => (
            <button
              key={kind}
              role="tab"
              aria-selected={filter === kind}
              style={filter === kind ? primaryButtonStyle : buttonStyle}
              onClick={() => setFilter(kind)}
            >
              {KIND_LABEL[kind]} ({suite.byKind[kind]})
            </button>
          ))}
        </div>
      </div>
      <div style={gridStyle}>
        {visible.map((testCase) => (
          <div key={testCase.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <strong>{testCase.name}</strong>
              <span style={mutedStyle}>{KIND_LABEL[testCase.kind]}</span>
            </div>
            <p style={mutedStyle}>{testCase.description}</p>
            <pre style={codeBlockStyle}>{testCase.code}</pre>
          </div>
        ))}
        {visible.length === 0 && <p style={mutedStyle}>No generated tests match this filter.</p>}
      </div>
    </section>
  );
}
