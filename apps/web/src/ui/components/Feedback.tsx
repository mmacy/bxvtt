import { Progress } from 'radix-ui';
import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { Tooltip } from './Popover';
import styles from './Feedback.module.css';

export interface SkeletonProps {
  /** Width as a CSS length. Defaults to 100%. */
  width?: CSSProperties['width'];
  /** Height as a CSS length. Defaults to one line of text. */
  height?: CSSProperties['height'];
  shape?: 'text' | 'block' | 'circle';
  /** Number of text lines. The last line is shorter. */
  lines?: number;
  className?: string;
}

/** A placeholder that holds the space of content that is still loading. */
export function Skeleton({ width, height, shape = 'text', lines = 1, className }: SkeletonProps) {
  if (shape === 'text' && lines > 1) {
    return (
      <span className={cx(styles.skeletonGroup, className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={cx(styles.skeleton, styles.text)}
            style={{ width: i === lines - 1 ? '62%' : (width ?? '100%') }}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(styles.skeleton, styles[shape], className)}
      style={{ width, height }}
    />
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** One or two sentences that say what the user can do next. */
  description?: ReactNode;
  /** The next action, usually a Button. */
  action?: ReactNode;
  /** "compact" fits in a dock tab or a list. */
  size?: 'compact' | 'default';
  /** The element for the title: a paragraph by default, or a heading when the state is the whole page. */
  titleAs?: 'p' | 'h1' | 'h2';
  className?: string;
}

/** Fills an empty list or panel with what the user can do next. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'default',
  titleAs: Title = 'p',
  className,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, styles[`empty-${size}`], className)}>
      {icon && (
        <span className={styles.emptyIcon}>
          <Icon name={icon} size={size === 'compact' ? 24 : 32} />
        </span>
      )}
      <Title className={styles.emptyTitle}>{title}</Title>
      {description && <p className={styles.emptyDescription}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

export interface ProgressBarProps {
  /** Current value. Leave it undefined for an indeterminate bar. */
  value?: number;
  max?: number;
  /** Accessible name, such as "Uploading adventure". */
  label: string;
  /** Shows the label and value above the bar. */
  showLabel?: boolean;
  tone?: 'accent' | 'success' | 'danger' | 'magic' | 'gold';
  size?: 'sm' | 'md';
  className?: string;
}

/** A determinate or indeterminate progress bar. */
export function ProgressBar({
  value,
  max = 100,
  label,
  showLabel = false,
  tone = 'accent',
  size = 'md',
  className,
}: ProgressBarProps) {
  const pct = value === undefined ? undefined : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx(styles.progressWrap, className)}>
      {showLabel && (
        <div className={styles.progressLabel}>
          <span>{label}</span>
          {pct !== undefined && <span className={styles.progressValue}>{Math.round(pct)}%</span>}
        </div>
      )}
      <Progress.Root
        className={cx(styles.progress, styles[`progress-${size}`], styles[`tone-${tone}`])}
        value={value ?? null}
        max={max}
        aria-label={label}
      >
        <Progress.Indicator
          className={cx(styles.indicator, pct === undefined && styles.indeterminate)}
          style={pct === undefined ? undefined : { transform: `translateX(-${100 - pct}%)` }}
        />
      </Progress.Root>
    </div>
  );
}

export type BannerTone = 'info' | 'success' | 'warning' | 'danger' | 'referee' | 'neutral';

/**
 * How a screen reader learns of a banner: `alert` interrupts at once, `status` waits for a pause, and `none` says
 * nothing until the reader reaches it.
 */
export type BannerAnnounce = 'alert' | 'status' | 'none';

export interface BannerProps {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  /** Buttons or links on the trailing edge. */
  actions?: ReactNode;
  /** Shows a close button with this accessible name. */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Overrides the default icon for the tone. */
  icon?: IconName;
  /**
   * How a screen reader learns of the banner. Defaults to `alert` for the warning and danger tones and to
   * `status` for the rest. Pass `status` or `none` for a banner that appears whenever a view opens, such as a
   * forecast that a choice won't work, so it doesn't interrupt each time.
   */
  announce?: BannerAnnounce;
  className?: string;
}

const bannerIcon: Record<BannerTone, IconName> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  referee: 'referee',
  neutral: 'info',
};

/** A callout inside the page flow, such as a refused command or a referee-only note. */
export function Banner({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
  dismissLabel = 'Dismiss',
  icon,
  announce = tone === 'danger' || tone === 'warning' ? 'alert' : 'status',
  className,
}: BannerProps) {
  return (
    <div
      className={cx(styles.banner, styles[`banner-${tone}`], className)}
      role={announce === 'none' ? undefined : announce}
    >
      <Icon name={icon ?? bannerIcon[tone]} size={18} className={styles.bannerIcon} />
      <div className={styles.bannerBody}>
        {title && <p className={styles.bannerTitle}>{title}</p>}
        {children && <div className={styles.bannerText}>{children}</div>}
      </div>
      {actions && <div className={styles.bannerActions}>{actions}</div>}
      {onDismiss && (
        <Tooltip content={dismissLabel} describe={false}>
          <button
            type="button"
            className={styles.bannerDismiss}
            aria-label={dismissLabel}
            onClick={onDismiss}
          >
            <Icon name="close" size={16} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
