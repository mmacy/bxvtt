import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './SectionLabel.module.css';

export interface SectionLabelProps {
  /** The label, in sentence case, such as "Marching order" or "Active quests". */
  children: ReactNode;
  /** A count after the label, such as the number of quests. */
  count?: number;
  /** Buttons or links on the trailing edge, such as "Change order". */
  actions?: ReactNode;
  /** The heading level. Defaults to 3. Pass `'none'` for a label that isn't a heading. */
  level?: 2 | 3 | 4 | 'none';
  /** "paper" sets the label in rubric red, for sections of a sheet or handout. */
  tone?: 'chrome' | 'paper';
  className?: string;
}

/**
 * A small heading for a group inside a panel, a dock tab, or a sheet, in sentence case. Use it instead of an
 * uppercase, letter-spaced label.
 */
export function SectionLabel({
  children,
  count,
  actions,
  level = 3,
  tone = 'chrome',
  className,
}: SectionLabelProps) {
  const Tag = level === 'none' ? 'p' : (`h${level}` as const);
  return (
    <div className={cx(styles.row, className)}>
      <Tag className={cx(styles.label, styles[tone])}>
        {children}
        {count !== undefined && <span className={styles.count}>{count}</span>}
      </Tag>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
