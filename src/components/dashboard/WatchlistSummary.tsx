import React from 'react'
import { StatCard } from './Card'
import type { WatchlistBalancesResult } from '../../lib/watchlist'

interface WatchlistSummaryProps {
  balances: WatchlistBalancesResult | null
  accountCount: number
  loading: boolean
}

export default function WatchlistSummary({ balances, accountCount, loading }: WatchlistSummaryProps) {
  const erroredCount = balances?.accounts.filter((a) => a.error).length ?? 0
  const rateLimitedCount = balances?.accounts.filter((a) => a.rateLimited).length ?? 0

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
      }}
    >
      <StatCard
        label="Watched Accounts"
        value={accountCount.toString()}
        sub={erroredCount > 0 ? `${erroredCount} failed to load` : undefined}
        loading={loading && !balances}
      />
      <StatCard
        label="Combined XLM"
        value={balances ? balances.combinedXlm.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
        accent="var(--cyan)"
        loading={loading && !balances}
      />
      <StatCard
        label="Combined Est. Value"
        value={
          balances?.combinedUsd !== null && balances?.combinedUsd !== undefined
            ? `$${balances.combinedUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : '—'
        }
        sub={rateLimitedCount > 0 ? `${rateLimitedCount} rate-limited` : 'via existing USD estimates'}
        accent="var(--green)"
        loading={loading && !balances}
      />
    </div>
  )
}
