import type { EquipmentSummary } from '@bxvtt/shared/bxapi';
import { itemTypeLabel } from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import { useRulesEntry, type EquipmentDetail } from '@/app';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  ProgressBar,
  EmptyState,
  IconButton,
  NumberInput,
  Popover,
  SearchInput,
  SegmentedControl,
  Skeleton,
  Spinner,
  cx,
} from '@/ui';
import { ItemDetailBody } from '../sheet/ItemDetail';
import { readEntry } from '../sheet/model';
import type { CheckState } from './AdjustStep';
import { kitLabel, type CartLine } from './kits';
import styles from './wizard.module.css';

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

function EquipmentInfo({ item }: { item: EquipmentSummary }) {
  const [open, setOpen] = useState(false);
  const detail = useRulesEntry<EquipmentDetail>(open ? `equipment/${item.id}` : null);
  const entry = detail.data
    ? readEntry({ instance_type: 'item', template: detail.data, quantity: 1 }, 'pack', 0)
    : null;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title={item.name}
      width="280px"
      trigger={<IconButton icon="info" label={`About ${item.name}`} variant="ghost" size="sm" />}
    >
      {entry ? <ItemDetailBody entry={entry} /> : <Skeleton lines={3} />}
    </Popover>
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
}: OutfitStepProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const spent = cartCost(cart, equipment);
  const left = gold.status === 'known' ? gold.gp - spent : null;
  const kit = kitLabel(classId);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (equipment ?? []).filter(
      (item) =>
        (filter === 'all' || item.item_type === filter) && (q === '' || item.name.toLowerCase().includes(q)),
    );
  }, [equipment, query, filter]);

  const add = (itemId: string) => {
    const line = cart.find((l) => l.itemId === itemId);
    if (line) onCart(cart.map((l) => (l.itemId === itemId ? { ...l, quantity: l.quantity + 1 } : l)));
    else onCart([...cart, { itemId, quantity: 1 }]);
  };
  const setQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      onCart(cart.filter((l) => l.itemId !== itemId));
      onEquip(equip.filter((id) => id !== itemId));
    } else onCart(cart.map((l) => (l.itemId === itemId ? { ...l, quantity } : l)));
  };

  return (
    <div className={styles.outfitGrid}>
      <section className={styles.shop} aria-labelledby="wizard-shop">
        <div className={styles.rowBetween}>
          <h3 id="wizard-shop" className={styles.subTitle}>
            The shop
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
            placeholder="Search the shop"
            aria-label="Search the shop"
          />
          <SegmentedControl
            options={FILTERS}
            value={filter}
            onValueChange={setFilter}
            size="sm"
            aria-label="Item type"
          />
        </div>
        {equipment === null ? (
          <Skeleton lines={8} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="search"
            size="compact"
            title="Nothing matches"
            description="Try another word or type."
          />
        ) : (
          <ul className={styles.shopList} aria-label="Items for sale">
            {shown.map((item) => {
              const inCart = cart.find((l) => l.itemId === item.id)?.quantity ?? 0;
              return (
                <li key={item.id} className={styles.shopRow}>
                  <span className={styles.shopName}>
                    {item.name}
                    {filter === 'all' && (
                      <span className={styles.shopType}>{itemTypeLabel(item.item_type)}</span>
                    )}
                  </span>
                  {inCart > 0 && <Badge tone="accent">{inCart} in cart</Badge>}
                  <span className={styles.price}>{item.cost_gp} gp</span>
                  <EquipmentInfo item={item} />
                  <IconButton
                    icon="plus"
                    label={`Add ${item.name} to the cart`}
                    size="sm"
                    variant="secondary"
                    onClick={() => add(item.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
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
                <span className={styles.goldCoin} aria-hidden="true">
                  g
                </span>
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
              const equippable = item?.item_type === 'weapon' || item?.item_type === 'armour';
              const name = item?.name ?? line.itemId;
              return (
                <li key={line.itemId} className={styles.cartRow}>
                  <span className={styles.cartMain}>
                    <span className={styles.cartName}>{name}</span>
                    {equippable && (
                      <Checkbox
                        label={item?.item_type === 'armour' ? 'Wear it' : 'Wield it'}
                        checked={equip.includes(line.itemId)}
                        onCheckedChange={(checked) =>
                          onEquip(
                            checked ? [...equip, line.itemId] : equip.filter((id) => id !== line.itemId),
                          )
                        }
                      />
                    )}
                  </span>
                  <NumberInput
                    aria-label={`How many of ${name}`}
                    incrementLabel={`One more ${name}`}
                    decrementLabel={`One fewer ${name}`}
                    value={line.quantity}
                    min={0}
                    max={99}
                    size="sm"
                    width={2}
                    onChange={(value) => setQuantity(line.itemId, value ?? 0)}
                  />
                  <span className={styles.price}>{(item?.cost_gp ?? 0) * line.quantity} gp</span>
                  <IconButton
                    icon="close"
                    label={`Take ${name} out of the cart`}
                    size="sm"
                    variant="ghost"
                    onClick={() => setQuantity(line.itemId, 0)}
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
