import { Collapsible, ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import { forwardRef, useId, type HTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/hooks';
import styles from './Surfaces.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover and pressed states. Put a button or link inside for the action itself. */
  interactive?: boolean;
  selected?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

/** A raised container for one item, such as a character in the lobby or an adventure to choose. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, selected = false, padding = 'md', className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        styles.card,
        styles[`pad-${padding}`],
        interactive && styles.interactive,
        selected && styles.selected,
        className,
      )}
      {...rest}
    />
  );
});

export interface PanelProps {
  title: ReactNode;
  /** Short text after the title, such as a count. */
  meta?: ReactNode;
  /** Buttons on the trailing edge of the header, usually IconButtons. */
  actions?: ReactNode;
  children?: ReactNode;
  /** Lets the user collapse the panel body. */
  collapsible?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "flush" removes body padding, for lists and tables that run edge to edge. */
  bodyPadding?: 'none' | 'sm' | 'md';
  /** Heading level of the title. Defaults to 2. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/** A titled section of the chrome, such as "Party" or "Initiative", with optional actions and collapse. */
export function Panel({
  title,
  meta,
  actions,
  children,
  collapsible = false,
  open,
  defaultOpen = true,
  onOpenChange,
  bodyPadding = 'md',
  headingLevel = 2,
  className,
}: PanelProps) {
  const [isOpen, setOpen] = useControllableState(open, defaultOpen, onOpenChange);
  const bodyId = useId();
  const Heading = `h${headingLevel}` as const;
  const header = (
    <div className={styles.panelHeader}>
      <Heading className={styles.panelTitle}>
        {collapsible ? (
          <Collapsible.Trigger className={styles.panelToggle} aria-controls={bodyId}>
            <Icon name="chevron-right" size={14} className={styles.chevron} />
            <span>{title}</span>
          </Collapsible.Trigger>
        ) : (
          title
        )}
      </Heading>
      {meta && <span className={styles.panelMeta}>{meta}</span>}
      {actions && <div className={styles.panelActions}>{actions}</div>}
    </div>
  );
  const body = <div className={cx(styles.panelBody, styles[`body-${bodyPadding}`])}>{children}</div>;
  if (!collapsible) {
    return (
      <section className={cx(styles.panel, className)}>
        {header}
        {body}
      </section>
    );
  }
  return (
    <Collapsible.Root asChild open={isOpen} onOpenChange={setOpen}>
      <section className={cx(styles.panel, className)} data-state={isOpen ? 'open' : 'closed'}>
        {header}
        <Collapsible.Content id={bodyId} className={styles.collapsibleContent}>
          {body}
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}

export interface ParchmentProps extends HTMLAttributes<HTMLDivElement> {
  /** "sheet" has generous padding for character sheets; "note" is a smaller handout. */
  variant?: 'sheet' | 'note' | 'plain';
  /** Draws faint ruled lines, as in a journal. */
  ruled?: boolean;
}

/**
 * A paper surface for the things that are paper at a real table: character sheets, handouts,
 * and the journal. Kit components inside switch to ink-on-vellum colors.
 */
export const Parchment = forwardRef<HTMLDivElement, ParchmentProps>(function Parchment(
  { variant = 'sheet', ruled = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-surface="paper"
      className={cx(styles.parchment, styles[`paper-${variant}`], ruled && styles.ruled, className)}
      {...rest}
    />
  );
});

export interface ScrollAreaProps {
  children: ReactNode;
  /** Maximum height as a CSS length. Without it, the area fills its parent. */
  maxHeight?: string | number;
  orientation?: 'vertical' | 'horizontal' | 'both';
  className?: string;
  /** Accessible name for the scrolling region, when it holds important content. */
  label?: string;
}

/** A scrolling region with slim scrollbars that match the chrome. */
export function ScrollArea({
  children,
  maxHeight,
  orientation = 'vertical',
  className,
  label,
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root className={cx(styles.scrollRoot, className)} type="hover">
      <ScrollAreaPrimitive.Viewport
        className={styles.scrollViewport}
        style={maxHeight !== undefined ? { maxHeight } : undefined}
        tabIndex={label ? 0 : undefined}
        aria-label={label}
        role={label ? 'region' : undefined}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== 'horizontal' && (
        <ScrollAreaPrimitive.Scrollbar orientation="vertical" className={styles.scrollbar}>
          <ScrollAreaPrimitive.Thumb className={styles.thumb} />
        </ScrollAreaPrimitive.Scrollbar>
      )}
      {orientation !== 'vertical' && (
        <ScrollAreaPrimitive.Scrollbar orientation="horizontal" className={styles.scrollbar}>
          <ScrollAreaPrimitive.Thumb className={styles.thumb} />
        </ScrollAreaPrimitive.Scrollbar>
      )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
