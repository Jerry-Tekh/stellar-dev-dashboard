import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  transactionOutbox,
  type OutboxStatus,
  type TransactionOutboxItem,
} from '../../lib/transactionOutbox'
import { useStore } from '../../lib/store'
import Card from './Card'

const STATUS_COLORS: Record<OutboxStatus, string> = {
  queued: 'var(--amber, #f59e0b)',
  submitting: 'var(--cyan)',
  confirmed: 'var(--green)',
  failed: 'var(--red)',
  expired: 'var(--text-muted)',
}

function useOutboxItems(): TransactionOutboxItem[] {
  const [items, setItems] = useState<TransactionOutboxItem[]>([])

  useEffect(() => transactionOutbox.subscribe(setItems), [])
  return items
}

function shortHash(item: TransactionOutboxItem): string {
  const idParts = item.id.split(':')
  const hash = item.hash || idParts[idParts.length - 1] || ''
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : item.id
}

function describeStatus(item: TransactionOutboxItem): string {
  if (item.status === 'queued') return 'Safely stored and waiting for connectivity or a retry.'
  if (item.status === 'submitting') return 'Submission is currently in progress.'
  if (item.status === 'confirmed') {
    if (item.submissionKind === 'soroban') return 'Accepted by Soroban RPC.'
    return item.ledger ? `Confirmed in ledger ${item.ledger}.` : 'Confirmed by Horizon.'
  }
  if (item.status === 'expired') {
    return 'Its encoded maximum time has passed, so it will not be retried.'
  }
  return item.error || 'Horizon rejected this transaction.'
}

export function TransactionOutboxBadge() {
  const items = useOutboxItems()
  const navigate = useNavigate()
  const { setActiveTab } = useStore()
  const pending = items.filter(
    (item) => item.status === 'queued' || item.status === 'submitting',
  ).length

  if (pending === 0) return null

  const openOutbox = () => {
    setActiveTab('outbox')
    navigate('/outbox')
  }

  return (
    <button
      type="button"
      onClick={openOutbox}
      title="Open transaction outbox"
      aria-label={`Open transaction outbox (${pending} pending)`}
      style={{
        minWidth: '36px',
        height: '36px',
        padding: '0 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        border: '1px solid var(--amber, #f59e0b)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--amber-glow, rgba(245, 158, 11, 0.1))',
        color: 'var(--amber, #f59e0b)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 700,
      }}
    >
      <span aria-hidden="true">⇧</span>
      {pending}
    </button>
  )
}

export default function TransactionOutbox() {
  const items = useOutboxItems()
  const [busyId, setBusyId] = useState<string | null>(null)

  const pendingCount = useMemo(
    () =>
      items.filter((item) => item.status === 'queued' || item.status === 'submitting')
        .length,
    [items],
  )

  const retry = async (id: string) => {
    setBusyId(id)
    try {
      await transactionOutbox.retry(id)
    } finally {
      setBusyId(null)
    }
  }

  const discard = async (id: string) => {
    setBusyId(id)
    try {
      await transactionOutbox.discard(id)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card
      title="Transaction Outbox"
      subtitle={`${pendingCount} pending · signed transactions persist across reloads`}
    >
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: '32px 18px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '13px',
            }}
          >
            <div style={{ fontSize: '30px', marginBottom: '10px', opacity: 0.55 }}>✓</div>
            The outbox is empty.
            <div style={{ fontSize: '11px', marginTop: '5px' }}>
              Transactions are stored here immediately after signing.
            </div>
          </div>
        ) : (
          items.map((item) => {
            const busy = busyId === item.id
            const canRetry = item.status === 'queued' || item.status === 'failed'
            const canDiscard = item.status !== 'submitting'

            return (
              <article
                key={item.id}
                style={{
                  padding: '14px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-base)',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <code style={{ color: 'var(--text-primary)', fontSize: '12px' }}>
                    {shortHash(item)}
                  </code>
                  <span
                    style={{
                      color: STATUS_COLORS[item.status],
                      border: `1px solid ${STATUS_COLORS[item.status]}`,
                      borderRadius: '999px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {item.status}
                  </span>
                </div>

                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
                  {describeStatus(item)}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '14px',
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>{item.network.toUpperCase()}</span>
                  <span>{(item.submissionKind || 'horizon').toUpperCase()}</span>
                  <span>Attempts: {item.attempts}</span>
                  <span>Created: {new Date(item.createdAt).toLocaleString()}</span>
                  {item.expiresAt !== null && (
                    <span>Expires: {new Date(item.expiresAt).toLocaleString()}</span>
                  )}
                </div>

                {(canRetry || canDiscard) && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {canRetry && (
                      <button
                        type="button"
                        onClick={() => void retry(item.id)}
                        disabled={busy}
                        style={{
                          padding: '7px 11px',
                          border: '1px solid var(--cyan)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--cyan-glow)',
                          color: 'var(--cyan)',
                          cursor: busy ? 'wait' : 'pointer',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                        }}
                      >
                        {busy ? 'Retrying…' : 'Retry now'}
                      </button>
                    )}
                    {canDiscard && (
                      <button
                        type="button"
                        onClick={() => void discard(item.id)}
                        disabled={busy}
                        style={{
                          padding: '7px 11px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          cursor: busy ? 'wait' : 'pointer',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                        }}
                      >
                        Discard
                      </button>
                    )}
                  </div>
                )}
              </article>
            )
          })
        )}
      </div>
    </Card>
  )
}
