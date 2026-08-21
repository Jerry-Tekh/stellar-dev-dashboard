import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocAnalysisDashboard from './DocAnalysisDashboard';
import useDocumentAnalysis from '../../hooks/useDocumentAnalysis';
import { analyzeDocuments, DocAnalysisError } from '../../lib/docAnalysis/client';
import { createDemoCorpus } from '../../lib/docAnalysis/fixtures';

vi.mock('../../hooks/useDocumentAnalysis');
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const demoSnapshot = await analyzeDocuments(createDemoCorpus());

function result(overrides: Partial<Awaited<ReturnType<typeof useDocumentAnalysis>>> = {}) {
  return {
    snapshot: demoSnapshot,
    hydrating: false,
    processing: false,
    error: null,
    usingFixtures: true,
    storageWarning: false,
    lastAnswer: null,
    lastSearch: null,
    validations: [],
    preferences: { minimumConfidence: 0.3, includeFixtures: true, maxSearchResults: 10 },
    ingest: vi.fn(),
    loadDemoCorpus: vi.fn(),
    reset: vi.fn(),
    ask: vi.fn(() => null),
    runSearch: vi.fn(() => null),
    validateFact: vi.fn(),
    setPreferences: vi.fn(),
    ...overrides,
  } as Awaited<ReturnType<typeof useDocumentAnalysis>>;
}

describe('DocAnalysisDashboard', () => {
  beforeEach(() => {
    vi.mocked(useDocumentAnalysis).mockReturnValue(result());
  });

  it('renders KPIs and demo-corpus state for a loaded snapshot', () => {
    render(<DocAnalysisDashboard />);
    expect(screen.getByRole('heading', { name: 'Document Analysis' })).toBeInTheDocument();
    expect(screen.getByText('DEMO CORPUS')).toBeInTheDocument();
    expect(screen.getByText('Entities')).toBeInTheDocument();
    expect(screen.getByText('Relationships')).toBeInTheDocument();
  });

  it('shows the hydration loading state', () => {
    vi.mocked(useDocumentAnalysis).mockReturnValue(result({ snapshot: null, hydrating: true }));
    render(<DocAnalysisDashboard />);
    expect(screen.getByText(/Preparing the knowledge base/i)).toBeInTheDocument();
  });

  it('shows an empty state with a demo-corpus call to action', () => {
    const value = result({ snapshot: null });
    vi.mocked(useDocumentAnalysis).mockReturnValue(value);
    render(<DocAnalysisDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /load demo corpus/i }));
    expect(value.loadDemoCorpus).toHaveBeenCalled();
  });

  it('surfaces fatal errors with recovery actions', () => {
    vi.mocked(useDocumentAnalysis).mockReturnValue(
      result({
        snapshot: null,
        error: new DocAnalysisError({
          code: 'processing-failed',
          message: 'boom',
          retryable: true,
        }),
      })
    );
    render(<DocAnalysisDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent(/document analysis unavailable/i);
    expect(screen.getByRole('button', { name: /start fresh/i })).toBeInTheDocument();
  });

  it('browses documents with summaries and concepts', () => {
    render(<DocAnalysisDashboard />);
    expect(screen.getAllByText(/AI summary/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Detected concepts/i).length).toBeGreaterThan(0);
  });

  it('answers questions with citations through the ask view', () => {
    const value = result({
      lastAnswer: {
        question: 'What is a trustline?',
        questionType: 'what-is',
        answer: 'A trustline authorizes holding an issued asset.',
        confidence: 0.82,
        citations: [
          {
            documentId: 'demo-payments-guide',
            documentTitle: 'Building Payments',
            sectionId: 's1',
            heading: 'Payments',
          },
        ],
        relatedConcepts: ['trustline'],
      },
      ask: vi.fn(() => null),
    });
    vi.mocked(useDocumentAnalysis).mockReturnValue(value);
    render(<DocAnalysisDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'ask' }));
    expect(screen.getByText(/A trustline authorizes holding an issued asset/)).toBeInTheDocument();
    expect(screen.getByText(/Building Payments/)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /answer confidence 82 percent/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'What is a trustline?' }));
    expect(value.ask).toHaveBeenCalledWith('What is a trustline?');
  });

  it('runs semantic search with explanations', () => {
    const value = result({
      runSearch: vi.fn(() => null),
      lastSearch: {
        query: 'trustline',
        tookMs: 3,
        totalMatches: 1,
        results: [
          {
            documentId: 'demo-doc',
            documentTitle: 'Trustlines Deep Dive',
            sectionId: 's0',
            heading: 'Trustlines',
            snippet: 'A trustline authorizes an asset for an account.',
            score: 0.71,
            matchedConcepts: ['trustline'],
            explanation: 'keyword relevance 2.10 + graph expansion via trustline',
            citation: {
              documentId: 'demo-doc',
              documentTitle: 'Trustlines Deep Dive',
              sectionId: 's0',
              heading: 'Trustlines',
            },
          },
        ],
      },
    });
    vi.mocked(useDocumentAnalysis).mockReturnValue(value);
    render(<DocAnalysisDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'search' }));
    expect(screen.getByText(/1 matching section/)).toBeInTheDocument();
    expect(screen.getByText(/graph expansion via trustline/)).toBeInTheDocument();
  });

  it('renders the graph table fallback for accessibility', () => {
    render(<DocAnalysisDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'graph' }));
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByRole('columnheader', { name: /entity/i })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').length).toBe(4);
  });

  it('validates learning-path facts from the insights view', () => {
    const value = result();
    vi.mocked(useDocumentAnalysis).mockReturnValue(value);
    render(<DocAnalysisDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'insights' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmButtons[0]);
    expect(value.validateFact).toHaveBeenCalledWith(expect.any(String), 'confirmed');
  });

  it('resets the knowledge base', () => {
    const value = result();
    vi.mocked(useDocumentAnalysis).mockReturnValue(value);
    render(<DocAnalysisDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /reset knowledge base/i }));
    expect(value.reset).toHaveBeenCalled();
  });
});
