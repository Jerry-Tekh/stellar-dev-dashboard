import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Card from './Card'
import WatchlistAccountRow from './WatchlistAccountRow'
import WatchlistTagFilter from './WatchlistTagFilter'
import WatchlistSummary from './WatchlistSummary'
import { useStore } from '../../lib/store'
import { isValidPublicKey, shortAddress } from '../../lib/stellar'
import {
  addWatchlistEntry,
  fetchWatchlistActivity,
  fetchWatchlistBalances,
  filterActivityByAddress,
  filterActivityByTag,
  filterEntriesByTag,
  listWatchlistTags,
  loadWatchlist,
  removeWatchlistEntry,
  updateWatchlistEntry,
  type WatchlistActivityItem,
  type WatchlistBalancesResult,
  type WatchlistEntry,
} from '../../lib/watchlist'

const POLL_INTERVAL_MS = 30_000

function describeActivity(item: WatchlistActivityItem): string {
  const r = item.record as unknown as Record<string, unknown>
  if (item.type === 'payment') {
    const amount = (r.amount as string) ?? '?'
    const asset = (r.asset_code as string) ?? 'XLM'
    return `${amount} ${asset}: ${shortAddress(r.from as string, 4)} → ${shortAddress(r.to as string, 4)}`
  }
  if (item.type === 'create_account') {
    return `${(r.starting_balance as string) ?? '?'} XLM starting balance`
  }
  return item.typeLabel
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
}

export default function Watchlist() {
  const { network } = useStore()

  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [balances, setBalances] = useState<WatchlistBalancesResult | null>(null)
  const [activity, setActivity] = useState<WatchlistActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [addressInput, setAddressInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [addressFilter, setAddressFilter] = useState<string | null>(null)

  // Load persisted watchlist on mount — no wallet connection required.
  useEffect(() => {
    let cancelled = false
    loadWatchlist().then((loaded) => {
      if (!cancelled) setEntries(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    if (entries.length === 0) {
      setBalances(null)
      setActivity([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [balanceResult, activityResult] = await Promise.all([
        fetchWatchlistBalances(entries, network),
        fetchWatchlistActivity(entries, network),
      ])
      setBalances(balanceResult)
      setActivity(activityResult.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh watchlist')
    } finally {
      setLoading(false)
    }
  }, [entries, network])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  const handleAdd = async () => {
    const address = addressInput.trim()
    if (!isValidPublicKey(address)) {
      setError('Enter a valid Stellar public key (G...)')
      return
    }
    setError(null)
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const next = await addWatchlistEntry({ address, label: labelInput.trim(), tags })
    setEntries(next)
    setAddressInput('')
    setLabelInput('')
    setTagsInput('')
  }

  const handleRemove = async (address: string) => {
    const next = await removeWatchlistEntry(address)
    setEntries(next)
    if (addressFilter === address) setAddressFilter(null)
  }

  const handleEditTags = async (address: string, tags: string[]) => {
    const next = await updateWatchlistEntry(address, { tags })
    setEntries(next)
  }

  const allTags = useMemo(() => listWatchlistTags(entries), [entries])

  const visibleEntries = useMemo(
    () => filterEntriesByTag(entries, tagFilter),
    [entries, tagFilter],
  )
  const visibleAddresses = useMemo(
    () => new Set(visibleEntries.map((e) => e.address)),
    [visibleEntries],
  )
  const visibleBalances = useMemo(
    () => balances?.accounts.filter((a) => visibleAddresses.has(a.address)) ?? [],
    [balances, visibleAddresses],
  )

  const visibleActivity = useMemo(() => {
    const byTag = filterActivityByTag(activity, entries, tagFilter)
    return filterActivityByAddress(byTag, addressFilter)
  }, [activity, entries, tagFilter, addressFilter])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
          Watchlist
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          Track multiple accounts side by side, independent of the account currently connected for
          signing. Watched accounts are read-only — nothing here can sign a transaction.
        </p>
      </div>

      <Card title="Add account" subtitle="Public key only — never a secret key">
        <div style={{ padding: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Public key</label>
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
              }}
              placeholder="GABCDEF1234..."
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: '140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Label (optional)</label>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Treasury"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Tags (comma separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="treasury, deployer"
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!addressInput.trim()}
            style={{
              padding: '10px 18px',
              background: addressInput.trim() ? 'var(--cyan)' : 'var(--bg-elevated)',
              color: addressInput.trim() ? 'white' : 'var(--text-muted)',
              border: `1px solid ${addressInput.trim() ? 'var(--cyan)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: addressInput.trim() ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
            }}
          >
            + Add to Watchlist
          </button>
        </div>
        {error && (
          <div style={{ padding: '0 16px 14px', fontSize: '12px', color: 'var(--error, #ef4444)' }}>{error}</div>
        )}
      </Card>

      {entries.length === 0 ? (
        <Card>
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No accounts watched yet. Add a public key above to start monitoring it alongside your
            connected account.
          </div>
        </Card>
      ) : (
        <>
          <WatchlistSummary balances={balances} accountCount={entries.length} loading={loading} />

          <WatchlistTagFilter tags={allTags} active={tagFilter} onChange={setTagFilter} />

          <Card title="Watched accounts" subtitle={`${visibleEntries.length} of ${entries.length} shown`}>
            {visibleBalances.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                {loading ? 'Loading balances...' : 'No accounts match this tag.'}
              </div>
            ) : (
              visibleBalances.map((balance) => (
                <WatchlistAccountRow
                  key={balance.address}
                  balance={balance}
                  onRemove={handleRemove}
                  onEditTags={handleEditTags}
                />
              ))
            )}
          </Card>

          <Card
            title="Merged activity feed"
            subtitle="Recent operations across watched accounts, newest first"
            action={
              <select
                value={addressFilter ?? ''}
                onChange={(e) => setAddressFilter(e.target.value || null)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              >
                <option value="">All accounts</option>
                {visibleEntries.map((e) => (
                  <option key={e.address} value={e.address}>
                    {e.label || shortAddress(e.address)}
                  </option>
                ))}
              </select>
            }
          >
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {visibleActivity.length === 0 ? (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  {loading ? 'Loading activity...' : 'No recent activity for these accounts.'}
                </div>
              ) : (
                visibleActivity.map((item) => (
                  <div
                    key={`${item.address}-${item.id}`}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border)',
                      fontSize: '12px',
                      display: 'grid',
                      gridTemplateColumns: '150px 110px 1fr',
                      gap: '12px',
                      alignItems: 'baseline',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '11px' }}>
                      {formatTimestamp(item.createdAt)}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: 'var(--cyan, #06b6d4)',
                        fontSize: '11px',
                      }}
                      title={item.address}
                    >
                      {item.label || shortAddress(item.address, 4)}
                    </span>
                    <span style={{ wordBreak: 'break-word' }}>{describeActivity(item)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
}
