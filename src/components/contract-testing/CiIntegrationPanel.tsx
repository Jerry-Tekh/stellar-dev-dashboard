import React from 'react';
import { buttonStyle, cardStyle, codeBlockStyle, mutedStyle, primaryButtonStyle } from './styles';

export default function CiIntegrationPanel({
  workflowYaml,
  onDownload,
  onCopy,
}: {
  workflowYaml: string;
  onDownload: () => void;
  onCopy: () => void;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2>CI/CD integration</h2>
            <p style={mutedStyle}>
              A ready-to-commit GitHub Actions workflow that builds the contract, runs the generated test suite, and
              runs <code>cargo-mutants</code> as an advisory (non-blocking) step.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={buttonStyle} onClick={onCopy}>
              Copy YAML
            </button>
            <button style={primaryButtonStyle} onClick={onDownload}>
              Download workflow
            </button>
          </div>
        </div>
      </div>
      <pre style={codeBlockStyle}>{workflowYaml}</pre>
    </section>
  );
}
