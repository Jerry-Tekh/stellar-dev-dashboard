import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NetworkIntelligenceDashboard from './NetworkIntelligenceDashboard'
import useNetworkIntelligence from '../../hooks/useNetworkIntelligence'
import { createDemonstrationSnapshot } from '../../lib/networkIntelligence/client'
import { planCapacity } from '../../lib/networkIntelligence/analysis'

vi.mock('../../hooks/useNetworkIntelligence')
vi.mock('../../lib/store', () => ({
  useStore: () => ({ network: 'testnet' }),
}))
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  }
})

const NOW = new Date('2026-08-20T12:00:00.000Z')
const mockedHook = vi.mocked(useNetworkIntelligence)

function hookResult(incident = false) {
  const snapshot = createDemonstrationSnapshot('testnet', incident, NOW)
  return {
    snapshot,
    loading: false,
    refreshing: false,
    error: null,
    lastRequestId: 'request-12345678',
    usingCachedData: false,
    demoIncident: incident,
    preferences: {
      refreshIntervalMs: 30_000,
      minimumSeverity: 'info' as const,
      autoRefresh: true,
      compactView: false,
    },
    refresh: vi.fn(),
    setPreferences: vi.fn(),
    simulateIncident: vi.fn(),
    exitSimulation: vi.fn(),
    changeAlertStatus: vi.fn(),
    capacityPlan: (scenario) => planCapacity(snapshot.current, scenario),
  }
}

describe('NetworkIntelligenceDashboard', () => {
  beforeEach(() => {
    mockedHook.mockReturnValue(hookResult(false))
  })

  it('renders comprehensive live network health status', () => {
    render(<NetworkIntelligenceDashboard />)
    expect(screen.getByRole('heading', { name: 'Network Intelligence' })).toBeInTheDocument()
    expect(screen.getByText('Network health')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Historical performance' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Congestion forecast' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Health dimensions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'SLA and error budgets' })).toBeInTheDocument()
    expect(screen.getByText(/request request-/i)).toBeInTheDocument()
  })

  it('opens alert management and dispatches acknowledgement', () => {
    const result = hookResult(true)
    mockedHook.mockReturnValue(result)
    render(<NetworkIntelligenceDashboard />)
    fireEvent.click(screen.getByRole('button', { name: /alerts/i }))
    expect(screen.getByRole('heading', { name: 'Intelligent alerts' })).toBeInTheDocument()
    const acknowledge = screen.getAllByRole('button', { name: 'Acknowledge' })[0]
    fireEvent.click(acknowledge)
    expect(result.changeAlertStatus).toHaveBeenCalledWith(expect.any(String), 'acknowledged')
  })

  it('shows an incident timeline and root-cause actions', () => {
    mockedHook.mockReturnValue(hookResult(true))
    render(<NetworkIntelligenceDashboard />)
    fireEvent.click(screen.getByRole('button', { name: /incidents/i }))
    expect(screen.getByText('Incident timeline')).toBeInTheDocument()
    expect(screen.getByText('Probable root cause')).toBeInTheDocument()
    expect(screen.getByText('Recommended response')).toBeInTheDocument()
  })

  it('updates capacity projections from accessible scenario controls', () => {
    render(<NetworkIntelligenceDashboard />)
    fireEvent.click(screen.getByRole('button', { name: /capacity/i }))
    expect(screen.getByRole('heading', { name: 'What-if scenario' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Capacity projection' })).toBeInTheDocument()
    const traffic = screen.getByRole('slider', { name: 'Annual traffic growth' })
    fireEvent.change(traffic, { target: { value: '150' } })
    expect(traffic).toHaveValue('150')
    expect(screen.getByText('Resource plan')).toBeInTheDocument()
  })

  it('labels simulations and returns to live data explicitly', () => {
    const result = hookResult(true)
    mockedHook.mockReturnValue(result)
    render(<NetworkIntelligenceDashboard />)
    expect(screen.getByText('SIMULATION')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /return to live data/i }))
    expect(result.exitSimulation).toHaveBeenCalledOnce()
  })

  it('offers retry and simulation paths when initial collection fails', () => {
    const result = hookResult(false)
    mockedHook.mockReturnValue({
      ...result,
      snapshot: null,
      error: Object.assign(new Error('Horizon is unavailable.'), {
        name: 'NetworkMonitoringError',
        code: 'unavailable' as const,
        retryable: true,
        requestId: 'failed-request',
      }),
    })
    render(<NetworkIntelligenceDashboard />)
    expect(screen.getByRole('alert')).toHaveTextContent('Horizon is unavailable.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(result.refresh).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: /explore simulated incident/i }))
    expect(result.simulateIncident).toHaveBeenCalledOnce()
  })

  it('shows the validator source caveat in the operations view', () => {
    render(<NetworkIntelligenceDashboard />)
    fireEvent.click(screen.getByRole('button', { name: /validators/i }))
    expect(screen.getByRole('heading', { name: 'Validator operations' })).toBeInTheDocument()
    expect(screen.getByText(/modeled continuity view/i)).toBeInTheDocument()
  })
})
