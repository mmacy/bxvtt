import { useMagicItemCatalog } from '@/app';
import type { MagicItemSummary } from '@bxvtt/shared/bxapi';
import { SearchInput, Select } from '@/ui';
import { useMemo } from 'react';
import { EntryLink } from '../Parts';
import { SpoilerGate } from '../SpoilerGate';
import { useIndexState } from '../indexState';
import { matchesFilter } from '../search';
import styles from '../sections.module.css';
import { magicCategoryLabel } from '../typeset';
import { CatalogGate, NoMatches, SectionShell, countText } from './common';

const CATEGORY_ORDER = [
  'potion',
  'scroll',
  'ring',
  'wand',
  'staff',
  'rod',
  'sword',
  'weapon',
  'armour',
  'misc',
];

/** Magic items by category. */
export function MagicItemsSection() {
  const items = useMagicItemCatalog();
  const filter = useIndexState((s) => s.magicItems);
  const setIndex = useIndexState((s) => s.set);
  const set = (patch: Partial<typeof filter>) => setIndex({ magicItems: { ...filter, ...patch } });

  const categories = useMemo(
    () =>
      [...new Set((items.data ?? []).map((item) => item.category as string))].sort(
        (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
      ),
    [items.data],
  );
  const visible = useMemo(
    () =>
      (items.data ?? []).filter(
        (item) =>
          (filter.category === 'all' || item.category === filter.category) &&
          matchesFilter(item.name, filter.query),
      ),
    [items.data, filter],
  );
  const grouped = categories
    .map((category) => ({
      category,
      items: visible.filter((item: MagicItemSummary) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);

  const toolbar = (
    <>
      <Select
        size="sm"
        aria-label="Category"
        value={filter.category}
        onValueChange={(category) => set({ category })}
        options={[
          { value: 'all', label: 'All categories' },
          ...categories.map((category) => ({ value: category, label: magicCategoryLabel(category, true) })),
        ]}
        className={styles.filterSelect}
      />
      <SearchInput
        size="sm"
        aria-label="Filter magic items by name"
        placeholder="Filter by name"
        value={filter.query}
        onValueChange={(query) => set({ query })}
        wrapperClassName={styles.filterInput}
      />
    </>
  );

  return (
    <SectionShell
      section="magic-items"
      count={items.data ? countText(visible.length, items.data.length, 'items') : undefined}
      toolbar={toolbar}
    >
      <SpoilerGate>
        <CatalogGate result={items} label="magic items">
          {() =>
            grouped.length === 0 ? (
              <NoMatches onClear={() => set({ category: 'all', query: '' })} />
            ) : (
              <div className={styles.groups}>
                {grouped.map((group) => (
                  <section
                    key={group.category}
                    aria-labelledby={`magic-${group.category}`}
                    className={styles.group}
                  >
                    <h3 id={`magic-${group.category}`} className={styles.groupTitle}>
                      {magicCategoryLabel(group.category, true)}
                      <span className={styles.groupCount}>{group.items.length}</span>
                    </h3>
                    <ul className={styles.nameGrid}>
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <EntryLink kind="magic-items" id={item.id} tone="quiet">
                            {item.name}
                          </EntryLink>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )
          }
        </CatalogGate>
      </SpoilerGate>
    </SectionShell>
  );
}
