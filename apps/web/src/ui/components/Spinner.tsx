import { cx } from '../lib/cx';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  /** Size in pixels. Defaults to 16. */
  size?: number;
  /** Accessible name. Defaults to "Loading". Pass an empty string when a parent already announces the state. */
  label?: string;
  className?: string;
}

/** An indeterminate progress indicator: a small brass ring that turns. */
export function Spinner({ size = 16, label = 'Loading', className }: SpinnerProps) {
  return (
    <span
      className={cx(styles.spinner, className)}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
