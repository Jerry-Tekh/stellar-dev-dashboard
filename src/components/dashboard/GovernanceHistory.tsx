import React from 'react';
import VirtualList from '../common/VirtualList';
import CopyableValue from './CopyableValue';
import type { NormalizedProposal, ProposalStatus } from '../../lib/governance';

export const HISTORY_ROW_HEIGHT = 92;

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  passed: 'Passed',
  rejected: 'Rejected',
  executed: 'Executed',
  expired: 'Expired',
};

const STATUS_COLOR: Record<ProposalStatus, string> = {
  pending: 'var(--text-muted)',
  active: 'var(--cyan)',
  passed: 'var(--green)',
  rejected: 'var(--red)',
  executed: 'var(--green)',
  expired: 'var(--text-muted)',
};

function StatusBadge({ status }: { status: ProposalStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '999px',
        border: `1px solid ${color}`,
        color,
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.4px',
        whiteSpace: 'nowrap',
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

interface GovernanceHistoryProps {
  proposals: NormalizedProposal[];
  onSelect?: (proposalId: string) => void;
}

/**
 * Read-only, virtualized view of resolved proposals (passed / rejected /
 * executed / expired) for governance transparency and audit purposes.
 */
export default function GovernanceHistory({ proposals, onSelect }: GovernanceHistoryProps) {
  if (proposals.length === 0) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          fontSize: '13px',
        }}
      >
        No resolved proposals yet.
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <VirtualList
        items={proposals}
        rowHeight={HISTORY_ROW_HEIGHT}
        containerStyle={{ height: '480px' }}
      >
        {(proposal: NormalizedProposal, _index: number, isFocused?: boolean) => (
          <div
            role="button"
            tabIndex={-1}
            onClick={() => onSelect?.(proposal.id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '12px',
              alignItems: 'center',
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              height: '100%',
              boxSizing: 'border-box',
              cursor: onSelect ? 'pointer' : 'default',
              background: isFocused ? 'var(--bg-hover)' : 'transparent',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  #{proposal.id} {proposal.title}
                </span>
                <StatusBadge status={proposal.status} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                for {proposal.votes.for} · against {proposal.votes.against}
                {proposal.votes.abstain !== '0' ? ` · abstain ${proposal.votes.abstain}` : ''} · quorum {proposal.quorumProgress.met ? 'met' : 'not met'}
              </div>
              {proposal.proposer && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  proposer:{' '}
                  <CopyableValue
                    value={proposal.proposer}
                    title="Copy proposer address"
                    textStyle={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                  >
                    {proposal.proposer}
                  </CopyableValue>
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
              closed at ledger {proposal.deadlineLedger}
            </div>
          </div>
        )}
      </VirtualList>
    </div>
  );
}
