import { cx } from '../lib/cx';
import styles from './Wordmark.module.css';

export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Shows only the die mark, for tight spaces such as a favicon or a collapsed rail. */
  markOnly?: boolean;
  className?: string;
}

/** The d20 mark: a twenty-sided die seen face on, with a flame on its top face. */
export function WordmarkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx(styles.mark, className)} aria-hidden="true" focusable="false">
      <path className={styles.markBody} d="M16 2.2 28 9.1v13.8L16 29.8 4 22.9V9.1Z" />
      <path className={styles.markFace} d="M16 9.2 22.3 20H9.7Z" />
      <path
        className={styles.markLines}
        d="M16 2.2v7M28 9.1l-5.7 10.9M4 9.1l5.7 10.9M22.3 20l5.7 2.9M9.7 20 4 22.9M9.7 20 16 29.8l6.3-9.8M16 9.2 4 9.1M16 9.2l12-.1"
      />
      <path
        className={styles.flame}
        d="M16 11.6c1.3 1.5 2.1 2.7 2.1 4.1a2.1 2.1 0 0 1-4.2 0c0-.9.4-1.6.9-2.1.1.6.4.9.8 1 0-1.1.1-2 .4-3Z"
      />
    </svg>
  );
}

/** The bxvtt wordmark in Fraunces with its soft, wonky axes turned up. */
export function Wordmark({ size = 'md', markOnly = false, className }: WordmarkProps) {
  return (
    <span className={cx(styles.wordmark, styles[size], className)} role="img" aria-label="bxvtt">
      <WordmarkMark />
      {!markOnly && (
        <span className={styles.text} aria-hidden="true">
          bxvtt
        </span>
      )}
    </span>
  );
}
