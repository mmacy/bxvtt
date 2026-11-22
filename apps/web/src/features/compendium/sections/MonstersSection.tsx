import { useMonsterCatalog } from '@/app';
import type { MonsterSummary } from '@bxvtt/shared/bxapi';
import { alignmentLabel, formatInteger } from '@bxvtt/shared/text';
import { DataTable, SearchInput, Select, type DataColumn } from '@/ui';
import { useMemo } from 'react';
import { useNavigation } from '../navigation';
import { useCatalogs } from '../catalogs';
import { monsterCategoryLabel } from '../entries/MonsterEntry';
import { EntryLink } from '../Parts';
import { useIndexState } from '../indexState';
import { matchesFilter } from '../search';
import styles from '../sections.module.css';
import { formatArmourClass, formatHitDice } from '../typeset';
import { CatalogGate, NoMatches, SectionShell, countText } from './common';

const HIT_DICE_BANDS: { value: string; label: string; test: (count: number) => boolean }[] = [
  { value: 'lt1', label: 'Under 1', test: (c) => c < 1 },
  { value: '1', label: '1', test: (c) => c === 1 },
  { value: '2', label: '2', test: (c) => c === 2 },
  { value: '3', label: '3', test: (c) => c === 3 },
  { value: '4', label: '4', test: (c) => c === 4 },
  { value: '5', label: '5', test: (c) => c === 5 },
  { value: '6', label: '6', test: (c) => c === 6 },
  { value: '7-8', label: '7 to 8', test: (c) => c >= 7 && c <= 8 },
  { value: '9-10', label: '9 to 10', test: (c) => c >= 9 && c <= 10 },
  { value: '11+', label: '11 or more', test: (c) => c >= 11 },
];

function alignmentText(monster: MonsterSummary): string {
  const options = monster.alignment.options;
  return options.length >= 3 ? 'Any' : options.map(alignmentLabel).join(' or ');
}

const COLUMNS: DataColumn<MonsterSummary>[] = [
  {
    key: 'name',
    header: 'Monster',
    cell: (row) => (
      <EntryLink kind="monsters" id={row.id} tone="quiet">
        {row.name}
      </EntryLink>
    ),
    sortValue: (row) => row.name,
  },
  {
    key: 'hd',
    header: 'Hit dice',
    align: 'center',
    numeric: true,
    cell: (row) => formatHitDice(row.hit_dice),
    sortValue: (row) =>
      row.hit_dice.count + row.hit_dice.modifier / 100 + (row.hit_dice.die === 4 ? -0.5 : 0),
  },
  {
    key: 'ac',
    header: 'Armour class',
    align: 'center',
    numeric: true,
    cell: (row) => formatArmourClass(row.ac, row.ac_ascending),
    sortValue: (row) => row.ac ?? 99,
  },
  {
    key: 'xp',
    header: 'XP',
    numeric: true,
    cell: (row) => formatInteger(row.xp),
    sortValue: (row) => row.xp,
  },
  { key: 'alignment', header: 'Alignment', cell: alignmentText, sortValue: alignmentText },
];

/** Every monster alphabetically, with hit dice and armour class, and filters for the data's categories. */
export function MonstersSection() {
  const catalogs = useCatalogs(true);
  const monsters = useMonsterCatalog();
  const { go } = useNavigation();
  const filter = useIndexState((s) => s.monsters);
  const setIndex = useIndexState((s) => s.set);
  const set = (patch: Partial<typeof filter>) => setIndex({ monsters: { ...filter, ...patch } });

  const categoryOptions = useMemo(() => {
    const found = new Set<string>();
    for (const categories of Object.values(catalogs.monsterCategories))
      for (const c of categories) found.add(c);
    return [...found].sort();
  }, [catalogs.monsterCategories]);

  const visible = useMemo(() => {
    const band = HIT_DICE_BANDS.find((b) => b.value === filter.hitDice);
    return (monsters.data ?? []).filter(
      (monster) =>
        matchesFilter(monster.name, filter.query) &&
        (filter.alignment === 'all' || (monster.alignment.options as string[]).includes(filter.alignment)) &&
        (filter.category === 'all' ||
          (catalogs.monsterCategories[monster.id] ?? []).includes(filter.category)) &&
        (band === undefined ||
          band.test(
            monster.hit_dice.count === 1 && monster.hit_dice.die === 4 ? 0.5 : monster.hit_dice.count,
          )),
    );
  }, [monsters.data, filter, catalogs.monsterCategories]);

  const clear = () => set({ query: '', alignment: 'all', category: 'all', hitDice: 'all' });
  const typesReady = !catalogs.categoriesLoading && categoryOptions.length > 0;

  const toolbar = (
    <>
      <SearchInput
        size="sm"
        aria-label="Filter monsters by name"
        placeholder="Filter by name"
        value={filter.query}
        onValueChange={(query) => set({ query })}
        wrapperClassName={styles.filterInput}
      />
      <Select
        size="sm"
        aria-label="Hit dice"
        value={filter.hitDice}
        onValueChange={(hitDice) => set({ hitDice })}
        options={[
          { value: 'all', label: 'Any hit dice' },
          ...HIT_DICE_BANDS.map((b) => ({ value: b.value, label: `${b.label} HD` })),
        ]}
        className={styles.filterSelect}
      />
      <Select
        size="sm"
        aria-label="Alignment"
        value={filter.alignment}
        onValueChange={(alignment) => set({ alignment })}
        options={[
          { value: 'all', label: 'Any alignment' },
          { value: 'lawful', label: 'Lawful' },
          { value: 'neutral', label: 'Neutral' },
          { value: 'chaotic', label: 'Chaotic' },
        ]}
        className={styles.filterSelect}
      />
      <Select
        size="sm"
        aria-label="Kind of creature"
        value={filter.category}
        disabled={!typesReady}
        placeholder={catalogs.categoriesLoading ? 'Loading kinds' : 'Any kind'}
        onValueChange={(category) => set({ category })}
        options={[
          { value: 'all', label: 'Any kind' },
          ...categoryOptions.map((c) => ({ value: c, label: monsterCategoryLabel(c) })),
        ]}
        className={styles.filterSelect}
      />
    </>
  );

  return (
    <SectionShell
      section="monsters"
      count={monsters.data ? countText(visible.length, monsters.data.length, 'monsters') : undefined}
      toolbar={toolbar}
    >
      <CatalogGate result={monsters} label="monsters">
        {() =>
          visible.length === 0 ? (
            <NoMatches onClear={clear} />
          ) : (
            <DataTable
              caption="Monsters"
              hideCaption
              columns={COLUMNS}
              rows={visible}
              rowKey={(row) => row.id}
              defaultSort={{ key: 'name', direction: 'ascending' }}
              density="comfortable"
              onRowClick={(row) => go({ page: 'entry', kind: 'monsters', id: row.id })}
            />
          )
        }
      </CatalogGate>
    </SectionShell>
  );
}
