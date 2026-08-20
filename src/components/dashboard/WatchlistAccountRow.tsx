import React, { useState, type KeyboardEvent } from 'react'
import { shortAddress, formatXLM } from '../../lib/stellar'
import CopyableValue from './CopyableValue'
import type { WatchlistAccountBalance } from '../../lib/watchlist'

interface WatchlistAccountRowProps {
  balance: WatchlistAccountBalance
  onRemove: (address: string) => void
  onEditTags: (address: string, tags: string[]) => void
}

const chipStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: '999px',
  fontSize: '10px',
  fontWeight: 600,
  background: 'var(--cyan-glow-sm, rgba(6,182,212,0.12))',
  border: '1px solid var(--cyan-dim, #06b6d4)',
  color: 'var(--cyan, #06b6d4)',
  whiteSpace: 'nowrap',
}

export default function WatchlistAccountRow({ balance, onRemove, onEditTags }: WatchlistAccountRowProps) {
  const [editingTags, setEditingTags] = useState(false)
  const [tagInput, setTagInput] = useState(balance.tags.join(', '))

  const commitTags = () => {
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    onEditTags(balance.address, tags)
    setEditingTags(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitTags()
    if (e.key === 'Escape') {
      setTagInput(balance.tags.join(', '))
      setEditingTags(false)
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '10px',
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
            {balance.label || shortAddress(balance.address)}
          </span>
          <CopyableValue value={balance.address}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-muted)',
              }}
            >
              {shortAddress(balance.address)}
            </span>
          </CopyableValue>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
          {balance.tags.map((tag) => (
            <span key={tag} style={chipStyle}>
              {tag}
            </span>
          ))}
          {editingTags ? (
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onBlur={commitTags}
              onKeyDown={handleKeyDown}
              placeholder="treasury, deployer"
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTags(true)}
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                background: 'none',
                border: '1px dashed var(--border)',
                borderRadius: '999px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              + tag
            </button>
          )}
        </div>

        <div style={{ marginTop: '10px', fontSize: '12px' }}>
          {balance.error ? (
            <span style={{ color: 'var(--error, #ef4444)' }}>{balance.error}</span>
          ) : balance.rateLimited ? (
            <span style={{ color: 'var(--warning, #f59e0b)' }}>Rate limited — will retry next refresh</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {formatXLM(balance.xlmBalance)} XLM
                {balance.totalUsd !== null && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                    (~${balance.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})
                  </span>
                )}
              </div>
              {balance.assets.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {balance.assets.map((asset) => (
                    <span
                      key={`${asset.assetCode}:${asset.assetIssuer ?? ''}`}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}
                    >
                      {asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.assetCode}
                      {asset.usdValue !== null ? ` (~$${asset.usdValue.toFixed(2)})` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(balance.address)}
        title="Remove from watchlist"
        style={{
          padding: '4px 10px',
          background: 'transparent',
          color: 'var(--red)',
          border: '1px solid var(--red)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          cursor: 'pointer',
          opacity: 0.75,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}
