import type { CSSProperties } from 'react';
import type { FindingSeverity, VerificationStatus } from '../../types/contractTesting';

export const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  padding: '16px',
};

export const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  padding: 'var(--content-padding, 24px)',
  color: 'var(--text-primary)',
};

export const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
};

export const mutedStyle: CSSProperties = { color: 'var(--text-secondary)', fontSize: '13px' };

export const tableWrapStyle: CSSProperties = { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' };

export const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' };

export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export const tdStyle: CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export const buttonStyle: CSSProperties = {
  border: '1px solid var(--border-bright)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 14px',
  fontSize: '13px',
  cursor: 'pointer',
};

export const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'var(--cyan)',
  borderColor: 'var(--cyan)',
  color: 'var(--bg-base)',
  fontWeight: 600,
};

export const codeBlockStyle: CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '12px',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '12px',
  overflowX: 'auto',
  whiteSpace: 'pre',
};

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  critical: 'var(--red)',
  high: 'var(--red)',
  medium: 'var(--amber)',
  low: 'var(--cyan)',
  info: 'var(--text-muted)',
};

export function severityColor(severity: FindingSeverity): string {
  return SEVERITY_COLOR[severity];
}

const STATUS_COLOR: Record<VerificationStatus, string> = {
  pass: 'var(--green)',
  fail: 'var(--red)',
  'needs-review': 'var(--amber)',
};

export function statusColor(status: VerificationStatus): string {
  return STATUS_COLOR[status];
}

export function pillStyle(color: string): CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    color,
    border: `1px solid ${color}`,
    background: 'transparent',
  };
}
