import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FraudDetectionDashboard from './FraudDetectionDashboard'
import useFraudDetection from '../../hooks/useFraudDetection'
import { createDemonstrationFraud } from '../../lib/fraudDetection/client'

vi.mock('../../hooks/useFraudDetection')
vi.mock('../../lib/store', () => ({
  useStore: () => ({ network: 'testnet', connectedAddress: null }),
}))

const mocked = vi.mocked(useFraudDetection)
const now = new Date('2026-08-21T16:00:00.000Z')

function result(incident = false) {
  const snapshot = createDemonstrationFraud('testnet', incident, undefined, now)
  return {
    snapshot,
    loading: false,
    refreshing: false,
    error: null,
    requestId: 'fraud-request',
    cached: false,
    simulation: incident,
    preferences: {
      refreshIntervalMs: 45_000,
      minimumSeverity: 'low' as const,
      autoRefresh: true,
      includeLowConfidence: true,
      alertSound: false,
    },
    intelMessage: '',
    importedIntel: [],
    refresh: vi.fn(),
    setPreferences: vi.fn(),
    simulateIncident: vi.fn(),
    exitSimulation: vi.fn(),
    changeAlertStatus: vi.fn(),
    importThreatIntel: vi.fn(),
    clearIntelMessage: vi.fn(),
    meetsSeverity: () => true,
  }
}

describe('FraudDetectionDashboard', () => {
  beforeEach(() => mocked.mockReturnValue(result()))

  it('renders integrated overview and responsible-use context', () => {
    render(<FraudDetectionDashboard />)
    expect(screen.getByRole('heading', { name: /fraud detection/i })).toBeInTheDocument()
    expect(screen.getByText('Open alerts')).toBeInTheDocument()
    expect(screen.getByText(/Deterministic fixtures/i)).toBeInTheDocument()
    expect(screen.getByText(/Detection posture/i)).toBeInTheDocument()
  })

  it('shows investigation queue and alert actions', () => {
    const value = result(true)
    mocked.mockReturnValue(value)
    render(<FraudDetectionDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'alerts' }))
    expect(screen.getByRole('heading', { name: 'Investigation queue' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Acknowledge' })[0])
    expect(value.changeAlertStatus).toHaveBeenCalled()
  })

  it('shows network graph and threat intelligence', () => {
    render(<FraudDetectionDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'network' }))
    expect(screen.getByRole('heading', { name: 'Account relationship map' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Threat intelligence' })).toBeInTheDocument()
  })

  it('documents prevention workflows', () => {
    render(<FraudDetectionDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'prevention' }))
    expect(screen.getByRole('heading', { name: 'Prevention workflows' })).toBeInTheDocument()
    expect(screen.getByText(/Auto-block known fraudulent addresses/i)).toBeInTheDocument()
  })

  it('shows education tips for users', () => {
    render(<FraudDetectionDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'education' }))
    expect(screen.getByRole('heading', { name: 'User education' })).toBeInTheDocument()
    expect(screen.getByText(/Never share a seed phrase/i)).toBeInTheDocument()
  })

  it('documents methodology, models, and limitations', () => {
    render(<FraudDetectionDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'methodology' }))
    expect(screen.getByRole('heading', { name: 'Methodology' })).toBeInTheDocument()
    expect(screen.getByText(/95%\+/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Known limitations' })).toBeInTheDocument()
  })

  it('renders loading and error states', () => {
    mocked.mockReturnValue({
      ...result(),
      snapshot: null,
      loading: true,
      error: null,
    })
    const { rerender } = render(<FraudDetectionDashboard />)
    expect(screen.getByRole('status')).toHaveTextContent(/Loading fraud intelligence/i)

    mocked.mockReturnValue({
      ...result(),
      snapshot: null,
      loading: false,
      error: {
        name: 'FraudDetectionError',
        message: 'Unable to load fraud intelligence.',
        code: 'unavailable',
        retryable: true,
      } as never,
      refresh: vi.fn(),
    })
    rerender(<FraudDetectionDashboard />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i)
  })

  it('opens explainable assessment details', () => {
    render(<FraudDetectionDashboard />)
    fireEvent.click(screen.getAllByRole('button', { name: /Inspect/i })[0])
    expect(screen.getByRole('dialog', { name: /Fraud assessment details/i })).toBeInTheDocument()
    expect(screen.getByText(/Signals contributing to this score/i)).toBeInTheDocument()
  })
})
