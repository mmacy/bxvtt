import type { TableDetail, TableSummary } from '@bxvtt/shared/protocol';
import { useEffect, useState } from 'react';
import { getApi } from '@/app';

/**
 * The user's tables, sorted by what signing out or deleting the profile means for each. The server decides both,
 * and these groups follow its rules: leaving a table deletes it when the user is its last member and is refused
 * when the user is its only referee and others remain, and only a referee other than the member can let a member
 * back in through a rejoin request.
 */
export interface ProfileTables {
  /** Tables where someone else is a referee, who can let the user back in. */
  others: TableSummary[];
  /** Tables the user is the only member of. Deleting the profile deletes them. */
  alone: TableSummary[];
  /** Tables the user is the only referee of while others play there. The server refuses to delete the profile. */
  soleReferee: TableSummary[];
}

/**
 * Sorts the user's tables into {@link ProfileTables}.
 *
 * @param tables - The user's tables, from `listTables`.
 * @param details - The full description of each table where the user is a referee and has company, by table ID.
 *   A table without one counts as having another referee.
 */
export function sortProfileTables(tables: TableSummary[], details: Map<string, TableDetail>): ProfileTables {
  const sorted: ProfileTables = { others: [], alone: [], soleReferee: [] };
  for (const table of tables) {
    if (table.member_count <= 1) sorted.alone.push(table);
    else if (table.role === 'referee' && refereeCount(details.get(table.id)) === 1)
      sorted.soleReferee.push(table);
    else sorted.others.push(table);
  }
  return sorted;
}

function refereeCount(detail: TableDetail | undefined): number | null {
  return detail === undefined ? null : detail.members.filter((member) => member.role === 'referee').length;
}

/** The user's tables for a profile dialog: `null` while they load, or `'error'` when they couldn't be read. */
export type ProfileTablesState = ProfileTables | 'error' | null;

/**
 * Reads the user's tables while a dialog is open, and the members of each table the user referees with company,
 * to count its referees.
 *
 * @param enabled - Whether to read them. Each time it turns true, the tables are read again.
 */
export function useProfileTables(enabled: boolean): ProfileTablesState {
  const [state, setState] = useState<ProfileTablesState>(null);
  // Each opening reads the tables again, so a dialog never shows what was true the last time it opened.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled) setState(null);
  }
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const { items } = await getApi().listTables();
      const refereed = items.filter((table) => table.role === 'referee' && table.member_count > 1);
      const details = await Promise.all(refereed.map((table) => getApi().getTable(table.id)));
      return sortProfileTables(items, new Map(details.map((detail) => [detail.id, detail])));
    };
    load().then(
      (tables) => !cancelled && setState(tables),
      () => !cancelled && setState('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
