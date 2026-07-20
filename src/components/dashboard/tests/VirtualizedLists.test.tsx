import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import VirtualList from '../../common/VirtualList';
import { VirtualTxList, VirtualOpList } from '../VirtualizedLists';

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
});
