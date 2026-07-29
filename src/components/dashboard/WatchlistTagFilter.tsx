import React from 'react'

interface WatchlistTagFilterProps {
  tags: string[]
  active: string | null
  onChange: (tag: string | null) => void
}

export default function WatchlistTagFilter({ tags, active, onChange }: WatchlistTagFilterProps) {
  if (tags.length === 0) return null

  const chip = (label: string, value: string | null) => {
    const isActive = active === value
    return (
      <button
        key={label}
        type="button"
        onClick={() => onChange(value)}
        style={{
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '11px',
          border: `1px solid ${isActive ? 'var(--cyan, #06b6d4)' : 'var(--border)'}`,
          background: isActive ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
          color: isActive ? 'var(--cyan, #06b6d4)' : 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      {chip('All tags', null)}
      {tags.map((tag) => chip(tag, tag))}
    </div>
  )
}
