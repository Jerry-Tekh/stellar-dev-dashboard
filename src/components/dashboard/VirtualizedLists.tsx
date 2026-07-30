import React from 'react';
import { format } from 'date-fns';
import type { Horizon } from '@stellar/stellar-sdk';
import VirtualList from '../common/VirtualList';
import CopyableValue from './CopyableValue';
import { shortAddress, getOperationLabel } from '../../lib/stellar';
import {
  formatStorageTtl,
  stringifyStorageValue,
  type StorageDurability,
  type StorageEntry,
} from '../../lib/contractStorage';

export const TX_ROW_HEIGHT = 86;
export const OP_ROW_HEIGHT = 74;
export const STORAGE_ROW_HEIGHT = 78;
export const STORAGE_ROW_HEIGHT_EXPANDED = 260;

interface VirtualTxListProps {
  items: Horizon.ServerApi.TransactionRecord[];
  network: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  initialScrollTop?: number;
  onScrollPositionChange?: (scrollTop: number) => void;
  addressLabels?: Record<string, string>;
}

interface VirtualOpListProps {
  items: Horizon.ServerApi.OperationRecord[];
  network: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  initialScrollTop?: number;
  onScrollPositionChange?: (scrollTop: number) => void;
  addressLabels?: Record<string, string>;
}

export const VirtualTxList = ({
  items,
  network,
  onLoadMore,
  hasMore,
  loading,
  initialScrollTop = 0,
  onScrollPositionChange,
  addressLabels = {},
}: VirtualTxListProps) => {
  const rowHeight = (_index: number, item: Horizon.ServerApi.TransactionRecord) => {
    return item.memo ? TX_ROW_HEIGHT + 20 : TX_ROW_HEIGHT;
  };

  return (
    <VirtualList
      items={items}
      rowHeight={rowHeight}
      onLoadMore={onLoadMore}
      loading={loading}
      initialScrollTop={initialScrollTop}
      onScrollPositionChange={onScrollPositionChange}
      containerStyle={{ height: '600px' }}
    >
      {(tx: Horizon.ServerApi.TransactionRecord, _index: number, isFocused?: boolean) => (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '12px',
            alignItems: 'center',
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            transition: 'var(--transition)',
            height: '100%',
            background: isFocused ? 'var(--bg-hover)' : 'transparent',
          }}
          onMouseEnter={(event: React.MouseEvent<HTMLDivElement>) => (event.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(event: React.MouseEvent<HTMLDivElement>) => (event.currentTarget.style.background = isFocused ? 'var(--bg-hover)' : 'transparent')}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: tx.successful ? 'var(--green)' : 'var(--red)',
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
              <CopyableValue
                value={tx.hash}
                title="Copy transaction hash"
                containerStyle={{
                  fontSize: '12px',
                  color: 'var(--cyan)',
                  fontFamily: 'var(--font-mono)',
                  minWidth: 0,
                  flex: 1,
                }}
                textStyle={{
                  display: 'inline-block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {tx.hash}
              </CopyableValue>
              <a
                href={`https://stellar.expert/explorer/${network}/tx/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '11px', color: 'var(--cyan)', flexShrink: 0 }}
              >
                Open
              </a>
            </div>
            {tx.memo && (
              <div style={{ fontSize: '11px', color: 'var(--amber)', marginLeft: '15px', marginBottom: '2px' }}>
                memo: {tx.memo as string}
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '15px' }}>
              fee: {tx.fee_charged} stroops
            </div>
            {tx.source_account && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '15px' }}>
                {addressLabels[tx.source_account] ? `${addressLabels[tx.source_account]} ` : ''}
                <CopyableValue
                  value={tx.source_account}
                  title="Copy source account"
                  textStyle={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                >
                  source: {shortAddress(tx.source_account)}
                </CopyableValue>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {tx.operation_count} op{tx.operation_count !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {format(new Date(tx.created_at), 'MMM d, HH:mm')}
            </div>
          </div>
        </div>
      )}
    </VirtualList>
  );
};

export const VirtualOpList = ({
  items,
  network,
  onLoadMore,
  hasMore,
  loading,
  initialScrollTop = 0,
  onScrollPositionChange,
  addressLabels = {},
}: VirtualOpListProps) => {
  return (
    <VirtualList
      items={items}
      rowHeight={OP_ROW_HEIGHT}
      onLoadMore={onLoadMore}
      loading={loading}
      initialScrollTop={initialScrollTop}
      onScrollPositionChange={onScrollPositionChange}
      containerStyle={{ height: '600px' }}
    >
      {(op: Horizon.ServerApi.OperationRecord, _index: number, isFocused?: boolean) => (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '12px',
            alignItems: 'center',
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            transition: 'var(--transition)',
            height: '100%',
            background: isFocused ? 'var(--bg-hover)' : 'transparent',
          }}
          onMouseEnter={(event: React.MouseEvent<HTMLDivElement>) => (event.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(event: React.MouseEvent<HTMLDivElement>) => (event.currentTarget.style.background = isFocused ? 'var(--bg-hover)' : 'transparent')}
        >
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '3px' }}>
              <span
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-bright)',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  color: 'var(--cyan)',
                  marginRight: '8px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {getOperationLabel(op.type)}
              </span>
            </div>
            {'from' in op && op.from && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {addressLabels[(op as unknown as Record<string, string>).from] ? `${addressLabels[(op as unknown as Record<string, string>).from]} ` : ''}
                <CopyableValue
                  value={(op as unknown as Record<string, string>).from}
                  title="Copy source public key"
                  textStyle={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                >
                  from: {shortAddress((op as unknown as Record<string, string>).from)}
                </CopyableValue>
              </div>
            )}
            {'to' in op && op.to && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {addressLabels[(op as unknown as Record<string, string>).to] ? `${addressLabels[(op as unknown as Record<string, string>).to]} ` : ''}
                <CopyableValue
                  value={(op as unknown as Record<string, string>).to}
                  title="Copy destination public key"
                  textStyle={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                >
                  to: {shortAddress((op as unknown as Record<string, string>).to)}
                </CopyableValue>
              </div>
            )}
            {'amount' in op && op.amount && (
              <div style={{ fontSize: '11px', color: 'var(--amber)' }}>
                {parseFloat((op as unknown as Record<string, string>).amount).toFixed(4)} {'asset_code' in op ? (op as unknown as Record<string, string>).asset_code : 'XLM'}
              </div>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
            {format(new Date(op.created_at), 'MMM d, HH:mm')}
          </div>
        </div>
      )}
    </VirtualList>
  );
};

function durabilityColor(durability: StorageDurability): string {
  if (durability === 'instance') return 'var(--cyan)';
  if (durability === 'persistent') return 'var(--green)';
  return 'var(--amber)';
}

function DurabilityBadge({ durability }: { durability: StorageDurability }) {
  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: '4px',
        background: 'var(--bg-base)',
        color: durabilityColor(durability),
        textTransform: 'uppercase',
        fontSize: '10px',
        letterSpacing: '0.4px',
      }}
    >
      {durability}
    </span>
  );
}

function TtlBadge({ entry, latestLedger }: { entry: StorageEntry; latestLedger: number }) {
  const ttl = formatStorageTtl(entry, latestLedger);
  if (!ttl.hasTtl) {
    return <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>No TTL</span>;
  }
  return (
    <span style={{ fontSize: '10px', color: ttl.isExpired ? 'var(--red)' : 'var(--text-muted)' }}>
      {ttl.label}
    </span>
  );
}

/** Type-aware, single-line preview of a decoded (or raw-XDR) storage value for the collapsed row. */
function StorageValuePreview({ value, decoded }: { value: unknown; decoded: boolean }) {
  if (!decoded) {
    return <span style={{ color: 'var(--text-muted)' }}>raw xdr: {String(value).slice(0, 40)}…</span>;
  }
  if (typeof value === 'boolean') {
    return <span style={{ color: value ? 'var(--green)' : 'var(--red)' }}>{String(value)}</span>;
  }
  if (typeof value === 'bigint' || typeof value === 'number') {
    return <span style={{ color: 'var(--amber)' }}>{String(value)}</span>;
  }
  return <span>{stringifyStorageValue(value) || '—'}</span>;
}

/** Type-aware, fully expanded renderer for a decoded (or raw-XDR fallback) storage key/value. */
export function StorageValueDetail({
  label,
  value,
  decoded,
  rawXdr,
}: {
  label: string;
  value: unknown;
  decoded: boolean;
  rawXdr: string;
}) {
  return (
    <div>
      <strong style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
        {label}
        {!decoded && (
          <span style={{ marginLeft: '8px', color: 'var(--amber)', textTransform: 'none' }}>
            (type unknown — showing raw XDR)
          </span>
        )}
      </strong>
      <pre
        style={{
          margin: '4px 0 0',
          padding: '10px',
          background: 'var(--bg-base)',
          borderRadius: '4px',
          overflowX: 'auto',
          fontSize: '11px',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {decoded
          ? JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
          : rawXdr}
      </pre>
    </div>
  );
}

interface VirtualStorageListProps {
  items: StorageEntry[];
  latestLedger: number;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  initialScrollTop?: number;
  onScrollPositionChange?: (scrollTop: number) => void;
}

export const VirtualStorageList = ({
  items,
  latestLedger,
  expandedId,
  onToggleExpand,
  initialScrollTop = 0,
  onScrollPositionChange,
}: VirtualStorageListProps) => {
  const rowHeight = (_index: number, item: StorageEntry) =>
    item.id === expandedId ? STORAGE_ROW_HEIGHT_EXPANDED : STORAGE_ROW_HEIGHT;

  return (
    <VirtualList
      items={items}
      rowHeight={rowHeight}
      initialScrollTop={initialScrollTop}
      onScrollPositionChange={onScrollPositionChange}
      containerStyle={{ height: '600px' }}
    >
      {(entry: StorageEntry, _index: number, isFocused?: boolean) => {
        const expanded = entry.id === expandedId;
        return (
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid var(--border)',
              background: isFocused ? 'var(--bg-hover)' : 'transparent',
              height: '100%',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <DurabilityBadge durability={entry.durability} />
                  <span
                    style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={stringifyStorageValue(entry.key)}
                  >
                    {stringifyStorageValue(entry.key) || '(empty key)'}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <StorageValuePreview value={entry.value} decoded={entry.valueDecoded} />
                </div>
                <div style={{ marginTop: '4px' }}>
                  <TtlBadge entry={entry} latestLedger={latestLedger} />
                </div>
              </div>
              <button
                onClick={() => onToggleExpand(entry.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--cyan)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  flexShrink: 0,
                }}
              >
                {expanded ? 'Hide' : 'View'}
              </button>
            </div>

            {expanded && (
              <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
                <StorageValueDetail
                  label="Key"
                  value={entry.key}
                  decoded={entry.keyDecoded}
                  rawXdr={entry.keyRawXdr}
                />
                <StorageValueDetail
                  label="Value"
                  value={entry.value}
                  decoded={entry.valueDecoded}
                  rawXdr={entry.valueRawXdr}
                />
              </div>
            )}
          </div>
        );
      }}
    </VirtualList>
  );
};
