/**
 * Governance dashboard tab tests.
 *
 * Exercises the pieces the acceptance criteria call out directly: a mixed
 * batch of proposal statuses renders into the right list, an already-voted
 * proposal shows the guard and hides the vote buttons, and voting requires
 * going through the confirmation dialog (which reuses submitGovernanceVote,
 * not a parallel submission path).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// jsdom has no ResizeObserver; Recharts' ResponsiveContainer needs one to mount.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = MockResizeObserver;

vi.mock('../../../lib/store', () => ({
  useStore: () => ({ connectedAddress: 'GVOTERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', network: 'testnet' }),
}));

vi.mock('../../../lib/stellar', () => ({
  isValidContractId: () => true,
}));

// Avoid touching IndexedDB in jsdom — same pattern used by Overview.test.tsx.
vi.mock('../../../hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initial: unknown) => {
    const [val, setVal] = React.useState(initial);
    return [val, setVal, true];
  },
}));

const fetchGovernanceProposals = vi.fn();
const submitGovernanceVote = vi.fn();

vi.mock('../../../lib/governance', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/governance')>('../../../lib/governance');
  return {
    ...actual,
    fetchGovernanceProposals: (...args: unknown[]) => fetchGovernanceProposals(...args),
    submitGovernanceVote: (...args: unknown[]) => submitGovernanceVote(...args),
  };
});

import Governance from '../Governance';
import { normalizeProposal, type AdapterProposalFields } from '../../../lib/governance';

function proposal(id: string, overrides: Partial<AdapterProposalFields>, currentLedger = 1000) {
  const fields: AdapterProposalFields = {
    title: `Proposal ${id}`,
    description: `Description for ${id}`,
    votesFor: '10',
    votesAgainst: '2',
    quorum: '5',
    deadlineLedger: 2000,
    ...overrides,
  };
  return normalizeProposal(id, fields, currentLedger);
}

describe('<Governance />', () => {
  beforeEach(() => {
    cleanup();
    fetchGovernanceProposals.mockReset();
    submitGovernanceVote.mockReset();
  });

  async function renderGovernance() {
    let result;
    await act(async () => {
      result = render(<Governance />);
    });
    return result;
  }

  async function loadWithProposals(proposals: ReturnType<typeof proposal>[]) {
    fetchGovernanceProposals.mockResolvedValue({ currentLedger: 1000, proposals });
    await renderGovernance();

    const input = screen.getByPlaceholderText('C... governance contract address');
    fireEvent.change(input, { target: { value: 'CGOVXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Load Proposals'));
    });
  }

  it('renders the tab header and configuration panel', async () => {
    await renderGovernance();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Governance Contract')).toBeInTheDocument();
  });

  it('categorizes a mixed batch of proposals: active proposals appear under Open, resolved ones do not', async () => {
    const active = proposal('1', { deadlineLedger: 5000 }); // active
    const passed = proposal('2', { votesFor: '10', votesAgainst: '1', deadlineLedger: 100 }); // passed
    const rejected = proposal('3', { votesFor: '1', votesAgainst: '10', deadlineLedger: 100 }); // rejected

    await loadWithProposals([active, passed, rejected]);

    await waitFor(() => {
      expect(screen.getAllByText(/#1 Proposal 1/).length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByText(/#2 Proposal 2/)).toHaveLength(0);
    expect(screen.queryAllByText(/#3 Proposal 3/)).toHaveLength(0);
  });

  it('shows resolved proposals with their final outcome under the History tab', async () => {
    const passed = proposal('2', { votesFor: '10', votesAgainst: '1', deadlineLedger: 100 });
    await loadWithProposals([passed]);

    await act(async () => {
      fireEvent.click(screen.getByText('History'));
    });

    expect(await screen.findByText(/#2 Proposal 2/)).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });

  it('shows an accurate "already voted" state and hides the vote buttons for a proposal the account already voted on', async () => {
    const alreadyVoted = proposal('1', { deadlineLedger: 5000 });
    alreadyVoted.myVote = { proposalId: '1', voter: 'GVOTER', choice: 'for', weight: null };

    await loadWithProposals([alreadyVoted]);

    await act(async () => {
      const matches = await screen.findAllByText(/#1 Proposal 1/);
      fireEvent.click(matches[0]);
    });

    expect(screen.getByText(/You already voted/)).toBeInTheDocument();
    expect(screen.getByText('FOR', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText('Vote FOR')).not.toBeInTheDocument();
    expect(screen.queryByText('Vote AGAINST')).not.toBeInTheDocument();
  });

  it('requires confirmation before submitting a vote, and submits exactly what the dialog described', async () => {
    const open = proposal('1', { deadlineLedger: 5000 });
    await loadWithProposals([open]);

    await act(async () => {
      const matches = await screen.findAllByText(/#1 Proposal 1/);
      fireEvent.click(matches[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Vote FOR'));
    });

    // Guarded: submission does not happen until the dialog is confirmed.
    expect(submitGovernanceVote).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: /confirm vote submission/i });
    expect(within(dialog).getByText('FOR', { selector: 'strong' })).toBeInTheDocument();

    const secretInput = screen.getByPlaceholderText('S... testnet secret key');
    fireEvent.change(secretInput, { target: { value: 'SSECRETKEY' } });

    submitGovernanceVote.mockResolvedValue({ hash: 'tx-hash', status: 'PENDING', errorResult: null, diagnosticEvents: [] });
    fetchGovernanceProposals.mockResolvedValue({ currentLedger: 1000, proposals: [open] });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm & Submit'));
    });

    expect(submitGovernanceVote).toHaveBeenCalledTimes(1);
    const call = submitGovernanceVote.mock.calls[0][0];
    expect(call).toMatchObject({ proposalId: '1', choice: 'for', secretKey: 'SSECRETKEY' });
  });

  it('disables voting on mainnet, consistent with the rest of the contract-writing tabs', async () => {
    vi.doMock('../../../lib/store', () => ({
      useStore: () => ({ connectedAddress: 'GVOTER', network: 'mainnet' }),
    }));
    vi.resetModules();
    const { default: GovernanceMainnet } = await import('../Governance');
    const open = proposal('1', { deadlineLedger: 5000 });
    fetchGovernanceProposals.mockResolvedValue({ currentLedger: 1000, proposals: [open] });

    await act(async () => {
      render(<GovernanceMainnet />);
    });

    const input = screen.getByPlaceholderText('C... governance contract address');
    fireEvent.change(input, { target: { value: 'CGOVXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Load Proposals'));
    });
    await act(async () => {
      const matches = await screen.findAllByText(/#1 Proposal 1/);
      fireEvent.click(matches[0]);
    });

    expect(screen.getByText('Vote FOR').closest('button')).toBeDisabled();
  });
});
