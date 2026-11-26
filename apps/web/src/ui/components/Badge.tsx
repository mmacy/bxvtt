import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { Popover, Tooltip } from './Popover';
import styles from './Badge.module.css';

export type BadgeTone =
  'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'magic' | 'gold' | 'referee';

export interface BadgeProps {
  tone?: BadgeTone;
  /** "soft" is a tinted fill; "outline" is a border only; "solid" is for counts. */
  appearance?: 'soft' | 'outline' | 'solid';
  icon?: IconName;
  children: ReactNode;
  /** An id, so a control can name the badge in `aria-describedby`, such as "2 left" after **Roll again**. */
  id?: string;
  className?: string;
}

/** A short status label, such as "Referee", "Caller", or "Away". */
export function Badge({ tone = 'neutral', appearance = 'soft', icon, children, id, className }: BadgeProps) {
  return (
    <span id={id} className={cx(styles.badge, styles[tone], styles[appearance], className)}>
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
        <Tooltip content={removeLabel ?? 'Remove'} describe={false}>
          <button
            type="button"
            className={styles.remove}
            aria-label={removeLabel ?? 'Remove'}
            onClick={onRemove}
          >
            <Icon name="close" size={12} />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

export interface BadgePopoverProps extends Omit<BadgeProps, 'id' | 'className'> {
  /**
   * The button's accessible name. Say what the button reveals, such as "Other table: show why", so a screen reader
   * doesn't read the badge as plain status.
   */
  buttonLabel: string;
  /** Names the popover for assistive technology, such as the badge's text. */
  popoverLabel: string;
  /** What the popover shows, such as the reason behind the badge. */
  content: ReactNode;
  className?: string;
}

/**
 * A badge that opens a popover with the reason behind it, on a tap, a click, Enter, or Space. Use it where a
 * tooltip would leave a touch screen without the reason, such as a mark a referee acts on.
 */
export function BadgePopover({ buttonLabel, popoverLabel, content, className, ...badge }: BadgePopoverProps) {
  return (
    <Popover
      label={popoverLabel}
      trigger={
        <button type="button" aria-label={buttonLabel} className={cx(styles.trigger, className)}>
          <Badge {...badge} />
        </button>
      }
    >
      {content}
    </Popover>
  );
}
