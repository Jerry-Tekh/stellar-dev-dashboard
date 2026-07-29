import React, { useState, useMemo, type CSSProperties } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { useStore } from '../../lib/store';
import { usePersistedState } from '../../hooks/usePersistedState';
import { isValidContractId } from '../../lib/stellar';
import {
  fetchGovernanceProposals,
  submitGovernanceVote,
  splitProposalsByStatus,
  GOVERNANCE_ADAPTERS,
  simpleVotingAdapter,
  type NormalizedProposal,
  type ProposalStatus,
  type VoteChoice,
} from '../../lib/governance';
import GovernanceHistory from './GovernanceHistory';

// ─── Shared small UI helpers (mirrors ContractInteraction.tsx's conventions) ─

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>{title}</div>
        {subtitle && (
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ padding: '18px' }}>{children}</div>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function textInputStyle(hasError = false): CSSProperties {
  return {
    width: '100%',
    background: 'var(--bg-elevated)',
    border: `1px solid ${hasError ? 'var(--red)' : 'var(--border-bright)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  tone = 'primary',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
}) {
  const palette =
    tone === 'secondary'
      ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-bright)' }
      : tone === 'danger'
      ? { background: 'var(--bg-elevated)', color: 'var(--red)', border: '1px solid var(--red)' }
      : { background: 'var(--cyan)', color: 'var(--bg-base)', border: 'none' };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 16px',
        background: disabled ? 'var(--bg-elevated)' : palette.background,
        color: disabled ? 'var(--text-muted)' : palette.color,
        border: disabled ? '1px solid var(--border)' : palette.border,
        borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        fontSize: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'var(--transition)',
      }}
    >
      {label}
    </button>
  );
}

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
        whiteSpace: 'nowrap',
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'closed';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return 'less than a minute remaining';
}

/** Progress-to-quorum meter: fill is the active accent until quorum is met, then green. */
function QuorumMeter({ progress }: { progress: NormalizedProposal['quorumProgress'] }) {
  const fillColor = progress.met ? 'var(--green)' : 'var(--cyan)';
  const width = `${Math.min(100, progress.percent)}%`;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginBottom: '6px',
        }}
      >
        <span>Quorum {progress.met ? 'met' : 'progress'}</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {progress.totalVotes} / {progress.quorum} ({progress.percent.toFixed(1)}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.min(100, progress.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          height: '8px',
          borderRadius: '999px',
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', width, background: fillColor, transition: 'var(--transition)' }} />
      </div>
    </div>
  );
}

function VoteTallyChart({ proposal }: { proposal: NormalizedProposal }) {
  const data = useMemo(() => {
    const rows = [
      { name: 'For', value: Number(proposal.votes.for), color: 'var(--green)' },
      { name: 'Against', value: Number(proposal.votes.against), color: 'var(--red)' },
    ];
    if (proposal.votes.abstain !== '0') {
      rows.push({ name: 'Abstain', value: Number(proposal.votes.abstain), color: 'var(--text-muted)' });
    }
    return rows;
  }, [proposal]);

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 56)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" stroke="var(--text-muted)" style={{ fontSize: '11px' }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" stroke="var(--text-muted)" style={{ fontSize: '11px' }} width={70} />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '12px',
          }}
          formatter={(value: number) => value.toLocaleString()}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24} label={{ position: 'right', fill: 'var(--text-secondary)', fontSize: 11 }}>
          {data.map((row) => (
            <Cell key={row.name} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ProposalListProps {
  proposals: NormalizedProposal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ProposalList({ proposals, selectedId, onSelect }: ProposalListProps) {
  if (proposals.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        No open proposals.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {proposals.map((proposal) => {
        const isSelected = proposal.id === selectedId;
        return (
          <button
            key={proposal.id}
            onClick={() => onSelect(proposal.id)}
            style={{
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '14px',
              background: isSelected ? 'var(--bg-hover)' : 'var(--bg-elevated)',
              border: `1px solid ${isSelected ? 'var(--cyan-dim)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                #{proposal.id} {proposal.title}
              </span>
              <StatusBadge status={proposal.status} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              for {proposal.votes.for} · against {proposal.votes.against} · {formatDuration(proposal.timeRemaining.secondsRemaining)}
            </div>
            {proposal.myVote && (
              <div style={{ fontSize: '11px', color: 'var(--amber)' }}>
                You voted: {proposal.myVote.choice.toUpperCase()}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface PendingVote {
  proposal: NormalizedProposal;
  choice: VoteChoice;
}

interface ProposalDetailProps {
  proposal: NormalizedProposal | null;
  supportsAbstain: boolean;
  isMainnet: boolean;
  onRequestVote: (choice: VoteChoice) => void;
}

function ProposalDetail({ proposal, supportsAbstain, isMainnet, onRequestVote }: ProposalDetailProps) {
  if (!proposal) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        Select a proposal to see details.
      </div>
    );
  }

  const canVote = (proposal.status === 'active' || proposal.status === 'pending') && !proposal.myVote;
  const choices: VoteChoice[] = supportsAbstain ? ['for', 'against', 'abstain'] : ['for', 'against'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            #{proposal.id} {proposal.title}
          </div>
          <StatusBadge status={proposal.status} />
        </div>
        {proposal.description && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {proposal.description}
          </div>
        )}
        {proposal.metadataUri && (
          <a
            href={proposal.metadataUri}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '11px', color: 'var(--cyan)', display: 'inline-block', marginTop: '6px' }}
          >
            View off-chain proposal metadata
          </a>
        )}
      </div>

      <VoteTallyChart proposal={proposal} />

      <QuorumMeter progress={proposal.quorumProgress} />

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
        Deadline: ledger {proposal.deadlineLedger} —{' '}
        {proposal.timeRemaining.isClosed ? 'voting closed' : formatDuration(proposal.timeRemaining.secondsRemaining)}
      </div>

      {proposal.myVote ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--amber)',
            background: 'rgba(255, 184, 0, 0.08)',
            color: 'var(--amber)',
            fontSize: '12px',
          }}
        >
          You already voted <strong>{proposal.myVote.choice.toUpperCase()}</strong> on this proposal.
        </div>
      ) : canVote ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {isMainnet && (
            <div style={{ fontSize: '11px', color: 'var(--amber)' }}>
              Mainnet mode: voting submission is disabled for safety.
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {choices.map((choice) => (
              <ActionButton
                key={choice}
                label={`Vote ${choice.toUpperCase()}`}
                tone={choice === 'for' ? 'primary' : choice === 'against' ? 'danger' : 'secondary'}
                disabled={isMainnet}
                onClick={() => onRequestVote(choice)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Voting is closed for this proposal.</div>
      )}
    </div>
  );
}

function VoteConfirmDialog({
  pending,
  contractId,
  network,
  secretKey,
  onSecretKeyChange,
  onCancel,
  onConfirm,
  submitting,
  error,
}: {
  pending: PendingVote;
  contractId: string;
  network: string;
  secretKey: string;
  onSecretKeyChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  error: string;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm vote submission"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-bright)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' }}>
          Confirm vote submission
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          You are about to submit a <strong>{pending.choice.toUpperCase()}</strong> vote on proposal{' '}
          <strong>#{pending.proposal.id}</strong> ({pending.proposal.title}) to contract{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{contractId}</span> on <strong>{network}</strong>. This
          builds, signs, and submits a real transaction using the pipeline shared with Contract Interaction.
        </div>
        <LabeledField label="Secret Key (used to sign this vote)">
          <input
            type="password"
            value={secretKey}
            onChange={(e) => onSecretKeyChange(e.target.value)}
            placeholder="S... testnet secret key"
            style={textInputStyle()}
          />
        </LabeledField>
        {error && <div style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <ActionButton label="Cancel" tone="secondary" onClick={onCancel} disabled={submitting} />
          <ActionButton
            label={submitting ? 'Submitting...' : 'Confirm & Submit'}
            onClick={onConfirm}
            disabled={submitting || !secretKey.trim()}
          />
        </div>
      </div>
    </div>
  );
}

export default function Governance() {
  const { connectedAddress, network } = useStore();
  const isMainnet = network === 'mainnet';

  const [config, setConfig] = usePersistedState('stellar-governance-config', {
    contractId: '',
    adapterId: simpleVotingAdapter.id,
  });

  const [sourceAccount, setSourceAccount] = useState(connectedAddress || '');
  const [subTab, setSubTab] = useState<'open' | 'history'>('open');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposals, setProposals] = useState<NormalizedProposal[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pendingVote, setPendingVote] = useState<PendingVote | null>(null);
  const [secretKey, setSecretKey] = useState('');
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteError, setVoteError] = useState('');

  const adapter = GOVERNANCE_ADAPTERS[config.adapterId] ?? simpleVotingAdapter;
  const contractIdError = config.contractId.trim() !== '' && !isValidContractId(config.contractId.trim());

  const { open: openProposals, historical: historicalProposals } = useMemo(
    () => splitProposalsByStatus(proposals),
    [proposals],
  );
  const selectedProposal = proposals.find((p) => p.id === selectedId) ?? null;

  async function handleLoad() {
    setError('');
    setLoading(true);
    try {
      const account = sourceAccount || connectedAddress;
      if (!account) throw new Error('A source account is required to simulate read calls');

      const snapshot = await fetchGovernanceProposals({
        adapter,
        contractId: config.contractId.trim(),
        network,
        sourceAccount: account,
        voter: connectedAddress,
      });
      setProposals(snapshot.proposals);
      setLoadedOnce(true);
      if (!snapshot.proposals.some((p) => p.id === selectedId)) {
        setSelectedId(snapshot.proposals[0]?.id ?? null);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load governance proposals');
    } finally {
      setLoading(false);
    }
  }

  function handleRequestVote(choice: VoteChoice) {
    if (!selectedProposal) return;
    setVoteError('');
    setSecretKey('');
    setPendingVote({ proposal: selectedProposal, choice });
  }

  async function handleConfirmVote() {
    if (!pendingVote) return;
    // Defense in depth: never resubmit if this proposal already shows a vote.
    if (pendingVote.proposal.myVote) {
      setVoteError('This account has already voted on this proposal.');
      return;
    }

    setVoteSubmitting(true);
    setVoteError('');
    try {
      const voter = connectedAddress;
      if (!voter) throw new Error('Connect an account before voting');

      await submitGovernanceVote({
        adapter,
        contractId: config.contractId.trim(),
        network,
        proposalId: pendingVote.proposal.id,
        choice: pendingVote.choice,
        voter,
        secretKey,
      });

      setPendingVote(null);
      setSecretKey('');
      await handleLoad();
    } catch (err) {
      setVoteError((err as Error).message || 'Vote submission failed');
    } finally {
      setVoteSubmitting(false);
    }
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700 }}>Governance</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <ActionButton label="Open Proposals" onClick={() => setSubTab('open')} tone={subTab === 'open' ? 'primary' : 'secondary'} />
          <ActionButton label="History" onClick={() => setSubTab('history')} tone={subTab === 'history' ? 'primary' : 'secondary'} />
        </div>
      </div>

      <Panel
        title="Governance Contract"
        subtitle="Configure the governance contract and the adapter that describes its read/write function shape."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px',
            marginBottom: '18px',
          }}
        >
          <LabeledField label="Governance Contract ID">
            <input
              value={config.contractId}
              onChange={(e) => setConfig((current) => ({ ...current, contractId: e.target.value }))}
              placeholder="C... governance contract address"
              style={textInputStyle(contractIdError)}
            />
          </LabeledField>

          <LabeledField label="Adapter">
            <select
              value={config.adapterId}
              onChange={(e) => setConfig((current) => ({ ...current, adapterId: e.target.value }))}
              style={textInputStyle()}
            >
              {Object.values(GOVERNANCE_ADAPTERS).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </LabeledField>

          <LabeledField label="Source Account (for read simulation)">
            <input
              value={sourceAccount}
              onChange={(e) => setSourceAccount(e.target.value)}
              placeholder={connectedAddress || 'G... source account'}
              style={textInputStyle()}
            />
          </LabeledField>
        </div>

        <ActionButton
          label={loading ? 'Loading...' : 'Load Proposals'}
          onClick={handleLoad}
          disabled={loading || !config.contractId.trim() || contractIdError}
        />

        {error && <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
      </Panel>

      {loadedOnce && (
        subTab === 'history' ? (
          <GovernanceHistory proposals={historicalProposals} onSelect={setSelectedId} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(260px, 360px) 1fr',
              gap: '18px',
              alignItems: 'start',
            }}
          >
            <ProposalList proposals={openProposals} selectedId={selectedId} onSelect={setSelectedId} />
            <Panel title="Proposal Detail">
              <ProposalDetail
                proposal={selectedProposal}
                supportsAbstain={adapter.supportsAbstain ?? false}
                isMainnet={isMainnet}
                onRequestVote={handleRequestVote}
              />
            </Panel>
          </div>
        )
      )}

      {pendingVote && (
        <VoteConfirmDialog
          pending={pendingVote}
          contractId={config.contractId.trim()}
          network={network}
          secretKey={secretKey}
          onSecretKeyChange={setSecretKey}
          onCancel={() => {
            if (!voteSubmitting) setPendingVote(null);
          }}
          onConfirm={handleConfirmVote}
          submitting={voteSubmitting}
          error={voteError}
        />
      )}
    </div>
  );
}
