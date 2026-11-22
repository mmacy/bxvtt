import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import styles from './DataTable.module.css';

export interface DataColumn<Row> {
  key: string;
  header: ReactNode;
  /** Cell content. Defaults to the row's property named by `key`. */
  cell?: (row: Row) => ReactNode;
  /** Value used to sort the column. Leave it out to make the column unsortable. */
  sortValue?: (row: Row) => string | number;
  align?: 'start' | 'end' | 'center';
  /** Renders the column in the numeric face with tabular figures. */
  numeric?: boolean;
  /** Width as a CSS length. */
  width?: string;
}

export type SortDirection = 'ascending' | 'descending';

export interface DataTableProps<Row> {
  columns: DataColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Visible or visually hidden caption that names the table. */
  caption: string;
  hideCaption?: boolean;
  defaultSort?: { key: string; direction: SortDirection };
  density?: 'compact' | 'comfortable';
  /** Highlights a row, such as the active combatant. */
  selectedKey?: string;
  onRowClick?: (row: Row) => void;
  /** Content when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

/** A dense, sortable table for monsters, equipment, saves, and logs. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  hideCaption = false,
  defaultSort,
  density = 'compact',
  selectedKey,
  onRowClick,
  empty,
  className,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState(defaultSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    const getValue = column?.sortValue;
    if (!getValue) return rows;
    const factor = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: 'ascending' },
    );
  };

  return (
    <div className={cx(styles.wrap, className)}>
      <table className={cx(styles.table, styles[density])}>
        <caption className={hideCaption ? 'visually-hidden' : styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cx(styles[`align-${column.align ?? (column.numeric ? 'end' : 'start')}`])}
                  aria-sort={active ? sort.direction : column.sortValue ? 'none' : undefined}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => toggleSort(column.key)}
                    >
                      <span>{column.header}</span>
                      <Icon
                        name={active ? (sort.direction === 'ascending' ? 'arrow-up' : 'arrow-down') : 'sort'}
                        size={12}
                        className={cx(styles.sortIcon, active && styles.sortActive)}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {empty ?? 'Nothing to show'}
              </td>
            </tr>
          ) : (
            sorted.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  className={cx(onRowClick && styles.clickable, selectedKey === key && styles.selected)}
                  aria-selected={selectedKey !== undefined ? selectedKey === key : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cx(
                        styles[`align-${column.align ?? (column.numeric ? 'end' : 'start')}`],
                        column.numeric && styles.numeric,
                      )}
                    >
                      {column.cell
                        ? column.cell(row)
                        : String((row as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
