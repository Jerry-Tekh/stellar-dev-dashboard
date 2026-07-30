import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import VirtualList from '../../common/VirtualList';
import { VirtualTxList, VirtualOpList, VirtualStorageList } from '../VirtualizedLists';
import type { StorageEntry } from '../../../lib/contractStorage';

// Mock CopyableValue
vi.mock('../CopyableValue', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span data-testid="copyable">{children}</span>,
}));

// Mock stellar.shortAddress & getOperationLabel
vi.mock('../../../lib/stellar', () => ({
  shortAddress: (addr: string) => addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : '',
  getOperationLabel: (type: string) => type || 'Operation',
}));

describe('Virtualized Lists & VirtualList', () => {
  beforeEach(() => {
    cleanup();
  });

  const createDummyItems = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
    }));
  };

  it('renders windowed list: only a fraction of rows in DOM for large dataset', () => {
    const items = createDummyItems(100);
    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={50}
        overscan={5}
        containerStyle={{ height: '300px' }}
      >
        {(item: { id: string; name: string }) => (
          <div data-testid="list-row">{item.name}</div>
        )}
      </VirtualList>
    );

    const rows = container.querySelectorAll('[data-testid="list-row"]');
    // Height 300px / 50px rowHeight = 6 visible rows + overscan (5 * 2) = max ~16-17 rows, far less than 100
    expect(rows.length).toBeLessThan(25);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('preserves scroll position when initialScrollTop is passed', () => {
    const items = createDummyItems(50);
    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={50}
        initialScrollTop={200}
        containerStyle={{ height: '300px' }}
      >
        {(item: { id: string; name: string }) => <div>{item.name}</div>}
      </VirtualList>
    );

    const scrollContainer = container.querySelector('[role="region"]');
    expect(scrollContainer).toBeInTheDocument();
    expect((scrollContainer as HTMLElement).scrollTop).toBe(200);
  });

  it('triggers onLoadMore when scrolling within 5 rows of bottom', () => {
    const onLoadMore = vi.fn();
    const items = createDummyItems(20);

    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={50}
        containerStyle={{ height: '300px' }}
        onLoadMore={onLoadMore}
      >
        {(item: { id: string; name: string }) => <div>{item.name}</div>}
      </VirtualList>
    );

    const scrollContainer = container.querySelector('[role="region"]') as HTMLDivElement;
    expect(scrollContainer).toBeInTheDocument();

    // Total height = 20 * 50 = 1000px. Viewport = 300px.
    // 5 rows from bottom = 15th row (750px scrollPos).
    // Scroll to 800px (within 5 rows of bottom)
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, writable: true });
    scrollContainer.scrollTop = 750;
    fireEvent.scroll(scrollContainer);

    expect(onLoadMore).toHaveBeenCalled();
  });

  it('handles keyboard navigation (ArrowDown and ArrowUp)', () => {
    const items = createDummyItems(10);
    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={50}
        containerStyle={{ height: '300px' }}
      >
        {(item: { id: string; name: string }, _index: number, isFocused?: boolean) => (
          <div data-testid="focusable-row" data-focused={String(isFocused)}>
            {item.name}
          </div>
        )}
      </VirtualList>
    );

    const scrollContainer = container.querySelector('[role="region"]') as HTMLDivElement;
    scrollContainer.focus();

    // Press ArrowDown to focus item 0
    fireEvent.keyDown(scrollContainer, { key: 'ArrowDown' });
    let rows = container.querySelectorAll('[data-testid="focusable-row"]');
    expect(rows[0]).toHaveAttribute('data-focused', 'true');

    // Press ArrowDown again to move focus to item 1
    fireEvent.keyDown(scrollContainer, { key: 'ArrowDown' });
    rows = container.querySelectorAll('[data-testid="focusable-row"]');
    expect(rows[1]).toHaveAttribute('data-focused', 'true');

    // Press ArrowUp to move focus back to item 0
    fireEvent.keyDown(scrollContainer, { key: 'ArrowUp' });
    rows = container.querySelectorAll('[data-testid="focusable-row"]');
    expect(rows[0]).toHaveAttribute('data-focused', 'true');
  });

  it('renders VirtualTxList with address labels correctly', () => {
    const txItems = [
      {
        id: 'tx1',
        hash: '0x1234567890abcdef1234567890abcdef',
        successful: true,
        fee_charged: '100',
        source_account: 'GABC1234567890',
        operation_count: 1,
        created_at: '2026-07-20T12:00:00Z',
        memo: 'test memo',
      } as any,
    ];

    render(
      <VirtualTxList
        items={txItems}
        network="testnet"
        addressLabels={{ 'GABC1234567890': 'Main Account' }}
      />
    );

    expect(screen.getByText(/Main Account/i)).toBeInTheDocument();
    expect(screen.getByText(/test memo/i)).toBeInTheDocument();
  });

  it('renders VirtualOpList with address labels correctly', () => {
    const opItems = [
      {
        id: 'op1',
        type: 'payment',
        created_at: '2026-07-20T12:00:00Z',
        from: 'GSRC1234567890',
        to: 'GDST1234567890',
        amount: '50.00',
      } as any,
    ];

    render(
      <VirtualOpList
        items={opItems}
        network="testnet"
        addressLabels={{
          'GSRC1234567890': 'Alice Wallet',
          'GDST1234567890': 'Bob Wallet',
        }}
      />
    );

    expect(screen.getByText(/Alice Wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/Bob Wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/50.0000 XLM/i)).toBeInTheDocument();
  });

  describe('VirtualStorageList', () => {
    const entry = (overrides: Partial<StorageEntry> = {}): StorageEntry => ({
      id: 'persistent:key1',
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
    });

    it('shows durability, a value preview, and a TTL badge per row', () => {
      render(
        <VirtualStorageList
          items={[entry({ liveUntilLedgerSeq: 1100 })]}
          latestLedger={1000}
          expandedId={null}
          onToggleExpand={() => {}}
        />,
      );

      expect(screen.getByText('persistent')).toBeInTheDocument();
      expect(screen.getByText('balance_alice')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText(/100 ledgers/)).toBeInTheDocument();
    });

    it('expands a row to show the full type-aware key/value detail on toggle', () => {
      const onToggleExpand = vi.fn();
      const { rerender } = render(
        <VirtualStorageList
          items={[entry()]}
          latestLedger={1000}
          expandedId={null}
          onToggleExpand={onToggleExpand}
        />,
      );

      fireEvent.click(screen.getByText('View'));
      expect(onToggleExpand).toHaveBeenCalledWith('persistent:key1');

      rerender(
        <VirtualStorageList
          items={[entry()]}
          latestLedger={1000}
          expandedId="persistent:key1"
          onToggleExpand={onToggleExpand}
        />,
      );

      expect(screen.getByText('Hide')).toBeInTheDocument();
      expect(screen.getByText('Key')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
    });

    it('renders undecoded entries with a raw-XDR fallback label instead of crashing', () => {
      render(
        <VirtualStorageList
          items={[
            entry({
              id: 'persistent:raw',
              value: 'AAAAB2VuY29kZWQ=',
              valueDecoded: false,
              valueRawXdr: 'AAAAB2VuY29kZWQ=',
            }),
          ]}
          latestLedger={1000}
          expandedId="persistent:raw"
          onToggleExpand={() => {}}
        />,
      );

      expect(screen.getByText(/raw xdr:/)).toBeInTheDocument();
      expect(screen.getByText(/type unknown/)).toBeInTheDocument();
    });

    it('only mounts a small windowed subset of DOM rows for 5,000 entries', () => {
      const items = Array.from({ length: 5000 }, (_, i) => entry({ id: `persistent:${i}`, key: `key_${i}` }));
      const { container } = render(
        <VirtualStorageList items={items} latestLedger={1000} expandedId={null} onToggleExpand={() => {}} />,
      );

      const renderedKeys = container.querySelectorAll('[role="region"] > div > div');
      expect(renderedKeys.length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^key_\d+$/).length).toBeLessThan(100);
    });
  });
});
