import { Link, Parchment, cx, type BadgeProps } from '@/ui';
import { Badge } from '@/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './book.module.css';
import { anchorId, sectionInfo, type EntryKind, type SectionId } from './model';
import { useNavigation } from './navigation';
import { proseLines, splitLabel } from './typeset';

/** A cross-link to another entry. It is a button, so it works with the keyboard and keeps the drawer open. */
export function EntryLink({
  kind,
  id,
  anchor,
  children,
  title,
  tone = 'inline',
}: {
  kind: EntryKind;
  id: string;
  anchor?: string;
  children: ReactNode;
  title?: string;
  tone?: 'inline' | 'quiet';
}) {
  const { go } = useNavigation();
  return (
    <Link asChild tone={tone}>
      <button
        type="button"
        className={styles.entryLink}
        title={title}
        onClick={() => go({ page: 'entry', kind, id, ...(anchor ? { anchor } : {}) })}
      >
        {children}
      </button>
    </Link>
  );
}

/** A cross-link to a section index. */
export function SectionLink({ section, children }: { section: SectionId; children?: ReactNode }) {
  const { go } = useNavigation();
  return (
    <Link asChild tone="inline">
      <button type="button" className={styles.entryLink} onClick={() => go({ page: 'section', section })}>
        {children ?? sectionInfo(section).label}
      </button>
    </Link>
  );
}

/** A comma-separated list of nodes, with the separator outside the links. */
export function Inline({ items, separator = ', ' }: { items: readonly ReactNode[]; separator?: string }) {
  return (
    <span>
      {items.map((node, index) => (
        <span key={index}>
          {index > 0 && separator}
          {node}
        </span>
      ))}
    </span>
  );
}

/** Catalog prose: one paragraph per line, with a `Label:` at the start of a line set as a run-in head. */
export function Prose({
  text,
  lines,
  className,
}: {
  text?: string;
  lines?: readonly string[];
  className?: string;
}) {
  const all = lines ?? proseLines(text ?? '');
  return (
    <div className={cx(styles.prose, className)}>
      {all.map((raw, index) => {
        const { label, text: body } = splitLabel(raw.trim());
        return (
          <p key={index}>
            {label !== null && <strong className={styles.runIn}>{label}.</strong>} {body}
          </p>
        );
      })}
    </div>
  );
}

/** The page of an entry on parchment, with the title block at the top. */
export function EntryPage({
  kicker,
  title,
  badges,
  lede,
  children,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Parchment variant="plain" className={cx(styles.page, className)} data-entry-page="">
      <header className={styles.pageHeader}>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{title}</h2>
          {badges && <div className={styles.badges}>{badges}</div>}
        </div>
        {lede && <p className={styles.lede}>{lede}</p>}
      </header>
      {children}
    </Parchment>
  );
}

/** A titled part of a page, with the rule under its heading that a rulebook draws. */
export function Block({
  title,
  id,
  count,
  children,
  className,
}: {
  title: ReactNode;
  id?: string;
  count?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(styles.block, className)} id={id ? anchorId(id) : undefined} data-anchor={id}>
      <h3 className={styles.blockTitle}>
        <span>{title}</span>
        {count !== undefined && <span className={styles.blockCount}>{count}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A stat with its small-caps label, for the grid of a stat block or a fact sheet. */
export function Stat({
  label,
  children,
  span,
}: {
  label: string;
  children: ReactNode;
  span?: 2 | 3 | 'full';
}) {
  return (
    <div className={cx(styles.stat, span !== undefined && styles[`span-${span}`])}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{children}</dd>
    </div>
  );
}

/** A table that scrolls sideways inside the page when it is wider than the drawer. */
export function ScrollTable({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx(styles.scrollTable, className)} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export function PageBadge(props: BadgeProps) {
  return <Badge appearance="outline" {...props} />;
}

/** Scrolls to an anchor inside the page when it appears, and marks it for a moment. */
export function useAnchorScroll(anchor: string | undefined, ready: boolean): void {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!anchor || !ready || done.current === anchor) return;
    const target = document.getElementById(anchorId(anchor));
    if (!target) return;
    done.current = anchor;
    target.scrollIntoView({ block: 'start' });
    target.setAttribute('data-flash', '');
    const timer = setTimeout(() => target.removeAttribute('data-flash'), 1600);
    return () => clearTimeout(timer);
  }, [anchor, ready]);
}

/** The mark for an empty cell in a table. Screen readers hear "none". */
export function Nothing() {
  return (
    <span className={styles.nothing} role="img" aria-label="none">
      -
    </span>
  );
}
