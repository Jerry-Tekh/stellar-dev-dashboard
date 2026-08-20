import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarketSentimentDashboard from './MarketSentimentDashboard';
import useMarketSentiment from '../../hooks/useMarketSentiment';
import { createDemonstrationSentiment } from '../../lib/marketSentiment/client';
vi.mock('../../hooks/useMarketSentiment');
vi.mock('../../lib/store', () => ({ useStore: () => ({ network: 'testnet' }) }));
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});
const mocked = vi.mocked(useMarketSentiment),
  now = new Date('2026-08-20T12:00:00Z');
function result(incident = false) {
  return {
    snapshot: createDemonstrationSentiment('testnet', incident, now),
    loading: false,
    refreshing: false,
    error: null,
    requestId: 'sentiment-request',
    cached: false,
    simulation: incident,
    preferences: {
      refreshIntervalMs: 60_000,
      minimumConfidence: 0.5,
      includeLowCredibility: false,
      selectedLanguage: 'all',
      autoRefresh: true,
    },
    refresh: vi.fn(),
    setPreferences: vi.fn(),
    simulateCrisis: vi.fn(),
    exitSimulation: vi.fn(),
    changeAlertStatus: vi.fn(),
  };
}
describe('MarketSentimentDashboard', () => {
  beforeEach(() => mocked.mockReturnValue(result()));
  it('renders integrated overview and responsible-use context', () => {
    render(<MarketSentimentDashboard />);
    expect(
      screen.getByRole('heading', { name: 'Market Sentiment Intelligence' })
    ).toBeInTheDocument();
    expect(screen.getByText('Composite sentiment')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /48-hour sentiment/i })).toBeInTheDocument();
    expect(screen.getByText(/deterministic fixtures/i)).toBeInTheDocument();
  });
  it('shows connector degradation and language coverage', () => {
    render(<MarketSentimentDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'sources' }));
    expect(screen.getByRole('heading', { name: 'Ingestion health' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Global language coverage' })).toBeInTheDocument();
    expect(screen.getAllByText('DEMO').length).toBeGreaterThan(0);
  });
  it('shows analyzed documents, entities, and viral signals', () => {
    render(<MarketSentimentDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'signals' }));
    expect(screen.getByRole('heading', { name: 'Recent analyzed content' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entity intelligence' })).toBeInTheDocument();
    expect(screen.getAllByText(/spam risk/i).length).toBeGreaterThan(0);
  });
  it('acknowledges alerts after a simulated shift', () => {
    const value = result(true);
    mocked.mockReturnValue(value);
    render(<MarketSentimentDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /alerts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(value.changeAlertStatus).toHaveBeenCalledWith(expect.any(String), 'acknowledged');
  });
  it('documents methodology, limitations, and evaluation target', () => {
    render(<MarketSentimentDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'methodology' }));
    expect(screen.getByRole('heading', { name: 'Methodology' })).toBeInTheDocument();
    expect(screen.getByText(/75% price-direction objective/i)).toBeInTheDocument();
    expect(
      screen.getByText(/correlation and forecasts do not establish causation/i)
    ).toBeInTheDocument();
  });
  it('exports a bounded custom intelligence report', () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:sentiment-report');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<MarketSentimentDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Export report' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:sentiment-report');
  });
  it('offers safe retry and demonstration paths on failure', () => {
    const value = result();
    mocked.mockReturnValue({
      ...value,
      snapshot: null,
      error: Object.assign(new Error('Service unavailable'), {
        name: 'MarketSentimentError',
        code: 'unavailable' as const,
        retryable: true,
      }),
    });
    render(<MarketSentimentDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(value.refresh).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Explore demonstration' }));
    expect(value.simulateCrisis).toHaveBeenCalled();
  });
});
