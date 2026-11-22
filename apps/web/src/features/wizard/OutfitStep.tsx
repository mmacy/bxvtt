import type { EquipmentSummary } from '@bxvtt/shared/bxapi';
import {
  capitalizeFirst,
  emptyContext,
  formatGold,
  itemTypeLabel,
  resolveItemNoun,
} from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';

import type { EquipmentDetail } from '@/app';
import {
  Banner,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  Icon,
  IconButton,
  Popover,
  ProgressBar,
  SearchInput,
  SegmentedControl,
  Skeleton,
  Spinner,
  cx,
  type DataColumn,
} from '@/ui';
import { ItemDetailBody } from '../sheet/ItemDetail';
import { readEntry } from '../sheet/model';
import type { CheckState } from './AdjustStep';
import { kitLabel, type CartLine } from './kits';
import { isShield, itemIcon, lotSentence, lotSize, rowSummary, weightCoins } from './shop';
import styles from './wizard.module.css';
import { useFullCatalog } from '../sheet/catalogs';

/** What the wizard knows about the starting gold. */
export type GoldState =
  { status: 'counting' } | { status: 'known'; gp: number } | { status: 'unknown'; message: string };

export interface OutfitStepProps {
  equipment: EquipmentSummary[] | null;
  cart: CartLine[];
  equip: string[];
  onCart: (cart: CartLine[]) => void;
  onEquip: (equip: string[]) => void;
  gold: GoldState;
  classId: string | null;
  onKit: () => void;
  kitNote: string | null;
  check: CheckState;
  /** Called when adding an item put it on by itself, so a refusal from the server can take it off again. */
  onAutoEquip?: (itemId: string) => void;
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'weapon', label: 'Weapons' },
  { value: 'armour', label: 'Armour' },
  { value: 'gear', label: 'Gear' },
  { value: 'ammunition', label: 'Ammunition' },
];

/** The total cost of a cart, from the catalog's prices. */
export function cartCost(cart: readonly CartLine[], equipment: readonly EquipmentSummary[] | null): number {
  return cart.reduce((sum, line) => {
    const cost = equipment?.find((item) => item.id === line.itemId)?.cost_gp ?? 0;
    return sum + cost * line.quantity;
  }, 0);
}

/** The rules of thumb a kit follows for what to wear: the first body armour, shield, and weapon go on. */
export function autoEquip(
  itemId: string,
  equip: readonly string[],
  byId: ReadonlyMap<string, EquipmentDetail>,
): boolean {
  const detail = byId.get(itemId);
  if (!detail || (detail.item_type !== 'weapon' && detail.item_type !== 'armour')) return false;
  const worn = equip.map((id) => byId.get(id)).filter((d): d is EquipmentDetail => d !== undefined);
  if (detail.item_type === 'weapon') return !worn.some((d) => d.item_type === 'weapon');
  if (isShield(detail)) return !worn.some((d) => isShield(d));
  return !worn.some((d) => d.item_type === 'armour' && !isShield(d));
}

function DetailsButton({ item, detail }: { item: EquipmentSummary; detail: EquipmentDetail | undefined }) {
  const entry = detail
    ? readEntry({ instance_type: 'item', template: detail, quantity: 1 }, 'pack', 0)
    : null;
  return (
    <Popover
      title={item.name}
      width="280px"
      trigger={
        <button
          type="button"
          className={styles.shopNameButton}
          aria-label={`${item.name}, ${rowSummary(item.id, item.name, detail) || itemTypeLabel(item.item_type)}, show details`}
        >
          <span className={styles.shopIcon}>
            <Icon name={itemIcon(item.id, item.item_type)} size={16} />
          </span>
          <span className={styles.shopNameText}>
            <span className={styles.shopName}>{item.name}</span>
            <span className={styles.shopSub}>
              {rowSummary(item.id, item.name, detail) || itemTypeLabel(item.item_type)}
            </span>
          </span>
        </button>
      }
    >
      {entry ? <ItemDetailBody entry={entry} /> : <Skeleton lines={3} />}
    </Popover>
  );
}

/** The minus and plus buttons the Outfitter uses for lots in the cart. */
function LotStepper({
  item,
  lots,
  bundle,
  onLots,
}: {
  item: EquipmentSummary;
  lots: number;
  bundle: boolean;
  onLots: (lots: number) => void;
}) {
  const noun = resolveItemNoun(item.id, emptyContext(), { name: item.name });
  return (
    <span className={styles.lotStepper} role="group" aria-label={`${capitalizeFirst(noun.many)} in the cart`}>
      <IconButton
        icon="minus"
        size="sm"
        label={bundle ? `Remove one lot of ${noun.many}` : `Remove one ${noun.one}`}
        onClick={() => onLots(lots - 1)}
      />
      <span className={styles.count} aria-live="polite">
        {lots}
      </span>
      <IconButton
        icon="plus"
        size="sm"
        label={bundle ? `Add one lot of ${noun.many}` : `Add one ${noun.one}`}
        onClick={() => onLots(lots + 1)}
      />
    </span>
  );
}

/** Step 5: buy starting gear with the rolled gold, and choose what to wear and wield. */
export function OutfitStep({
  equipment,
  cart,
  equip,
  onCart,
  onEquip,
  gold,
  classId,
  onKit,
  kitNote,
  check,
  onAutoEquip,
}: OutfitStepProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const full = useFullCatalog('equipment');
  const spent = cartCost(cart, equipment);
  const left = gold.status === 'known' ? gold.gp - spent : null;
  const kit = kitLabel(classId);

  const rows = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (equipment ?? []).filter((item) => {
      const haystack = `${item.name} ${itemTypeLabel(item.item_type)}`.toLowerCase();
      return (
        (filter === 'all' || item.item_type === filter) && words.every((word) => haystack.includes(word))
      );
    });
  }, [equipment, query, filter]);

  const setLots = (itemId: string, lots: number) => {
    const line = cart.find((l) => l.itemId === itemId);
    if (lots <= 0) {
      onCart(cart.filter((l) => l.itemId !== itemId));
      onEquip(equip.filter((id) => id !== itemId));
    } else if (line) {
      onCart(cart.map((l) => (l.itemId === itemId ? { ...l, quantity: lots } : l)));
    } else {
      onCart([...cart, { itemId, quantity: lots }]);
      // Armour and weapons go on as they would from a kit. The server still checks the class can use them.
      if (autoEquip(itemId, equip, full.byId)) {
        onEquip([...equip, itemId]);
        onAutoEquip?.(itemId);
      }
    }
  };

  const columns: DataColumn<EquipmentSummary>[] = [
    {
      key: 'name',
      header: 'Item',
      sortValue: (item) => item.name,
      cell: (item) => <DetailsButton item={item} detail={full.byId.get(item.id)} />,
    },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      sortValue: (item) => item.cost_gp,
      cell: (item) => (item.cost_gp === 0 ? 'Free' : formatGold(item.cost_gp)),
      width: '84px',
    },
    {
      key: 'weight',
      header: 'Weight',
      numeric: true,
      sortValue: (item) => weightCoins(full.byId.get(item.id)) ?? Number.MAX_SAFE_INTEGER,
      cell: (item) => {
        const weight = weightCoins(full.byId.get(item.id));
        return weight === null || weight === 0 ? (
          <span className={styles.none} title="The catalog lists no weight for it">
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
        const lots = cart.find((l) => l.itemId === item.id)?.quantity ?? 0;
        if (lots === 0) {
          return (
            <Button
              size="sm"
              variant="secondary"
              icon="plus"
              aria-label={`Add ${item.name} to the cart`}
              onClick={() => setLots(item.id, 1)}
            >
              Add
            </Button>
          );
        }
        return (
          <LotStepper
            item={item}
            lots={lots}
            bundle={lotSize(full.byId.get(item.id)) > 1}
            onLots={(next) => setLots(item.id, next)}
          />
        );
      },
    },
  ];

  return (
    <div className={styles.outfitGrid}>
      <section className={styles.shop} aria-labelledby="wizard-shop">
        <div className={styles.rowBetween}>
          <h3 id="wizard-shop" className={styles.subTitle}>
            The shelves
          </h3>
          {kit && (
            <Button size="sm" variant="secondary" icon="chest" onClick={onKit} disabled={equipment === null}>
              Fill with the {kit.toLowerCase()} kit
            </Button>
          )}
        </div>
        {kitNote && <p className={styles.muted}>{kitNote}</p>}
        <div className={styles.shopControls}>
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search the shelves"
            aria-label="Search equipment"
          />
          <SegmentedControl
            options={FILTERS}
            value={filter}
            onValueChange={setFilter}
            size="sm"
            aria-label="Type of equipment"
          />
        </div>
        {equipment === null || full.items === null ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable
            caption="Equipment for sale"
            hideCaption
            density="comfortable"
            rows={rows}
            columns={columns}
            rowKey={(item) => item.id}
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
        <p className={styles.muted}>
          Prices are in gold pieces and weights in coins. A lot is what one purchase delivers: weapons and
          armour sell one at a time, while gear and ammunition often come in bundles.
        </p>
      </section>
      <aside className={styles.cartPanel} aria-labelledby="wizard-cart">
        <div className={styles.purse}>
          <span className={styles.purseLabel}>Starting gold</span>
          {gold.status === 'counting' && (
            <span className={styles.checking}>
              <Spinner size={14} label="" /> Counting your gold
            </span>
          )}
          {gold.status === 'known' && (
            <>
              <span className={styles.goldBig}>
                <span className={styles.goldCoin} aria-hidden="true" />
                {gold.gp}
                <span className={styles.goldUnit}>gp</span>
              </span>
              <ProgressBar
                value={Math.min(spent, gold.gp)}
                max={Math.max(1, gold.gp)}
                label="Gold spent"
                tone={left !== null && left < 0 ? 'danger' : 'gold'}
                size="sm"
              />
              <span
                className={cx(styles.purseLeft, left !== null && left < 0 && styles.over)}
                aria-live="polite"
              >
                {left !== null && left >= 0
                  ? `${spent} gp spent, ${left} gp left`
                  : `${spent} gp spent, over by ${Math.abs(left ?? 0)} gp`}
              </span>
            </>
          )}
          {gold.status === 'unknown' && <span className={styles.muted}>{gold.message}</span>}
        </div>

        <h3 id="wizard-cart" className={styles.subTitle}>
          Cart
        </h3>
        {cart.length === 0 ? (
          <p className={styles.muted}>
            Your cart is empty. You can also leave with your gold and shop in town once the game starts.
          </p>
        ) : (
          <ul className={styles.cartList}>
            {cart.map((line) => {
              const item = equipment?.find((e) => e.id === line.itemId);
              const detail = full.byId.get(line.itemId);
              const equippable = item?.item_type === 'weapon' || item?.item_type === 'armour';
              const itemName = item?.name ?? line.itemId;
              const lot = lotSentence(line.itemId, itemName, detail, line.quantity);
              return (
                <li key={line.itemId} className={styles.cartRow}>
                  <span className={styles.cartMain}>
                    <span className={styles.cartName}>
                      {line.quantity > 1 ? `${line.quantity} × ` : ''}
                      {itemName}
                    </span>
                    {lot && <span className={styles.cartLot}>{lot}</span>}
                    {equippable && item && (
                      <Checkbox
                        label={
                          item.item_type === 'armour'
                            ? `Wear the ${item.name.toLowerCase()}`
                            : `Wield the ${item.name.toLowerCase()}`
                        }
                        checked={equip.includes(line.itemId)}
                        onCheckedChange={(checked) =>
                          onEquip(
                            checked ? [...equip, line.itemId] : equip.filter((id) => id !== line.itemId),
                          )
                        }
                      />
                    )}
                  </span>
                  {item && (
                    <LotStepper
                      item={item}
                      lots={line.quantity}
                      bundle={lotSize(detail) > 1}
                      onLots={(next) => setLots(line.itemId, next)}
                    />
                  )}
                  <span className={styles.price}>{formatGold((item?.cost_gp ?? 0) * line.quantity)}</span>
                  <IconButton
                    icon="close"
                    label={`Remove ${itemName} from the cart`}
                    size="sm"
                    variant="ghost"
                    onClick={() => setLots(line.itemId, 0)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {cart.length > 0 && (
          <div className={styles.cartVerdict} aria-live="polite">
            {check.status === 'checking' && (
              <span className={styles.checking}>
                <Spinner size={14} label="" /> Checking with the shop
              </span>
            )}
            {check.status === 'ok' && (
              <span className={styles.okLine}>The shop and your class accept this outfit.</span>
            )}
            {check.status === 'invalid' && (
              <Banner tone="warning" title="The outfit needs a change">
                {check.sentences.join(' ')}
              </Banner>
            )}
          </div>
        )}
        {cart.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            onClick={() => {
              onCart([]);
              onEquip([]);
            }}
          >
            Empty the cart
          </Button>
        )}
      </aside>
    </div>
  );
}
