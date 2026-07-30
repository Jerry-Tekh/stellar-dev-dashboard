import React, { useMemo, useState, type CSSProperties } from 'react';
import { useStore } from '../../lib/store';
import {
  fetchContractStorageSnapshot,
  filterStorageEntries,
  buildStorageExportPayload,
  type ContractStorageSnapshot,
  type StorageDurability,
} from '../../lib/contractStorage';
import { isValidContractId } from '../../lib/stellar';
import { exportJson } from '../../utils/export';
import { VirtualStorageList } from './VirtualizedLists';

const DURABILITY_FILTERS: { value: StorageDurability | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'instance', label: 'Instance' },
  { value: 'persistent', label: 'Persistent' },
  { value: 'temporary', label: 'Temporary' },
];

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

function textInputStyle(): CSSProperties {
  return {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-bright)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
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
  tone?: 'primary' | 'secondary';
}) {
  const palette =
    tone === 'secondary'
      ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-bright)' }
      : { background: 'var(--cyan)', color: 'var(--bg-base)', border: 'none' };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px',
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

function MetricCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          marginBottom: '6px',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </div>
  );
}

function FilterBar({
  durabilityFilter,
  onDurabilityChange,
  keyPrefix,
  onKeyPrefixChange,
  valueSubstring,
  onValueSubstringChange,
  onExport,
  exportDisabled,
}: {
  durabilityFilter: StorageDurability | 'all';
  onDurabilityChange: (value: StorageDurability | 'all') => void;
  keyPrefix: string;
  onKeyPrefixChange: (value: string) => void;
  valueSubstring: string;
  onValueSubstringChange: (value: string) => void;
  onExport: () => void;
  exportDisabled: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {DURABILITY_FILTERS.map((option) => (
          <button
            key={option.value}
            onClick={() => onDurabilityChange(option.value)}
            style={{
              padding: '7px 14px',
              background: durabilityFilter === option.value ? 'var(--cyan-glow)' : 'transparent',
              border: `1px solid ${durabilityFilter === option.value ? 'var(--cyan-dim)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              color: durabilityFilter === option.value ? 'var(--cyan)' : 'var(--text-secondary)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Key prefix filter..."
          value={keyPrefix}
          onChange={(e) => onKeyPrefixChange(e.target.value)}
          style={{ ...textInputStyle(), flex: 1, minWidth: '200px' }}
        />
        <input
          placeholder="Value contains..."
          value={valueSubstring}
          onChange={(e) => onValueSubstringChange(e.target.value)}
          style={{ ...textInputStyle(), flex: 1, minWidth: '200px' }}
        />
        <ActionButton label="Export JSON" onClick={onExport} tone="secondary" disabled={exportDisabled} />
      </div>
    </div>
  );
}

export default function ContractStorage() {
  const { network, contractId: storeContractId } = useStore();

  const [contractIdInput, setContractIdInput] = useState(storeContractId || '');
  const [snapshot, setSnapshot] = useState<ContractStorageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [durabilityFilter, setDurabilityFilter] = useState<StorageDurability | 'all'>('all');
  const [keyPrefix, setKeyPrefix] = useState('');
  const [valueSubstring, setValueSubstring] = useState('');

  const contractIdValid = isValidContractId(contractIdInput.trim());

  async function handleFetch() {
    const id = contractIdInput.trim();
    if (!isValidContractId(id)) {
      setError('Enter a valid Soroban contract address');
      return;
    }

    setError(null);
    setLoading(true);
    setSnapshot(null);
    setExpandedId(null);

    try {
      const result = await fetchContractStorageSnapshot(id, network);
      setSnapshot(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contract storage');
    } finally {
      setLoading(false);
    }
  }

  const filters = useMemo(
    () => ({ durability: durabilityFilter, keyPrefix, valueSubstring }),
    [durabilityFilter, keyPrefix, valueSubstring],
  );

  const filteredEntries = useMemo(() => {
    if (!snapshot) return [];
    return filterStorageEntries(snapshot.entries, filters);
  }, [snapshot, filters]);

  function handleExport() {
    if (!snapshot) return;
    const payload = buildStorageExportPayload(snapshot, filteredEntries, filters);
    exportJson(payload, `contract-storage-${snapshot.contractId.slice(0, 8)}-${Date.now()}`);
  }

  function toggleExpand(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700 }}>
        Contract Storage
      </div>

      <Panel
        title="Storage Lookup"
        subtitle="Fetch a contract's instance storage plus any persistent/temporary entries discovered from its interaction history."
      >
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            placeholder="C... contract address"
            value={contractIdInput}
            onChange={(e) => setContractIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            style={{ ...textInputStyle(), flex: 1, minWidth: '280px' }}
          />
          <ActionButton
            label={loading ? 'Loading...' : 'Fetch Storage'}
            onClick={handleFetch}
            disabled={loading || !contractIdValid}
          />
        </div>
        {error && <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
      </Panel>

      {snapshot && (
        <>
          <Panel title="Summary" subtitle={`Snapshot fetched at ${new Date(snapshot.fetchedAt).toLocaleString()}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <MetricCard label="Instance" value={snapshot.counts.instance} />
              <MetricCard label="Persistent" value={snapshot.counts.persistent} />
              <MetricCard label="Temporary" value={snapshot.counts.temporary} />
              <MetricCard label="Latest Ledger" value={snapshot.latestLedger || '—'} />
            </div>
            {snapshot.warnings.length > 0 && (
              <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                {snapshot.warnings.map((warning) => (
                  <div
                    key={warning}
                    style={{
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(255, 184, 0, 0.22)',
                      background: 'rgba(255, 184, 0, 0.08)',
                      color: 'var(--amber)',
                      fontSize: '11px',
                      lineHeight: 1.5,
                    }}
                  >
                    {warning}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Filters & Export" subtitle="Search by key prefix or value substring, and export what's currently displayed.">
            <FilterBar
              durabilityFilter={durabilityFilter}
              onDurabilityChange={setDurabilityFilter}
              keyPrefix={keyPrefix}
              onKeyPrefixChange={setKeyPrefix}
              valueSubstring={valueSubstring}
              onValueSubstringChange={setValueSubstring}
              onExport={handleExport}
              exportDisabled={filteredEntries.length === 0}
            />
          </Panel>

          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            {filteredEntries.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                {snapshot.entries.length === 0
                  ? 'No storage entries found for this contract.'
                  : 'No entries match the current filters.'}
              </div>
            ) : (
              <VirtualStorageList
                items={filteredEntries}
                latestLedger={snapshot.latestLedger}
                expandedId={expandedId}
                onToggleExpand={toggleExpand}
              />
            )}
          </div>
        </>
      )}

      {!snapshot && !loading && !error && (
        <Panel title="About Storage Inspection" subtitle="How persistent and temporary entries are discovered.">
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Instance storage is always readable directly from the ledger. Soroban RPC has no method to list a
            contract's persistent or temporary keys, so those are discovered from ledger-key footprints recorded
            the last time this contract was simulated or invoked from the Contracts tab. Interact with the contract
            first if you don&apos;t see any persistent/temporary entries below.
          </div>
        </Panel>
      )}
    </div>
  );
}
