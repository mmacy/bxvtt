import { useSpellCatalog } from '@/app';
import type { SpellSummary } from '@bxvtt/shared/bxapi';
import { ordinal } from '@bxvtt/shared/text';
import { DataTable, SearchInput, SegmentedControl, type DataColumn } from '@/ui';
import { useMemo } from 'react';
import { useNavigation } from '../navigation';
import { EntryLink } from '../Parts';
import { useIndexState } from '../indexState';
import { matchesFilter, spellListLabel } from '../search';
import styles from '../sections.module.css';
import { CatalogGate, NoMatches, SectionShell, countText } from './common';

const COLUMNS: DataColumn<SpellSummary>[] = [
  {
    key: 'name',
    header: 'Spell',
    cell: (row) => (
      <EntryLink kind="spells" id={row.id} tone="quiet">
        {row.name}
      </EntryLink>
    ),
    sortValue: (row) => row.name,
    width: '40%',
  },
  {
    key: 'range',
    header: 'Range',
    cell: (row) => row.range,
    sortValue: (row) => row.range,
    width: '35%',
  },
  {
    key: 'duration',
    header: 'Duration',
    cell: (row) => row.duration,
    sortValue: (row) => row.duration,
    width: '25%',
  },
];

/** Spells by spell list and level. */
export function SpellsSection() {
  const spells = useSpellCatalog();
  const { go } = useNavigation();
  const filter = useIndexState((s) => s.spells);
  const setIndex = useIndexState((s) => s.set);
  const set = (patch: Partial<typeof filter>) => setIndex({ spells: { ...filter, ...patch } });

  const lists = useMemo(
    () => [...new Set((spells.data ?? []).map((spell) => spell.spell_list))].sort(),
    [spells.data],
  );
  const levels = useMemo(
    () => [...new Set((spells.data ?? []).map((spell) => spell.level))].sort((a, b) => a - b),
    [spells.data],
  );
  const visible = useMemo(
    () =>
      (spells.data ?? []).filter(
        (spell) =>
          (filter.list === 'all' || spell.spell_list === filter.list) &&
          (filter.level === 'all' || String(spell.level) === filter.level) &&
          matchesFilter(spell.name, filter.query),
      ),
    [spells.data, filter],
  );
  const grouped = useMemo(() => {
    const byKey = new Map<string, SpellSummary[]>();
    for (const spell of visible) {
      const key = `${spell.spell_list}:${spell.level}`;
      byKey.set(key, [...(byKey.get(key) ?? []), spell]);
    }
    return [...byKey.entries()]
      .map(([key, items]) => ({ key, list: items[0]?.spell_list ?? '', level: items[0]?.level ?? 0, items }))
      .sort((a, b) => a.list.localeCompare(b.list) || a.level - b.level);
  }, [visible]);

  const toolbar = (
    <>
      <SegmentedControl
        aria-label="Spell list"
        size="sm"
        value={filter.list}
        onValueChange={(list) => set({ list })}
        options={[
          { value: 'all', label: 'All lists' },
          ...lists.map((list) => ({ value: list, label: spellListLabel(list) })),
        ]}
      />
      <SegmentedControl
        aria-label="Spell level"
        size="sm"
        value={filter.level}
        onValueChange={(level) => set({ level })}
        options={[
          { value: 'all', label: 'Any level' },
          ...levels.map((level) => ({ value: String(level), label: ordinal(level) })),
        ]}
      />
      <SearchInput
        size="sm"
        aria-label="Filter spells by name"
        placeholder="Filter by name"
        value={filter.query}
        onValueChange={(query) => set({ query })}
        wrapperClassName={styles.filterInput}
      />
    </>
  );

  return (
    <SectionShell
      section="spells"
      count={spells.data ? countText(visible.length, spells.data.length, 'spells') : undefined}
      toolbar={toolbar}
    >
      <CatalogGate result={spells} label="spells">
        {() =>
          grouped.length === 0 ? (
            <NoMatches onClear={() => set({ list: 'all', level: 'all', query: '' })} />
          ) : (
            <div className={styles.groups}>
              {grouped.map((group) => (
                <section key={group.key} aria-labelledby={`spells-${group.key}`} className={styles.group}>
                  <h3 id={`spells-${group.key}`} className={styles.groupTitle}>
                    {spellListLabel(group.list)} spells, {ordinal(group.level)} level
                    <span className={styles.groupCount}>{group.items.length}</span>
                  </h3>
                  <DataTable
                    caption={`${spellListLabel(group.list)} spells of level ${group.level}`}
                    hideCaption
                    columns={COLUMNS}
                    rows={group.items}
                    rowKey={(row) => row.id}
                    defaultSort={{ key: 'name', direction: 'ascending' }}
                    density="comfortable"
                    onRowClick={(row) => go({ page: 'entry', kind: 'spells', id: row.id })}
                  />
                </section>
              ))}
            </div>
          )
        }
      </CatalogGate>
    </SectionShell>
  );
}
