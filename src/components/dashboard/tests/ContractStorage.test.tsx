import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { StorageEntry, ContractStorageSnapshot } from '../../../lib/contractStorage';

vi.mock('../../../lib/store', () => ({
  useStore: () => ({ network: 'testnet', contractId: '' }),
}));

vi.mock('../../../lib/stellar', () => ({
  isValidContractId: (id: string) => typeof id === 'string' && id.startsWith('C') && id.length === 56,
}));

const fetchContractStorageSnapshot = vi.fn();
const exportJson = vi.fn();

vi.mock('../../../lib/contractStorage', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/contractStorage')>('../../../lib/contractStorage');
  return {
    ...actual,
    fetchContractStorageSnapshot: (...args: unknown[]) => fetchContractStorageSnapshot(...args),
  };
});

vi.mock('../../../utils/export', () => ({
  exportJson: (...args: unknown[]) => exportJson(...args),
}));

import ContractStorage from '../ContractStorage';

const VALID_CONTRACT_ID = `C${'A'.repeat(55)}`;

function makeEntry(overrides: Partial<StorageEntry> = {}): StorageEntry {
  return {
    id: `persistent:${Math.random()}`,
    durability: 'persistent',
    key: 'balance_alice',
    keyRawXdr: 'AAAA',
    keyDecoded: true,
    value: 500,
    valueRawXdr: 'BBBB',
    valueDecoded: true,
    liveUntilLedgerSeq: null,
    lastModifiedLedgerSeq: null,
    ...overrides,
  };
}

function makeSnapshot(entries: StorageEntry[], overrides: Partial<ContractStorageSnapshot> = {}): ContractStorageSnapshot {
  const counts = { instance: 0, persistent: 0, temporary: 0 };
  for (const entry of entries) counts[entry.durability] += 1;
  return {
    contractId: VALID_CONTRACT_ID,
    network: 'testnet',
    fetchedAt: '2026-07-30T00:00:00.000Z',
    latestLedger: 1000,
    entries,
    counts,
    warnings: [],
    ...overrides,
  };
}

async function fetchStorage(contractId = VALID_CONTRACT_ID) {
  const input = screen.getByPlaceholderText('C... contract address');
  fireEvent.change(input, { target: { value: contractId } });
  fireEvent.click(screen.getByText('Fetch Storage'));
  await waitFor(() => expect(fetchContractStorageSnapshot).toHaveBeenCalled());
}

describe('<ContractStorage />', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('disables Fetch Storage until a valid contract address is entered', () => {
    render(<ContractStorage />);
    const button = screen.getByText('Fetch Storage');
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('C... contract address'), {
      target: { value: VALID_CONTRACT_ID },
    });
    expect(screen.getByText('Fetch Storage')).not.toBeDisabled();
  });

  it('fetches and renders a summary with per-durability counts', async () => {
    fetchContractStorageSnapshot.mockResolvedValue(
      makeSnapshot([
        makeEntry({ id: 'instance:1', durability: 'instance', key: 'admin' }),
        makeEntry({ id: 'persistent:1', durability: 'persistent', key: 'balance_alice' }),
        makeEntry({ id: 'temporary:1', durability: 'temporary', key: 'nonce_bob' }),
      ]),
    );

    render(<ContractStorage />);
    await fetchStorage();

    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByText('balance_alice')).toBeInTheDocument();
    expect(screen.getByText('nonce_bob')).toBeInTheDocument();
  });

  it('surfaces a fetch error instead of crashing', async () => {
    fetchContractStorageSnapshot.mockRejectedValue(new Error('Contract not found'));

    render(<ContractStorage />);
    await fetchStorage();

    expect(await screen.findByText('Contract not found')).toBeInTheDocument();
  });

  it('filters the displayed entries by key prefix', async () => {
    fetchContractStorageSnapshot.mockResolvedValue(
      makeSnapshot([
        makeEntry({ id: 'p1', key: 'balance_alice' }),
        makeEntry({ id: 'p2', key: 'balance_bob' }),
        makeEntry({ id: 'p3', key: 'nonce_carol' }),
      ]),
    );

    render(<ContractStorage />);
    await fetchStorage();
    expect(await screen.findByText('balance_alice')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Key prefix filter...'), {
      target: { value: 'nonce' },
    });

    expect(screen.queryByText('balance_alice')).not.toBeInTheDocument();
    expect(screen.queryByText('balance_bob')).not.toBeInTheDocument();
    expect(screen.getByText('nonce_carol')).toBeInTheDocument();
  });

  it('filters the displayed entries by durability tab', async () => {
    fetchContractStorageSnapshot.mockResolvedValue(
      makeSnapshot([
        makeEntry({ id: 'i1', durability: 'instance', key: 'admin' }),
        makeEntry({ id: 'p1', durability: 'persistent', key: 'balance_alice' }),
      ]),
    );

    render(<ContractStorage />);
    await fetchStorage();
    expect(await screen.findByText('admin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Persistent' }));

    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.getByText('balance_alice')).toBeInTheDocument();
  });

  it('renders an undecodable entry as a labeled raw-XDR fallback instead of crashing', async () => {
    fetchContractStorageSnapshot.mockResolvedValue(
      makeSnapshot([
        makeEntry({
          id: 'raw1',
          key: 'weird_key',
          value: 'AAAAB2VuY29kZWQ=',
          valueDecoded: false,
          valueRawXdr: 'AAAAB2VuY29kZWQ=',
        }),
      ]),
    );

    render(<ContractStorage />);
    await fetchStorage();

    expect(await screen.findByText('weird_key')).toBeInTheDocument();
    expect(screen.getByText(/raw xdr:/)).toBeInTheDocument();
  });

  it('exports the currently filtered entries as JSON, matching what is displayed', async () => {
    fetchContractStorageSnapshot.mockResolvedValue(
      makeSnapshot([
        makeEntry({ id: 'p1', key: 'balance_alice', value: 500 }),
        makeEntry({ id: 'p2', key: 'balance_bob', value: 250 }),
      ]),
    );

    render(<ContractStorage />);
    await fetchStorage();
    expect(await screen.findByText('balance_alice')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Key prefix filter...'), {
      target: { value: 'balance_alice' },
    });
    expect(screen.queryByText('balance_bob')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Export JSON'));

    expect(exportJson).toHaveBeenCalledTimes(1);
    const [payload] = exportJson.mock.calls[0];
    expect(payload.entryCount).toBe(1);
    expect(payload.entries[0].key).toBe('balance_alice');
  });

  it('stays responsive with a large storage footprint by only rendering a windowed subset of rows', async () => {
    const manyEntries = Array.from({ length: 5000 }, (_, i) =>
      makeEntry({ id: `p${i}`, key: `key_${i}`, value: i }),
    );
    fetchContractStorageSnapshot.mockResolvedValue(makeSnapshot(manyEntries));

    const { container } = render(<ContractStorage />);
    await fetchStorage();

    await waitFor(() => expect(screen.getByText('key_0')).toBeInTheDocument());

    const scrollRegion = container.querySelector('[role="region"]');
    expect(scrollRegion).toBeInTheDocument();
    // 600px viewport / ~78px row height is nowhere near 5000 — virtualization must be windowing rows.
    const renderedKeys = screen.getAllByText(/^key_\d+$/);
    expect(renderedKeys.length).toBeLessThan(100);
  });
});
