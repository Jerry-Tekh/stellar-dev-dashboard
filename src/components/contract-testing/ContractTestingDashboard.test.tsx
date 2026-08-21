import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContractTestingDashboard from './ContractTestingDashboard';
import useContractTesting from '../../hooks/useContractTesting';
import { analyzeContractLocally } from '../../lib/contractTesting/client';
import { SAMPLE_CONTRACTS, findSampleContract } from '../../lib/contractTesting/fixtures';

vi.mock('../../hooks/useContractTesting');
const mocked = vi.mocked(useContractTesting);

function baseState(overrides: Partial<ReturnType<typeof useContractTesting>> = {}) {
  return {
    source: '',
    setSource: vi.fn(),
    contractName: '',
    setContractName: vi.fn(),
    result: null,
    loading: false,
    error: null,
    history: [],
    samples: SAMPLE_CONTRACTS,
    runAnalysis: vi.fn(),
    loadSample: vi.fn(),
    loadFromFile: vi.fn(),
    reset: vi.fn(),
    downloadTestSuite: vi.fn(),
    downloadCiWorkflow: vi.fn(),
    downloadReport: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useContractTesting>;
}

function analyzedResult() {
  return analyzeContractLocally(findSampleContract('token')!.source, undefined, 'test-req-1');
}

describe('ContractTestingDashboard', () => {
  beforeEach(() => mocked.mockReturnValue(baseState()));

  it('shows an empty state before any analysis has run', () => {
    render(<ContractTestingDashboard />);
    expect(screen.getByRole('heading', { name: 'Contract Testing & Verification' })).toBeInTheDocument();
    expect(screen.getByText(/No analysis yet/i)).toBeInTheDocument();
  });

  it('shows a loading state while analysis is in flight', () => {
    mocked.mockReturnValue(baseState({ loading: true }));
    render(<ContractTestingDashboard />);
    expect(screen.getByText(/Parsing contract/i)).toBeInTheDocument();
  });

  it('shows a retryable error with a Retry action', () => {
    const runAnalysis = vi.fn();
    mocked.mockReturnValue(
      baseState({
        runAnalysis,
        error: Object.assign(new Error('Contract testing service returned HTTP 500.'), {
          name: 'ContractTestingError',
          code: 'unavailable' as const,
          retryable: true,
        }),
      })
    );
    render(<ContractTestingDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Contract testing service returned HTTP 500.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(runAnalysis).toHaveBeenCalled();
  });

  it('renders overview metrics and detected functions after a successful analysis', () => {
    mocked.mockReturnValue(baseState({ result: analyzedResult() }));
    render(<ContractTestingDashboard />);
    expect(screen.getByText('TokenContract')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Detected functions' })).toBeInTheDocument();
    expect(screen.getByText(/transfer\(/)).toBeInTheDocument();
  });

  it('switches to the findings view and lists static findings', () => {
    mocked.mockReturnValue(baseState({ result: analyzedResult() }));
    render(<ContractTestingDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /^Findings/ }));
    expect(screen.getByRole('heading', { name: /Static findings/ })).toBeInTheDocument();
  });

  it('switches to the generated tests view and triggers a download', () => {
    const downloadTestSuite = vi.fn();
    mocked.mockReturnValue(baseState({ result: analyzedResult(), downloadTestSuite }));
    render(<ContractTestingDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Generated Tests' }));
    expect(screen.getByRole('heading', { name: /Generated test suite/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download .rs' }));
    expect(downloadTestSuite).toHaveBeenCalled();
  });

  it('switches to the formal verification view', () => {
    mocked.mockReturnValue(baseState({ result: analyzedResult() }));
    render(<ContractTestingDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Formal Verification' }));
    expect(screen.getByRole('heading', { name: 'Formal verification report' })).toBeInTheDocument();
    expect(screen.getByText(/not symbolic execution/i)).toBeInTheDocument();
  });

  it('switches to the CI integration view and downloads the workflow', () => {
    const downloadCiWorkflow = vi.fn();
    mocked.mockReturnValue(baseState({ result: analyzedResult(), downloadCiWorkflow }));
    render(<ContractTestingDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'CI Integration' }));
    expect(screen.getByText(/GitHub Actions workflow/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download workflow' }));
    expect(downloadCiWorkflow).toHaveBeenCalled();
  });

  it('loads a sample contract when a sample button is clicked', () => {
    const loadSample = vi.fn();
    mocked.mockReturnValue(baseState({ loadSample }));
    render(<ContractTestingDashboard />);
    fireEvent.click(screen.getByRole('button', { name: SAMPLE_CONTRACTS[0].label }));
    expect(loadSample).toHaveBeenCalledWith(SAMPLE_CONTRACTS[0].id);
  });

  it('triggers analysis when the Analyze button is clicked', () => {
    const runAnalysis = vi.fn();
    mocked.mockReturnValue(baseState({ runAnalysis }));
    render(<ContractTestingDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze contract' }));
    expect(runAnalysis).toHaveBeenCalled();
  });
});
