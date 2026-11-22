/** The outfitter's catalog: search, a type filter, sortable columns, and a way to put lots in the cart. */
import { formatGold, itemTypeLabel } from '@bxvtt/shared/text';
import { useTextContext } from '@/app';
import { useMemo, useState } from 'react';
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  Icon,
  IconButton,
  SearchInput,
  SegmentedControl,
  Skeleton,
  type DataColumn,
} from '@/ui';
import { itemIcon, lotSize, rowSummary, weightCoins, type ShopItem } from './equipment';
import styles from './Catalog.module.css';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'weapon', label: 'Weapons' },
  { value: 'armour', label: 'Armour' },
  { value: 'gear', label: 'Gear' },
  { value: 'ammunition', label: 'Ammunition' },
];

export interface CatalogProps {
  items: ShopItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  search: string;
  onSearch: (value: string) => void;
  /** Lots of each item in the current buyer's cart. */
  cart: Record<string, number>;
  onLots: (itemId: string, lots: number) => void;
  selectedId: string | null;
  onSelect: (itemId: string) => void;
  disabled: boolean;
}

/** Whether every word of the query appears in the item's name or type. */
function matches(item: ShopItem, query: string): boolean {
  const haystack = `${item.summary.name} ${itemTypeLabel(item.summary.item_type)}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function Catalog({
  items,
  loading,
  error,
  retry,
  search,
  onSearch,
  cart,
  onLots,
  selectedId,
  onSelect,
  disabled,
}: CatalogProps) {
  const ctx = useTextContext();
  const [type, setType] = useState('all');
  const rows = useMemo(
    () =>
      items.filter((item) => (type === 'all' || item.summary.item_type === type) && matches(item, search)),
    [items, type, search],
  );

  const columns: DataColumn<ShopItem>[] = [
    {
      key: 'name',
      header: 'Item',
      sortValue: (item) => item.summary.name,
      cell: (item) => (
        <button
          type="button"
          className={styles.nameButton}
          aria-label={`${item.summary.name}, ${rowSummary(item, ctx) || itemTypeLabel(item.summary.item_type)}, show details`}
          aria-current={selectedId === item.summary.id ? 'true' : undefined}
          onClick={() => onSelect(item.summary.id)}
        >
          <span className={styles.typeIcon}>
            <Icon name={itemIcon(item.summary)} size={16} />
          </span>
          <span className={styles.nameText}>
            <span className={styles.name}>{item.summary.name}</span>{' '}
            <span className={styles.sub}>
              {rowSummary(item, ctx) || itemTypeLabel(item.summary.item_type)}
            </span>
          </span>
        </button>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      sortValue: (item) => item.summary.cost_gp,
      cell: (item) => formatGold(item.summary.cost_gp),
      width: '84px',
    },
    {
      key: 'weight',
      header: 'Weight',
      numeric: true,
      sortValue: (item) => weightCoins(item) ?? Number.MAX_SAFE_INTEGER,
      cell: (item) => {
        const weight = weightCoins(item);
        return weight === null ? (
          <span className={styles.none} title="The catalog lists no weight">
            -
          </span>
        ) : (
          `${weight}`
        );
      },
      width: '84px',
    },
    {
      key: 'cart',
      header: 'Cart',
      align: 'end',
      width: '132px',
      cell: (item) => {
        const lots = cart[item.summary.id] ?? 0;
        const name = item.summary.name;
        const bundle = lotSize(item) > 1;
        if (lots === 0) {
          return (
            <Button
              size="sm"
              variant="ghost"
              icon="plus"
              disabled={disabled}
              aria-label={`Add ${name} to the cart`}
              onClick={() => onLots(item.summary.id, 1)}
            >
              Add
            </Button>
          );
        }
        return (
          <span className={styles.stepper} role="group" aria-label={`${name} in the cart`}>
            <IconButton
              icon="minus"
              size="sm"
              label={bundle ? `Remove one lot of ${name}` : `Remove one ${name}`}
              onClick={() => onLots(item.summary.id, lots - 1)}
            />
            <span className={styles.count} aria-live="polite">
              {lots}
            </span>
            <IconButton
              icon="plus"
              size="sm"
              label={bundle ? `Add one lot of ${name}` : `Add one ${name}`}
              onClick={() => onLots(item.summary.id, lots + 1)}
            />
          </span>
        );
      },
    },
  ];

  return (
    <section className={styles.catalog} aria-label="Equipment for sale">
      <div className={styles.toolbar}>
        <SearchInput
          value={search}
          onValueChange={onSearch}
          placeholder="Search the shelves"
          aria-label="Search equipment"
          wrapperClassName={styles.search}
        />
        <SegmentedControl
          aria-label="Type of equipment"
          options={TYPE_OPTIONS}
          value={type}
          onValueChange={setType}
          size="sm"
        />
      </div>
      {error !== null && (
        <Banner
          tone="warning"
          title="The shelves didn't load"
          actions={
            <Button size="sm" variant="secondary" onClick={retry}>
              Try again
            </Button>
          }
        >
          {error}
        </Banner>
      )}
      {loading && items.length === 0 && error === null ? (
        <Skeleton lines={8} />
      ) : (
        <DataTable
          caption="Equipment for sale"
          hideCaption
          density="comfortable"
          rows={rows}
          columns={columns}
          rowKey={(item) => item.summary.id}
          selectedKey={selectedId ?? undefined}
          empty={
            <EmptyState
              size="compact"
              icon="search"
              title="Nothing on the shelves matches"
              description="Try fewer words, or choose All."
            />
          }
        />
      )}
      <p className={styles.footnote}>
        Prices are in gold pieces and weights in coins. A lot is what one purchase delivers: weapons and
        armour sell one at a time, while gear and ammunition often come in bundles.
      </p>
    </section>
  );
}
