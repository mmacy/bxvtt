import type { EquipmentSummary } from '@bxvtt/shared/bxapi';
import {
  capitalizeFirst,
  emptyContext,
  formatGold,
  itemTypeLabel,
  resolveItemNoun,
} from '@bxvtt/shared/text';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import type { EquipmentDetail } from '@/app';
import {
  Badge,
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
  Tooltip,
  breakpoints,
  cx,
  useMediaQuery,
  type DataColumn,
} from '@/ui';
import { ItemDetailBody } from '../sheet/ItemDetail';
import { readEntry } from '../sheet/model';
import type { CheckState } from './AdjustStep';
import { kitLabel, type CartLine } from './kits';
import { isShield, itemIcon, lotSentence, lotSize, rowSummary, weightCoins } from './shop';
import styles from './wizard.module.css';
import { useFullCatalog } from '../sheet/catalogs';

/** What the wizard knows about the rolled starting gold, which it reads from the server. */
export type GoldState =
  { status: 'loading' } | { status: 'known'; gp: number } | { status: 'unknown'; message: string };

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

/**
 * The badge that keeps the gold left in view while the cart sits under the equipment. It reads the same `left` as
 * the purse in the cart panel.
 *
 * @param left - The gold left after the cart, below 0 when the cart costs more than the purse holds.
 */
export function goldLeftBadge(left: number): { tone: 'gold' | 'danger'; text: string } {
  return left >= 0
    ? { tone: 'gold', text: `${left} gp left` }
    : { tone: 'danger', text: `Over by ${Math.abs(left)} gp` };
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

/**
 * Why one more lot of an item can't go in the cart, or `null` when it can. The item's price and the gold left
 * come from the catalog and the rolled gold, so the step decides no rule.
 *
 * @param cost - The price of one lot, in gold pieces.
 * @param left - The gold left after the cart, or `null` while the rolled gold isn't known.
 */
export function addBlock(cost: number, left: number | null): string | null {
  if (left === null || cost <= left) return null;
  return `This costs ${cost} gp, and you have ${Math.max(left, 0)} gp left.`;
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
        // The button's name already ends "show details", so the tooltip isn't its description too. The name comes
        // from the visible text, with hidden separators, so it always contains what a speech user reads on screen.
        <Tooltip content="Show this item's details" describe={false}>
          <button type="button" className={styles.shopNameButton}>
            <span className={styles.shopIcon}>
              <Icon name={itemIcon(item.id, item.item_type)} size={16} />
            </span>
            <span className={styles.shopNameText}>
              <span className={styles.shopName}>
                {item.name}
                <span className="visually-hidden-inline">,</span>
              </span>
              <span className={styles.shopSub}>
                {rowSummary(item.id, item.name, detail) || itemTypeLabel(item.item_type)}
                <span className="visually-hidden-inline">, show details</span>
              </span>
            </span>
          </button>
        </Tooltip>
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
  addReason,
}: {
  item: EquipmentSummary;
  lots: number;
  bundle: boolean;
  onLots: (lots: number) => void;
  /** Why one more lot can't be added, or `null`. */
  addReason: string | null;
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
        disabled={addReason !== null}
        disabledReason={addReason}
        onClick={() => onLots(lots + 1)}
      />
    </span>
  );
}

/** The price and weight line under an item in the stacked list: "7 gp · 50 cn", or only the price when no weight is listed. */
function priceLine(item: EquipmentSummary, detail: EquipmentDetail | undefined): string {
  const price = item.cost_gp === 0 ? 'Free' : formatGold(item.cost_gp);
  const weight = weightCoins(detail);
  return weight === null || weight === 0 ? price : `${price} · ${weight} cn`;
}

/**
 * One item of the stacked list: the details button and the cart control on the first lines, then the price and
 * weight. When the control swaps between Add and the stepper, focus follows it, so a keyboard user keeps their place.
 */
function StackedItem({
  item,
  detail,
  lots,
  control,
}: {
  item: EquipmentSummary;
  detail: EquipmentDetail | undefined;
  lots: number;
  control: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const refocus = useRef<'first' | 'last' | null>(null);
  const inCart = lots > 0;

  // The clicked button unmounts when the control swaps, so the effect puts focus on its replacement.
  useEffect(() => {
    const which = refocus.current;
    refocus.current = null;
    if (which === null) return;
    const buttons = box.current?.querySelectorAll('button');
    (which === 'last' ? buttons?.[buttons.length - 1] : buttons?.[0])?.focus();
  }, [inCart]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const clicked = (event.target as HTMLElement).closest('button');
    const first = box.current?.querySelector('button');
    // Add becomes the stepper, so focus goes to the stepper's plus. The last lot's minus gives Add back its focus.
    if (!inCart) refocus.current = 'last';
    else refocus.current = lots === 1 && clicked === first ? 'first' : null;
  };

  return (
    <li className={styles.stackedItem}>
      <div className={styles.stackedName}>
        <DetailsButton item={item} detail={detail} />
      </div>
      {/* The wrapper only hears clicks that bubble up from its buttons, which Enter and Space also send. */}
      <div ref={box} className={styles.stackedControl} onClick={onClick}>
        {control}
      </div>
      <p className={styles.stackedMeta}>{priceLine(item, detail)}</p>
    </li>
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
  // On a phone the four-column table is too wide, so a list takes its place. The CSS sets the cart's own switch.
  const stacked = useMediaQuery(`(max-width: ${breakpoints.phone}px)`);
  const full = useFullCatalog('equipment');
  const spent = cartCost(cart, equipment);
  const left = gold.status === 'known' ? gold.gp - spent : null;
  // Up to the tablet breakpoint the cart sits under the equipment, out of view, so a badge shows the gold left.
  const cartBelow = useMediaQuery(`(max-width: ${breakpoints.tablet}px)`);
  const leftBadge = cartBelow && left !== null ? goldLeftBadge(left) : null;
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

  /** The Add button, or the stepper once the item is in the cart. The table and the stacked list share it. */
  const cartControl = (item: EquipmentSummary) => {
    const lots = cart.find((l) => l.itemId === item.id)?.quantity ?? 0;
    const addReason = addBlock(item.cost_gp, left);
    if (lots === 0) {
      return (
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          aria-label={`Add ${item.name} to the cart`}
          disabled={addReason !== null}
          disabledReason={addReason}
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
        addReason={addReason}
      />
    );
  };

  const noMatch = (
    <EmptyState
      size="compact"
      icon="search"
      title="No matching equipment"
      description="Try a shorter search or choose All."
    />
  );

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
      header: 'Weight (cn)',
      numeric: true,
      sortValue: (item) => weightCoins(full.byId.get(item.id)) ?? Number.MAX_SAFE_INTEGER,
      cell: (item) => {
        const weight = weightCoins(full.byId.get(item.id));
        return weight === null || weight === 0 ? (
          <span className={styles.none}>
            <span aria-hidden="true">-</span>
            <span className="visually-hidden">No listed weight</span>
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
      cell: (item) => cartControl(item),
    },
  ];

  return (
    <div className={styles.outfitGrid}>
      <section className={styles.shop} aria-labelledby="wizard-shop">
        <div className={styles.rowBetween}>
          <h3 id="wizard-shop" className={styles.subTitle}>
            Equipment
          </h3>
          <div className={styles.shopActions}>
            {leftBadge && <Badge tone={leftBadge.tone}>{leftBadge.text}</Badge>}
            {kit && (
              <Button
                size="sm"
                variant="secondary"
                icon="chest"
                tooltip="Replace your cart with the items in this kit that your gold covers"
                onClick={onKit}
                loading={equipment === null}
              >
                Fill with the {kit.toLowerCase()} kit
              </Button>
            )}
          </div>
        </div>
        {kitNote && <p className={styles.muted}>{kitNote}</p>}
        <div className={styles.shopControls}>
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search equipment"
            aria-label="Search equipment"
          />
          <SegmentedControl
            options={FILTERS}
            value={filter}
            onValueChange={setFilter}
            size="sm"
            aria-label="Type of equipment"
            className={styles.typeFilter}
          />
        </div>
        {equipment === null || full.items === null ? (
          <Skeleton lines={8} />
        ) : stacked ? (
          rows.length === 0 ? (
            noMatch
          ) : (
            <ul className={styles.stackedList} aria-label="Equipment for sale">
              {rows.map((item) => (
                <StackedItem
                  key={item.id}
                  item={item}
                  detail={full.byId.get(item.id)}
                  lots={cart.find((l) => l.itemId === item.id)?.quantity ?? 0}
                  control={cartControl(item)}
                />
              ))}
            </ul>
          )
        ) : (
          <DataTable
            caption="Equipment for sale"
            hideCaption
            density="comfortable"
            rows={rows}
            columns={columns}
            rowKey={(item) => item.id}
            empty={noMatch}
          />
        )}
      </section>
      <aside className={styles.cartPanel} aria-labelledby="wizard-cart">
        <div className={styles.purse}>
          <span className={styles.purseLabel}>Starting gold</span>
          {gold.status === 'loading' && (
            <span className={styles.checking}>
              <Spinner size={14} label="" /> Loading your gold
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
          <p className={styles.muted}>Your cart is empty.</p>
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
                  <span className={styles.cartText}>
                    <span className={styles.cartName}>
                      {line.quantity > 1 ? `${line.quantity} × ` : ''}
                      {itemName}
                    </span>
                    <span className={styles.cartMain}>
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
                  </span>
                  {item && (
                    <span className={styles.cartStepper}>
                      <LotStepper
                        item={item}
                        lots={line.quantity}
                        bundle={lotSize(detail) > 1}
                        onLots={(next) => setLots(line.itemId, next)}
                        addReason={addBlock(item.cost_gp, left)}
                      />
                    </span>
                  )}
                  <span className={cx(styles.price, styles.cartPrice)}>
                    {formatGold((item?.cost_gp ?? 0) * line.quantity)}
                  </span>
                  <span className={styles.cartRemove}>
                    <IconButton
                      icon="close"
                      label={`Remove ${itemName} from the cart`}
                      size="sm"
                      variant="ghost"
                      onClick={() => setLots(line.itemId, 0)}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {cart.length > 0 && (
          <div className={styles.cartVerdict} aria-live="polite">
            {check.status === 'checking' && (
              <span className={styles.checking}>
                <Spinner size={14} label="" /> Checking equipment
              </span>
            )}
            {check.status === 'invalid' && (
              <Banner tone="warning" title="Check your cart">
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
            Empty cart
          </Button>
        )}
      </aside>
    </div>
  );
}
