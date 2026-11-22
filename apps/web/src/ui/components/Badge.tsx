import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import styles from './Badge.module.css';

export type BadgeTone =
  'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'magic' | 'gold' | 'referee';

export interface BadgeProps {
  tone?: BadgeTone;
  /** "soft" is a tinted fill; "outline" is a border only; "solid" is for counts. */
  appearance?: 'soft' | 'outline' | 'solid';
  icon?: IconName;
  children: ReactNode;
  className?: string;
}

/** A short status label, such as "Referee", "Caller", or "Away". */
export function Badge({ tone = 'neutral', appearance = 'soft', icon, children, className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], styles[appearance], className)}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export interface TagProps {
  children: ReactNode;
  /** Shows a remove button with this accessible name, such as "Remove torch". */
  removeLabel?: string;
  onRemove?: () => void;
  /** A player color id or CSS color for the leading swatch. */
  color?: string;
  className?: string;
}

/** A removable label for filters, item properties, and chosen options. */
export function Tag({ children, removeLabel, onRemove, color, className }: TagProps) {
  return (
    <span className={cx(styles.tag, className)}>
      {color && <span className={styles.swatch} style={{ background: color }} aria-hidden="true" />}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={removeLabel ?? 'Remove'}
          onClick={onRemove}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
}
