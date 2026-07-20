import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface VirtualListProps<T = unknown> {
  items: T[];
  rowHeight: number | ((index: number, item: T) => number);
  overscan?: number;
  children: (item: T, index: number, isFocused?: boolean) => React.ReactNode;
  onLoadMore?: () => void;
  loading?: boolean;
  className?: string;
  containerStyle?: React.CSSProperties;
  initialScrollTop?: number;
  onScrollPositionChange?: (scrollTop: number) => void;
}

/**
 * A highly optimized virtualization component that handles dynamic row heights,
 * scroll position preservation, keyboard navigation, and infinity scroll triggers.
 */
const VirtualList = <T,>({
  items,
  rowHeight,
  overscan = 5,
  children,
  onLoadMore,
  loading = false,
  className = '',
  containerStyle = {},
  initialScrollTop = 0,
  onScrollPositionChange,
}: VirtualListProps<T>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const [containerHeight, setContainerHeight] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Cache for dynamic heights and positions
  const metadata = useMemo(() => {
    const positions = [0];
    let totalHeight = 0;

    for (let i = 0; i < items.length; i++) {
      const height = typeof rowHeight === 'function' ? rowHeight(i, items[i]) : rowHeight;
      totalHeight += height;
      positions.push(totalHeight);
    }

    return { positions, totalHeight };
  }, [items, rowHeight]);

  // Binary search to find the start index for a given scroll position
  const findStartIndex = useCallback((scrollPos: number) => {
    let low = 0;
    let high = metadata.positions.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (metadata.positions[mid] <= scrollPos) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return Math.max(0, low - 1);
  }, [metadata.positions]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const currentScrollTop = containerRef.current.scrollTop;
      setScrollTop(currentScrollTop);
      onScrollPositionChange?.(currentScrollTop);

      // Check if we need to load more (scrolled within 5 rows of bottom)
      if (onLoadMore && !loading && items.length > 0) {
        const viewportHeight = containerRef.current.clientHeight || containerHeight;
        const endIndex = findStartIndex(currentScrollTop + viewportHeight);
        if (endIndex >= items.length - 5) {
          onLoadMore();
        }
      }
    }
  }, [onLoadMore, loading, items.length, containerHeight, findStartIndex, onScrollPositionChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (initialScrollTop > 0) {
      container.scrollTop = initialScrollTop;
    }

    setContainerHeight(container.clientHeight || 600);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setContainerHeight(entry.contentRect.height);
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [initialScrollTop]);

  // Handle keyboard navigation (ArrowUp, ArrowDown, PageUp, PageDown, Home, End)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;

    let nextIndex = focusedIndex;
    const viewportHeight = containerHeight || containerRef.current?.clientHeight || 600;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = focusedIndex < 0 ? 0 : Math.min(items.length - 1, focusedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = focusedIndex < 0 ? 0 : Math.max(0, focusedIndex - 1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      if (containerRef.current) {
        containerRef.current.scrollTop += viewportHeight;
      }
      return;
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      if (containerRef.current) {
        containerRef.current.scrollTop -= viewportHeight;
      }
      return;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
      if (containerRef.current) containerRef.current.scrollTop = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = items.length - 1;
      if (containerRef.current) containerRef.current.scrollTop = metadata.totalHeight;
    }

    if (nextIndex !== focusedIndex && nextIndex >= 0 && nextIndex < items.length) {
      setFocusedIndex(nextIndex);

      // Scroll focused item into view if outside viewport
      if (containerRef.current) {
        const itemTop = metadata.positions[nextIndex];
        const itemBottom = metadata.positions[nextIndex + 1];
        const currentTop = containerRef.current.scrollTop;
        const currentBottom = currentTop + viewportHeight;

        if (itemTop < currentTop) {
          containerRef.current.scrollTop = itemTop;
        } else if (itemBottom > currentBottom) {
          containerRef.current.scrollTop = itemBottom - viewportHeight;
        }
      }
    }
  }, [focusedIndex, items.length, containerHeight, metadata.positions, metadata.totalHeight]);

  const { start, end, translateY } = useMemo(() => {
    const startIndex = findStartIndex(scrollTop);
    const endIndex = findStartIndex(scrollTop + containerHeight);

    const actualStart = Math.max(0, startIndex - overscan);
    const actualEnd = Math.min(items.length, endIndex + overscan);

    return {
      start: actualStart,
      end: actualEnd,
      translateY: metadata.positions[actualStart],
    };
  }, [scrollTop, containerHeight, overscan, items.length, metadata, findStartIndex]);

  const visibleItems = items.slice(start, end).map((item, index) => {
    const actualIndex = start + index;
    const isFocused = actualIndex === focusedIndex;
    return (
      <div
        key={actualIndex}
        onClick={() => setFocusedIndex(actualIndex)}
        style={{
          height: typeof rowHeight === 'function' ? rowHeight(actualIndex, item) : rowHeight,
          outline: isFocused ? '1px solid var(--cyan)' : 'none',
          boxShadow: isFocused ? '0 0 8px rgba(0, 240, 255, 0.2)' : 'none',
        }}
      >
        {children(item, actualIndex, isFocused)}
      </div>
    );
  });

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Virtualized list container"
      className={className}
      style={{
        overflowY: 'auto',
        position: 'relative',
        willChange: 'transform',
        outline: 'none',
        ...containerStyle,
      }}
    >
      {/* Spacer to force scrollbar */}
      <div style={{ height: metadata.totalHeight, position: 'relative' }}>
        {/* Virtualized content window */}
        <div
          style={{
            transform: `translateY(${translateY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            willChange: 'transform',
          }}
        >
          {visibleItems}

          {loading && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <div className="spinner" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VirtualList;
