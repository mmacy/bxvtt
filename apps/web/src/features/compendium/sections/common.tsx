import type { CatalogResult } from '@/app';
import { Button, EmptyState, Skeleton } from '@/ui';
import type { ReactNode } from 'react';
import { CatalogProblem } from '../Frame';
import styles from '../sections.module.css';
import { sectionInfo, type SectionId } from '../model';

/** The heading, count, and toolbar that open a section index. */
export function SectionShell({
  section,
  count,
  toolbar,
  children,
}: {
  section: SectionId;
  count?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const info = sectionInfo(section);
  return (
    <div className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{info.label}</h2>
        {count && <span className={styles.sectionCount}>{count}</span>}
        <p className={styles.sectionBlurb}>{info.blurb}</p>
      </header>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
      {children}
    </div>
  );
}

/** Shows a catalog's loading placeholder, its error with a retry, or its content. */
export function CatalogGate<T>({
  result,
  label,
  children,
}: {
  result: CatalogResult<T[]>;
  label: string;
  children: (items: T[]) => ReactNode;
}) {
  if (result.data !== null) {
    if (result.data.length === 0)
      return (
        <EmptyState
          icon="book"
          title={`No ${label} to show`}
          description="The rules server returned an empty list."
        />
      );
    return <>{children(result.data)}</>;
  }
  if (result.error !== null) return <CatalogProblem title={`Couldn't load the ${label}`} result={result} />;
  return (
    <div className={styles.loading} aria-busy="true" aria-label={`Loading the ${label}`}>
      <Skeleton shape="block" height={36} />
      <Skeleton shape="text" lines={8} />
    </div>
  );
}

/** `106 spells`, or `12 of 106 spells` when a filter hides some. */
export function countText(shown: number, total: number, noun: string): string {
  return shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
}

/** Tells the reader that a filter matched nothing, and how to widen it. */
export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon="search"
      size="compact"
      title="Nothing matches those filters"
      action={
        <Button size="sm" variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}
