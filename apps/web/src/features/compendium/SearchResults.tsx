import { Banner, Button, EmptyState, Icon, Spinner, type IconName } from '@/ui';
import { Fragment } from 'react';
import { sectionInfo } from './model';
import { highlight, type ResultKind, type SearchItem } from './search';
import styles from './results.module.css';
import type { Row, RowGroup } from './rows';

export const optionId = (index: number) => `compendium-option-${index}`;
export const LISTBOX_ID = 'compendium-results';

function kindIcon(kind: ResultKind): IconName {
  return kind === 'license' ? 'scroll' : sectionInfo(kind).icon;
}

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((segment, index) =>
        segment.match ? (
          <mark key={index} className={styles.mark}>
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

interface RowViewProps {
  row: Row;
  index: number;
  active: boolean;
  query: string;
  onHover: (index: number) => void;
  onChoose: (row: Row) => void;
}

function RowView({ row, index, active, query, onHover, onChoose }: RowViewProps) {
  const common = {
    id: optionId(index),
    role: 'option' as const,
    'aria-selected': active,
    onMouseMove: () => {
      if (!active) onHover(index);
    },
    onClick: () => onChoose(row),
  };
  if (row.type === 'more') {
    return (
      <div {...common} className={`${styles.row} ${styles.moreRow}`} data-active={active || undefined}>
        <span className={styles.moreText}>Show {row.hidden} more</span>
      </div>
    );
  }
  if (row.type === 'spoiler') {
    return (
      <div {...common} className={`${styles.row} ${styles.moreRow}`} data-active={active || undefined}>
        <Icon name="eye-off" size={16} />
        <span className={styles.moreText}>
          {row.hidden} magic {row.hidden === 1 ? 'item matches' : 'items match'}. Magic items can spoil
          surprises. Show them
        </span>
      </div>
    );
  }
  const item: SearchItem = row.item;
  return (
    <div {...common} className={styles.row} data-active={active || undefined}>
      <span className={styles.rowIcon}>
        <Icon name={kindIcon(item.kind)} size={16} />
      </span>
      <span className={styles.rowName}>
        <Marked text={item.name} query={query} />
      </span>
      <span className={styles.rowSubtitle}>{item.subtitle}</span>
    </div>
  );
}

export interface CatalogStatus {
  label: string;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}

/** Says which catalogs are missing from the results because they are still loading or failed to load. */
export function CatalogNotice({ statuses }: { statuses: readonly CatalogStatus[] }) {
  const loading = statuses.filter((status) => status.loading);
  const failed = statuses.filter((status) => status.failed);
  if (loading.length === 0 && failed.length === 0) return null;
  return (
    <div className={styles.notices}>
      {loading.length > 0 && (
        <p className={styles.loadingNote} role="status">
          <Spinner size={14} label="" />
          Still loading the {joinNames(loading.map((status) => status.label))}. More results can appear.
        </p>
      )}
      {failed.length > 0 && (
        <Banner
          tone="warning"
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => failed.forEach((status) => status.retry())}
            >
              Try again
            </Button>
          }
        >
          The {joinNames(failed.map((status) => status.label))} didn&rsquo;t load, so they aren&rsquo;t in
          these results.
        </Banner>
      )}
    </div>
  );
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** The rows under the search box. It renders in the page where the book's text goes while someone searches. */
export function SearchResults({
  groups,
  query,
  activeIndex,
  onHover,
  onChoose,
  onClear,
  statuses,
}: {
  statuses: readonly CatalogStatus[];
  groups: RowGroup[];
  query: string;
  activeIndex: number;
  onHover: (index: number) => void;
  onChoose: (row: Row) => void;
  onClear: () => void;
}) {
  if (groups.length === 0) {
    return (
      <>
        <EmptyState
          icon="search"
          title={`Nothing matches "${query.trim()}"`}
          description="Search by name, such as sleep or goblin. You can also search by level, such as 3rd level, or by hit dice, such as 4 hd."
          action={
            <Button variant="secondary" size="sm" onClick={onClear}>
              Clear search
            </Button>
          }
        />
        <CatalogNotice statuses={statuses} />
      </>
    );
  }
  let index = 0;
  return (
    <div className={styles.results}>
      <div id={LISTBOX_ID} role="listbox" aria-label="Search results" className={styles.listbox}>
        {groups.map((group) => (
          <div
            key={group.kind}
            role="group"
            aria-labelledby={`compendium-group-${group.kind}`}
            className={styles.group}
          >
            <div className={styles.groupTitle} id={`compendium-group-${group.kind}`}>
              {group.label}
              <span className={styles.groupCount}>{group.total}</span>
            </div>
            <div className={styles.rows}>
              {group.rows.map((row) => {
                const rowIndex = index++;
                return (
                  <RowView
                    key={
                      row.type === 'item' ? `${row.item.kind}:${row.item.id}` : `${row.type}:${group.kind}`
                    }
                    row={row}
                    index={rowIndex}
                    active={rowIndex === activeIndex}
                    query={query}
                    onHover={onHover}
                    onChoose={onChoose}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <CatalogNotice statuses={statuses} />
    </div>
  );
}

/** A list of rows without groups, for the recent entries on the home page. */
export function RecentList({
  rows,
  activeIndex,
  onHover,
  onChoose,
}: {
  rows: Row[];
  activeIndex: number;
  onHover: (index: number) => void;
  onChoose: (row: Row) => void;
}) {
  return (
    <div
      id={LISTBOX_ID}
      role="listbox"
      aria-label="Recent entries"
      className={`${styles.rows} ${styles.recent}`}
    >
      {rows.map((row, index) => (
        <RowView
          key={row.type === 'item' ? `${row.item.kind}:${row.item.id}` : `${row.type}:${index}`}
          row={row}
          index={index}
          active={index === activeIndex}
          query=""
          onHover={onHover}
          onChoose={onChoose}
        />
      ))}
    </div>
  );
}
