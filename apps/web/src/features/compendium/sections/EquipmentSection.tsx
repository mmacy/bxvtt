import { useEquipmentCatalog } from '@/app';
import type { EquipmentSummary } from '@bxvtt/shared/bxapi';
import type { FullCatalogEntries } from '@bxvtt/shared/protocol';
import { formatDice, signed, weaponQualityLabel } from '@bxvtt/shared/text';
import { DataTable, SearchInput, SegmentedControl, type DataColumn } from '@/ui';
import { useMemo } from 'react';
import { useNavigation } from '../navigation';
import { EntryLink } from '../Parts';
import { useIndexState } from '../indexState';
import { matchesFilter } from '../search';
import styles from '../sections.module.css';
import { equipmentGroupLabel, formatArmourClass, formatCost, formatWeight, isNumber } from '../typeset';
import { useFullCatalog } from '../catalogs';
import { CatalogGate, NoMatches, SectionShell, countText } from './common';

type Full = FullCatalogEntries['equipment'];
interface Row extends EquipmentSummary {
  full: Full | undefined;
}

const nameColumn: DataColumn<Row> = {
  key: 'name',
  header: 'Item',
  cell: (row) => (
    <EntryLink kind="equipment" id={row.id} tone="quiet">
      {row.name}
    </EntryLink>
  ),
  sortValue: (row) => row.name,
};
const costColumn: DataColumn<Row> = {
  key: 'cost',
  header: 'Cost',
  align: 'center',
  numeric: true,
  cell: (row) => formatCost(row.cost_gp),
  sortValue: (row) => row.cost_gp,
};
const weightColumn: DataColumn<Row> = {
  key: 'weight',
  header: 'Weight',
  align: 'center',
  numeric: true,
  cell: (row) =>
    row.full && 'weight_coins' in row.full && row.full.weight_coins > 0
      ? formatWeight(row.full.weight_coins)
      : '',
  sortValue: (row) => (row.full && 'weight_coins' in row.full ? row.full.weight_coins : 0),
};

/** The columns of each group. Detail columns fill in once the full catalog has loaded. */
const COLUMNS: Record<string, DataColumn<Row>[]> = {
  weapon: [
    nameColumn,
    costColumn,
    {
      key: 'damage',
      header: 'Damage',
      align: 'center',
      numeric: true,
      cell: (row) => (row.full?.item_type === 'weapon' ? formatDice(row.full.damage) : ''),
    },
    weightColumn,
    {
      key: 'qualities',
      header: 'Qualities',
      cell: (row) =>
        row.full?.item_type === 'weapon' ? row.full.qualities.map(weaponQualityLabel).join(', ') : '',
    },
  ],
  armour: [
    nameColumn,
    costColumn,
    {
      key: 'ac',
      header: 'Armour class',
      align: 'center',
      numeric: true,
      cell: (row) =>
        row.full?.item_type !== 'armour'
          ? ''
          : isNumber(row.full.ac)
            ? formatArmourClass(row.full.ac, row.full.ac_ascending)
            : isNumber(row.full.ac_bonus)
              ? `${signed(row.full.ac_bonus)} bonus`
              : '',
    },
    weightColumn,
  ],
  gear: [nameColumn, costColumn],
  ammunition: [nameColumn, costColumn],
};

const TYPE_ORDER = ['weapon', 'armour', 'gear', 'ammunition'];

/** Equipment by type, each with its cost. */
export function EquipmentSection() {
  const equipment = useEquipmentCatalog();
  const full = useFullCatalog('equipment').data;
  const fullById = useMemo(() => new Map((full ?? []).map((entry) => [entry.id, entry])), [full]);
  const { go } = useNavigation();
  const filter = useIndexState((s) => s.equipment);
  const setIndex = useIndexState((s) => s.set);
  const set = (patch: Partial<typeof filter>) => setIndex({ equipment: { ...filter, ...patch } });

  const types = useMemo(() => {
    const found = [...new Set((equipment.data ?? []).map((item) => item.item_type))];
    return found.sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  }, [equipment.data]);
  const visible = useMemo(
    () =>
      (equipment.data ?? []).filter(
        (item) =>
          (filter.type === 'all' || item.item_type === filter.type) && matchesFilter(item.name, filter.query),
      ),
    [equipment.data, filter],
  );
  const grouped = types
    .map((type) => ({
      type,
      items: visible
        .filter((item) => item.item_type === type)
        .map((item): Row => ({ ...item, full: fullById.get(item.id) })),
    }))
    .filter((group) => group.items.length > 0);

  const toolbar = (
    <>
      <SegmentedControl
        aria-label="Kind of equipment"
        size="sm"
        value={filter.type}
        onValueChange={(type) => set({ type })}
        options={[
          { value: 'all', label: 'All' },
          ...types.map((type) => ({ value: type, label: equipmentGroupLabel(type) })),
        ]}
      />
      <SearchInput
        size="sm"
        aria-label="Filter equipment by name"
        placeholder="Filter by name"
        value={filter.query}
        onValueChange={(query) => set({ query })}
        wrapperClassName={styles.filterInput}
      />
    </>
  );

  return (
    <SectionShell
      section="equipment"
      count={equipment.data ? countText(visible.length, equipment.data.length, 'items') : undefined}
      toolbar={toolbar}
    >
      <CatalogGate result={equipment} label="equipment">
        {() =>
          grouped.length === 0 ? (
            <NoMatches onClear={() => set({ type: 'all', query: '' })} />
          ) : (
            <div className={styles.groups}>
              {grouped.map((group) => (
                <section
                  key={group.type}
                  aria-labelledby={`equipment-${group.type}`}
                  className={styles.group}
                >
                  <h3 id={`equipment-${group.type}`} className={styles.groupTitle}>
                    {equipmentGroupLabel(group.type)}
                    <span className={styles.groupCount}>{group.items.length}</span>
                  </h3>
                  <DataTable
                    caption={equipmentGroupLabel(group.type)}
                    hideCaption
                    columns={COLUMNS[group.type] ?? COLUMNS['gear'] ?? []}
                    rows={group.items}
                    rowKey={(row) => row.id}
                    density="comfortable"
                    onRowClick={(row) => go({ page: 'entry', kind: 'equipment', id: row.id })}
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
