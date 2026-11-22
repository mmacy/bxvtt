import { Separator } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Divider.module.css';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Text in the middle of a horizontal divider, such as "or". */
  children?: ReactNode;
  /** Marks the divider as decorative, so assistive technology skips it. Defaults to true. */
  decorative?: boolean;
  className?: string;
}

/** A hairline rule between groups of content. */
export function Divider({
  orientation = 'horizontal',
  children,
  decorative = true,
  className,
}: DividerProps) {
  if (children !== undefined && orientation === 'horizontal') {
    return (
      <div className={cx(styles.labelled, className)} role={decorative ? 'presentation' : 'separator'}>
        <span className={styles.line} />
        <span className={styles.text}>{children}</span>
        <span className={styles.line} />
      </div>
    );
  }
  return (
    <Separator.Root
      orientation={orientation}
      decorative={decorative}
      className={cx(styles.divider, styles[orientation], className)}
    />
  );
}
