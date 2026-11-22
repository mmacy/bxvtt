import { useRuleTable, type RuleTable } from '@/app';
import type { ReactNode } from 'react';
import { Block, Nothing, ScrollTable } from '../Parts';
import { CatalogProblem, PageSkeleton } from '../Frame';
import styles from '../book.module.css';

/** A rule table set that has loaded, or the skeleton or problem to show in its place. */
export function useTableSet<T extends RuleTable>(
  name: string,
  guard: (table: RuleTable) => table is T,
  render: (table: T) => ReactNode,
): ReactNode {
  const result = useRuleTable(name);
  if (result.data !== null && guard(result.data)) return render(result.data);
  if (result.error !== null)
    return <CatalogProblem title="Couldn't load these tables" result={result} section="tables" />;
  return <PageSkeleton label="Loading tables" />;
}

/** One printed table: a heading, an optional note, and a table that scrolls sideways when it is wide. */
export function Figure({
  title,
  id,
  note,
  label,
  children,
  className,
}: {
  title: string;
  id?: string;
  note?: ReactNode;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Block title={title} id={id} className={className}>
      {note && <div className={styles.tableNote}>{note}</div>}
      <ScrollTable label={label ?? title}>{children}</ScrollTable>
    </Block>
  );
}

/** A cell value, with the em dash that the printed tables use for "no effect" shown as an empty mark. */
export function cellText(value: string): ReactNode {
  return value === '—' || value === '' ? <Nothing /> : value;
}
