import { useEquipmentCatalog } from '@/app';
import type { EquipmentSummary } from '@bxvtt/shared/bxapi';
import { DataTable, SearchInput, SegmentedControl, type DataColumn } from '@/ui';
import { useMemo } from 'react';
import { useNavigation } from '../navigation';
import { EntryLink } from '../Parts';
import { useIndexState } from '../indexState';
import { matchesFilter } from '../search';
import styles from '../sections.module.css';
import { equipmentGroupLabel, formatCost } from '../typeset';
import { CatalogGate, NoMatches, SectionShell, countText } from './common';

const COLUMNS: DataColumn<EquipmentSummary>[] = [
  {
    key: 'name',
    header: 'Item',
    cell: (row) => (
      <EntryLink kind="equipment" id={row.id} tone="quiet">
        {row.name}
      </EntryLink>
    ),
    sortValue: (row) => row.name,
  },
  {
    key: 'cost',
    header: 'Cost',
    numeric: true,
    cell: (row) => formatCost(row.cost_gp),
    sortValue: (row) => row.cost_gp,
  },
];

const TYPE_ORDER = ['weapon', 'armour', 'gear', 'ammunition'];

/** Equipment by type, each with its cost. */
export function EquipmentSection() {
  const equipment = useEquipmentCatalog();
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
    .map((type) => ({ type, items: visible.filter((item) => item.item_type === type) }))
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
                    columns={COLUMNS}
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
