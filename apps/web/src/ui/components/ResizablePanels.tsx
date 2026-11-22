import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './ResizablePanels.module.css';

export interface SplitterProps {
  /** "vertical" is a vertical bar that resizes left and right. */
  orientation: 'vertical' | 'horizontal';
  /** Current size of the controlled pane in pixels. */
  size: number;
  min: number;
  max: number;
  /** Called with the new size while dragging and on each key press. */
  onSizeChange: (size: number) => void;
  /**
   * Which side of the splitter the controlled pane sits on. With "end", dragging toward the
   * start makes the pane larger.
   */
  paneSide?: 'start' | 'end';
  /** Accessible name, such as "Resize dock". */
  label: string;
  /** Id of the pane this splitter resizes. */
  controls?: string;
  /** Called on Enter, for example to collapse the pane. */
  onToggle?: () => void;
  /** Called with the final size when a drag ends. */
  onResizeEnd?: (size: number) => void;
  className?: string;
}

const KEY_STEP = 16;

/** A draggable, keyboard-operable bar between two panes. Arrow keys resize; Home and End jump to the limits. */
export function Splitter({
  orientation,
  size,
  min,
  max,
  onSizeChange,
  paneSide = 'start',
  label,
  controls,
  onToggle,
  onResizeEnd,
  className,
}: SplitterProps) {
  const drag = useRef<{ start: number; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  const sign = paneSide === 'start' ? 1 : -1;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: orientation === 'vertical' ? event.clientX : event.clientY, size };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const position = orientation === 'vertical' ? event.clientX : event.clientY;
    onSizeChange(clamp(drag.current.size + (position - drag.current.start) * sign));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDragging(false);
    onResizeEnd?.(size);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const grow =
      orientation === 'vertical'
        ? sign > 0
          ? 'ArrowRight'
          : 'ArrowLeft'
        : sign > 0
          ? 'ArrowDown'
          : 'ArrowUp';
    const shrink =
      orientation === 'vertical'
        ? sign > 0
          ? 'ArrowLeft'
          : 'ArrowRight'
        : sign > 0
          ? 'ArrowUp'
          : 'ArrowDown';
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    let next: number | null = null;
    if (event.key === grow) next = size + step;
    else if (event.key === shrink) next = size - step;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    else if (event.key === 'Enter' && onToggle) {
      event.preventDefault();
      onToggle();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      const clamped = clamp(next);
      onSizeChange(clamped);
      onResizeEnd?.(clamped);
    }
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-controls={controls}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      className={cx(styles.splitter, styles[orientation], dragging && styles.dragging, className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className={styles.grip} aria-hidden="true" />
    </div>
  );
}

export interface ResizablePanelsProps {
  /** "horizontal" places panes side by side; "vertical" stacks them. */
  direction?: 'horizontal' | 'vertical';
  start: ReactNode;
  end: ReactNode;
  /** Which pane has a fixed, resizable size. The other fills the rest. */
  sizedPane?: 'start' | 'end';
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  /** Accessible name for the splitter. */
  label?: string;
  className?: string;
}

/** Two panes with a drag splitter between them. */
export function ResizablePanels({
  direction = 'horizontal',
  start,
  end,
  sizedPane = 'start',
  defaultSize = 280,
  minSize = 160,
  maxSize = 640,
  label = 'Resize panes',
  className,
}: ResizablePanelsProps) {
  const [size, setSize] = useState(defaultSize);
  const sizeStyle = direction === 'horizontal' ? { width: size } : { height: size };
  return (
    <div className={cx(styles.panels, styles[direction], className)}>
      <div
        className={cx(styles.pane, sizedPane === 'start' ? styles.sized : styles.fill)}
        style={sizedPane === 'start' ? sizeStyle : undefined}
      >
        {start}
      </div>
      <Splitter
        orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
        size={size}
        min={minSize}
        max={maxSize}
        onSizeChange={setSize}
        paneSide={sizedPane}
        label={label}
      />
      <div
        className={cx(styles.pane, sizedPane === 'end' ? styles.sized : styles.fill)}
        style={sizedPane === 'end' ? sizeStyle : undefined}
      >
        {end}
      </div>
    </div>
  );
}
