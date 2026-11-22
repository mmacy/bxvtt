import { sectionInfo, tableSetInfo, type Route } from './model';
import type { ResultKind, SearchGroup, SearchItem } from './search';
import type { RecentEntry } from './bookStore';

export const GROUP_LIMIT = 6;

export type Row =
  | { type: 'item'; item: SearchItem }
  | { type: 'more'; kind: ResultKind; hidden: number }
  | { type: 'spoiler'; hidden: number };

export interface RowGroup {
  kind: ResultKind;
  label: string;
  total: number;
  rows: Row[];
}

export function kindLabel(kind: ResultKind): string {
  return kind === 'license' ? 'Legal' : sectionInfo(kind).label;
}

/**
 * Lays search groups out as rows: each group shows its first few results and a row that shows the rest.
 * When `hideMagicItems` is set, magic items collapse to one row that asks the reader to accept the notice.
 */
export function buildRows(
  groups: readonly SearchGroup[],
  expanded: ReadonlySet<ResultKind>,
  hideMagicItems: boolean,
): { groups: RowGroup[]; flat: Row[] } {
  const out: RowGroup[] = [];
  for (const group of groups) {
    if (group.kind === 'magic-items' && hideMagicItems) {
      out.push({
        kind: group.kind,
        label: kindLabel(group.kind),
        total: group.items.length,
        rows: [{ type: 'spoiler', hidden: group.items.length }],
      });
      continue;
    }
    const shown = expanded.has(group.kind) ? group.items : group.items.slice(0, GROUP_LIMIT);
    const rows: Row[] = shown.map((item) => ({ type: 'item', item }));
    if (shown.length < group.items.length) {
      rows.push({ type: 'more', kind: group.kind, hidden: group.items.length - shown.length });
    }
    out.push({ kind: group.kind, label: kindLabel(group.kind), total: group.items.length, rows });
  }
  return { groups: out, flat: out.flatMap((group) => group.rows) };
}

/** Resolves recent entries to rows, skipping any whose catalog hasn't loaded or no longer has the entry. */
export function recentRows(
  recents: readonly RecentEntry[],
  items: readonly SearchItem[],
  hideMagicItems: boolean,
): Row[] {
  const rows: Row[] = [];
  for (const recent of recents) {
    if (recent.kind === 'license') {
      const license = items.find((item) => item.kind === 'license');
      if (license) rows.push({ type: 'item', item: license });
      continue;
    }
    const kind = recent.entryKind;
    if (!recent.id || !kind) continue;
    if (kind === 'magic-items' && hideMagicItems) continue;
    if (kind === 'tables') {
      const anchored = items.find(
        (item) => item.kind === 'tables' && item.id === `${recent.id}/${recent.anchor ?? ''}`,
      );
      const set = tableSetInfo(recent.id);
      const route: Route = { page: 'entry', kind: 'tables', id: recent.id };
      rows.push({
        type: 'item',
        item: anchored ?? {
          kind: 'tables',
          id: recent.id,
          name: `${set.label} tables`,
          subtitle: 'Table',
          route,
          nameNorm: '',
          words: [],
          tags: [],
        },
      });
      continue;
    }
    const found = items.find((item) => item.kind === kind && item.id === recent.id);
    if (found) rows.push({ type: 'item', item: found });
  }
  return rows;
}
