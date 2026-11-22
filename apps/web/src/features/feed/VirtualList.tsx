import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { BOTTOM_SLACK, ListModel, lowerBound } from './listModel';

/** Rows the list renders without windowing. Short lists render whole, which keeps tests simple. */
const RENDER_ALL_BELOW = 60;
/** Pixels to render above and below the visible part. */
const OVERSCAN = 900;

export interface VirtualListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Scrolls so the row with this key is near the top of the viewport. */
  scrollToKey: (key: string) => void;
}

export interface ScrollState {
  atBottom: boolean;
  /** Pixels from the top of the content to the top of the viewport. */
  scrollTop: number;
}

export interface VirtualListProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, 'onScroll' | 'children'> {
  items: readonly T[];
  getKey: (item: T) => string;
  estimateSize: (item: T) => number;
  renderItem: (item: T) => ReactNode;
  /** Keeps the newest row in view when rows arrive, while the reader is at the bottom. */
  followOutput: boolean;
  onScrollStateChange?: (state: ScrollState) => void;
  /** Content above the first row, such as a "load older" control. */
  header?: ReactNode;
  /** Props for the element that wraps the rows, such as its role. */
  bodyProps?: HTMLAttributes<HTMLDivElement>;
}

interface RowProps<T> {
  rowKey: string;
  item: T;
  renderItem: (item: T) => ReactNode;
  measure: (element: HTMLDivElement | null) => (() => void) | undefined;
}

function RowInner<T>({ rowKey, item, renderItem, measure }: RowProps<T>) {
  return (
    <div data-row-key={rowKey} ref={measure}>
      {renderItem(item)}
    </div>
  );
}

/** One row. It renders again only when its item changes, so a scroll or a measurement leaves the rest alone. */
const Row = memo(RowInner) as typeof RowInner;

/**
 * A scrolling list that renders only the rows near the viewport. Rows measure themselves, the list keeps the row
 * at the top of the viewport still when rows above it change (such as older entries loading), and it sticks to
 * the bottom while the reader is there.
 */
function VirtualListInner<T>(
  {
    items,
    getKey,
    estimateSize,
    renderItem,
    followOutput,
    onScrollStateChange,
    header,
    bodyProps,
    ...rest
  }: VirtualListProps<T>,
  ref: ForwardedRef<VirtualListHandle>,
) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const headerElement = useRef<HTMLDivElement | null>(null);
  const [model] = useState(() => new ListModel());
  useSyncExternalStore(model.subscribe, model.getVersion, model.getVersion);
  const measureVersion = model.measureVersion;

  const keys = useMemo(() => items.map(getKey), [items, getKey]);
  // `measureVersion` changes when a row is measured, so the offsets are recomputed with the new height. A scroll
  // doesn't change it, so scrolling reuses the offsets.
  const offsets = useMemo(
    () => (measureVersion >= 0 ? model.offsets(items, keys, estimateSize) : []),
    [model, items, keys, estimateSize, measureVersion],
  );
  const total = offsets[items.length] ?? 0;
  const targetTop = model.targetTop(keys, offsets, followOutput);
  const viewportHeight = model.viewportHeight;
  const headerHeight = model.headerHeight;

  const windowed = items.length >= RENDER_ALL_BELOW && viewportHeight > 0;
  let start = 0;
  let end = items.length;
  if (windowed) {
    start = lowerBound(offsets, Math.max(0, targetTop - headerHeight - OVERSCAN));
    end = Math.min(
      items.length,
      lowerBound(offsets, targetTop - headerHeight + viewportHeight + OVERSCAN) + 1,
    );
  }
  const padTop = windowed ? (offsets[start] ?? 0) : 0;
  const padBottom = windowed ? total - (offsets[end] ?? total) : 0;

  const readScroll = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_SLACK;
    model.updateAnchor(keys, offsets, element.scrollTop);
    model.setViewport(element.scrollTop, element.clientHeight, atBottom);
    onScrollStateChange?.({ atBottom, scrollTop: element.scrollTop });
  }, [model, keys, offsets, onScrollStateChange]);

  // Put the viewport where it belongs after layout and before paint, so the reader never sees a jump. A render
  // from a scroll alone leaves the rows where they are, so it skips this: reading the scroll position forces the
  // browser to lay out the page at once.
  const placed = useRef<{ offsets: readonly number[]; follow: boolean; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const follow = model.atBottom && followOutput;
    const last = placed.current;
    if (last?.offsets === offsets && last.follow === follow && last.height === viewportHeight) return;
    placed.current = { offsets, follow, height: viewportHeight };
    if (follow) {
      element.scrollTop = element.scrollHeight;
    } else if (Math.abs(element.scrollTop - targetTop) >= 1) {
      element.scrollTop = targetTop;
    }
    model.updateAnchor(keys, offsets, element.scrollTop);
  });

  // Measure rows as they render and resize.
  const [observer] = useState(() => {
    if (typeof ResizeObserver === 'undefined') return null;
    let frame: number | null = null;
    let header: number | null = null;
    return new ResizeObserver((records) => {
      let changed = false;
      for (const record of records) {
        const target = record.target as HTMLElement;
        const key = target.dataset.rowKey;
        if (key === undefined) {
          header = target.offsetHeight;
          changed = true;
        } else if (model.measure(key, target.offsetHeight)) changed = true;
      }
      // Re-render on the next frame. Rendering new rows inside the observer's callback makes the browser report
      // "ResizeObserver loop completed with undelivered notifications".
      if (changed && frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          if (header !== null) model.setHeader(header);
          header = null;
          model.flush();
        });
      }
    });
  });

  useEffect(() => () => observer?.disconnect(), [observer]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    // The observer also reports the first size, which reads the viewport on mount.
    let frame: number | null = null;
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            // A reader at the bottom stays there when the list gets shorter, such as when the composer grows.
            if (model.atBottom && followOutput) element.scrollTop = element.scrollHeight;
            // Read the viewport on the next frame, for the same reason as the row observer above.
            if (frame === null) {
              frame = requestAnimationFrame(() => {
                frame = null;
                readScroll();
              });
            }
          });
    resize?.observe(element);
    return () => {
      resize?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [readScroll, model, followOutput]);

  useEffect(() => {
    const element = headerElement.current;
    if (!element || !observer) return;
    observer.observe(element);
    return () => observer.unobserve(element);
  }, [observer, header]);

  const measure = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !observer) return;
      observer.observe(element);
      return () => observer.unobserve(element);
    },
    [observer],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: (behavior: ScrollBehavior = 'auto') => {
        const element = scroller.current;
        if (!element) return;
        model.atBottom = true;
        if (typeof element.scrollTo === 'function') element.scrollTo({ top: element.scrollHeight, behavior });
        else element.scrollTop = element.scrollHeight;
      },
      scrollToKey: (key: string) => {
        const element = scroller.current;
        const index = keys.indexOf(key);
        if (!element || index === -1) return;
        model.atBottom = false;
        element.scrollTop = Math.max(0, (offsets[index] ?? 0) + headerHeight - 48);
        readScroll();
      },
    }),
    [model, keys, offsets, headerHeight, readScroll],
  );

  return (
    <div ref={scroller} onScroll={readScroll} {...rest}>
      {header !== undefined && <div ref={headerElement}>{header}</div>}
      <div {...bodyProps}>
        {padTop > 0 && <div aria-hidden="true" style={{ height: padTop }} />}
        {items.slice(start, end).map((item, offset) => {
          const key = keys[start + offset] ?? String(start + offset);
          return <Row key={key} rowKey={key} item={item} renderItem={renderItem} measure={measure} />;
        })}
        {padBottom > 0 && <div aria-hidden="true" style={{ height: padBottom }} />}
      </div>
    </div>
  );
}

/** A windowed list of rows with their own heights. */
export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: Ref<VirtualListHandle> },
) => ReactElement;
