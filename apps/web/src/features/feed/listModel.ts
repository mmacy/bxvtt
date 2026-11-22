/**
 * The measurements behind the feed's windowed list: each row's height, where the viewport is, which row the
 * reader is looking at, and whether the reader is at the bottom. It lives outside React state so a scroll or a
 * measurement doesn't rebuild the rows, and React reads it with `useSyncExternalStore`.
 */

/** How close to the bottom, in pixels, counts as "at the bottom". */
export const BOTTOM_SLACK = 40;

/** How far, in pixels, the viewport can move before the list renders a new window of rows. */
export const RENDER_SLACK = 240;

/** The row at the top of the viewport, so the list can keep it still when rows above it change. */
export interface Anchor {
  key: string;
  /** The row's top minus the scroll position, in pixels. */
  delta: number;
}

/** Finds the last index whose offset is at or before `value`. */
export function lowerBound(offsets: readonly number[], value: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((offsets[mid] ?? 0) <= value) low = mid;
    else high = mid - 1;
  }
  return low;
}

export class ListModel {
  private heights = new Map<string, number>();
  private listeners = new Set<() => void>();
  private version = 0;
  /** Changes only when a row or the header is measured, so the row offsets are recomputed only then. */
  measureVersion = 0;
  /** The scroll position at the last render. Small scrolls don't render, because the window has overscan. */
  private renderedTop = 0;
  anchor: Anchor | null = null;
  atBottom = true;
  scrollTop = 0;
  viewportHeight = 0;
  headerHeight = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** Records a row's measured height. Returns whether it changed. */
  measure(key: string, height: number): boolean {
    if (this.heights.get(key) === height) return false;
    this.heights.set(key, height);
    return true;
  }

  /** Tells React that measurements changed. */
  flush(): void {
    this.measureVersion += 1;
    this.emit();
  }

  setHeader(height: number): void {
    if (this.headerHeight === height) return;
    this.headerHeight = height;
    this.measureVersion += 1;
    this.emit();
  }

  /**
   * Records the viewport after a scroll or a resize. It asks React to render only when the window of rows could
   * change: the viewport moved more than `slack` pixels since the last render, resized, or reached the bottom.
   */
  setViewport(scrollTop: number, height: number, atBottom: boolean, slack = RENDER_SLACK): void {
    const changed =
      Math.abs(scrollTop - this.renderedTop) > slack ||
      this.viewportHeight !== height ||
      this.atBottom !== atBottom;
    this.scrollTop = scrollTop;
    this.viewportHeight = height;
    this.atBottom = atBottom;
    if (changed) {
      this.renderedTop = scrollTop;
      this.emit();
    }
  }

  /** The top of each row and, at the end, the total height. */
  offsets<T>(items: readonly T[], keys: readonly string[], estimate: (item: T) => number): number[] {
    const result = new Array<number>(items.length + 1);
    let top = 0;
    for (let index = 0; index < items.length; index += 1) {
      result[index] = top;
      top += this.heights.get(keys[index] ?? '') ?? estimate(items[index] as T);
    }
    result[items.length] = top;
    return result;
  }

  /** Where the viewport should be: at the bottom while following, or with the anchor row where it was. */
  targetTop(keys: readonly string[], offsets: readonly number[], follow: boolean): number {
    const total = offsets[keys.length] ?? 0;
    if (this.atBottom && follow) return Math.max(0, total + this.headerHeight - this.viewportHeight);
    if (this.anchor !== null) {
      const index = keys.indexOf(this.anchor.key);
      if (index !== -1) return Math.max(0, (offsets[index] ?? 0) + this.headerHeight - this.anchor.delta);
    }
    return this.scrollTop;
  }

  /** Remembers the row at the top of the viewport. */
  updateAnchor(keys: readonly string[], offsets: readonly number[], scrollTop: number): void {
    const index = lowerBound(offsets, Math.max(0, scrollTop - this.headerHeight));
    const key = keys[index];
    this.anchor =
      key === undefined ? null : { key, delta: (offsets[index] ?? 0) + this.headerHeight - scrollTop };
  }
}
