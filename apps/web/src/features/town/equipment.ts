/**
 * The outfitter's catalog. bxapi's bulk equipment catalog gives every item's price, damage, qualities, armour
 * class, weight, and purchase lot size in one cached response, so the outfitter needs one request.
 */
import {
  count,
  formatFeet,
  itemPhrase,
  resolveItemNoun,
  weaponQualityDescription,
  weaponQualityLabel,
} from '@bxvtt/shared/text';
import type { TextContext } from '@bxvtt/shared/text';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeProblem, getApi, loadCatalog, type EquipmentDetail } from '@/app';
import type { EquipmentSummary } from '@bxvtt/shared/bxapi';
import type { IconName } from '@/ui';

/** An item the outfitter sells: its list entry and its full catalog entry. */
export interface ShopItem {
  summary: EquipmentSummary;
  detail: EquipmentDetail;
}

const CATALOG_KEY = 'full:equipment';

/** Turns the bulk catalog's entries into shop items. */
function toShopItems(entries: readonly EquipmentDetail[]): ShopItem[] {
  return entries.map((detail) => ({
    summary: { id: detail.id, name: detail.name, item_type: detail.item_type, cost_gp: detail.cost_gp },
    detail,
  }));
}

/**
 * The equipment catalog with every item's details, from one request.
 *
 * @returns The items in catalog order, whether the catalog is loading, an error sentence, and `retry`.
 */
export function useShopItems(): {
  items: ShopItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [entries, setEntries] = useState<EquipmentDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadCatalog(CATALOG_KEY, () => getApi().fullCatalog('equipment')).then(
      (catalog) => {
        if (cancelled) return;
        setEntries(catalog.items);
        setError(null);
      },
      (failure: unknown) => {
        if (cancelled) return;
        const problem = describeProblem(failure);
        setError(`${problem.title}. ${problem.detail}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const items = useMemo(() => toShopItems(entries ?? []), [entries]);
  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);
  return { items, loading: entries === null && error === null, error, retry };
}

/** The label and meaning of a weapon quality such as `two_handed`, from the text layer. */
export function qualityText(quality: string): { label: string; meaning: string } {
  return { label: weaponQualityLabel(quality), meaning: weaponQualityDescription(quality) };
}

/** The size of one purchase lot: how many units the listed price buys. Weapons and armour sell one at a time. */
export function lotSize(item: ShopItem): number {
  const detail = item.detail;
  return 'lot_size' in detail && typeof detail.lot_size === 'number' ? Math.max(1, detail.lot_size) : 1;
}

/**
 * A plain phrase about what a purchase of lots holds, such as "Comes as 6 torches" for one lot or "Comes as 12
 * torches" for two, or `null` for an item that sells singly.
 *
 * @param item - The shop item.
 * @param lots - How many lots.
 * @param ctx - The text context, which names what a unit of the item is.
 */
export function lotSentence(item: ShopItem, lots: number, ctx: TextContext): string | null {
  const size = lotSize(item);
  if (size <= 1) return null;
  const noun = resolveItemNoun(item.summary.id, ctx, { name: item.summary.name });
  const what = itemPhrase(noun, size * lots);
  return `Comes as ${what}`;
}

/** The weight in coins when the entry lists one. Gear lists none. */
export function weightCoins(item: ShopItem): number | null {
  const detail = item.detail;
  return 'weight_coins' in detail && typeof detail.weight_coins === 'number' ? detail.weight_coins : null;
}

/** Whether the item is armour or a weapon, which `equip_item` can take. */
export function isEquippable(itemType: string): boolean {
  return itemType === 'weapon' || itemType === 'armour';
}

/** One fact about an item, such as "Damage: 1d8". */
export interface ItemFact {
  label: string;
  value: string;
}

/** What a buyer needs to know about an item, read from its catalog entry. */
export interface ItemFacts {
  facts: ItemFact[];
  qualities: Array<{ label: string; meaning: string }>;
  /** Plain sentences about what the item does. */
  notes: string[];
}

function numberParam(params: unknown, key: string): number | null {
  if (typeof params !== 'object' || params === null) return null;
  const value = (params as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

function rangeText(ranges: unknown): string | null {
  if (typeof ranges !== 'object' || ranges === null) return null;
  const parts: string[] = [];
  for (const band of ['short', 'medium', 'long'] as const) {
    const entry = (ranges as Record<string, unknown>)[band];
    if (typeof entry !== 'object' || entry === null) continue;
    const { min_feet: min, max_feet: max } = entry as Record<string, unknown>;
    if (typeof min === 'number' && typeof max === 'number') parts.push(`${band} ${min}-${max} ft`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Describes an item from its catalog entry: damage and qualities for weapons, armour class for armour, light
 * and capacity for gear, and what a lot holds.
 *
 * @param item - The shop item.
 * @param ctx - The text context, for the lot sentence.
 */
export function describeItem(item: ShopItem, ctx: TextContext): ItemFacts {
  const out: ItemFacts = { facts: [], qualities: [], notes: [] };
  const detail = item.detail;
  const lot = lotSentence(item, 1, ctx);
  if (lot) out.notes.push(`${lot}.`);
  if (detail.item_type === 'weapon') {
    out.facts.push({ label: 'Damage', value: detail.damage });
    out.qualities = detail.qualities.map(qualityText);
    const ranges = rangeText(detail.missile_ranges);
    if (ranges) out.facts.push({ label: 'Range', value: ranges });
  } else if (detail.item_type === 'armour') {
    if (detail.ac !== null) {
      out.facts.push({ label: 'Armour class', value: `${detail.ac} (${detail.ac_ascending} ascending)` });
    } else if (detail.ac_bonus !== null) {
      out.notes.push(`Improves armour class by ${detail.ac_bonus}.`);
    }
  } else if (detail.item_type === 'gear') {
    const params = detail.params;
    const radius = numberParam(params, 'light_radius_feet');
    const turns = numberParam(params, 'burn_turns') ?? numberParam(params, 'burn_turns_per_flask');
    if (radius !== null) {
      const burn =
        numberParam(params, 'burn_turns') !== null
          ? `Burns for ${count(turns ?? 0, 'turn')}.`
          : numberParam(params, 'burn_turns_per_flask') !== null
            ? `Burns for ${count(turns ?? 0, 'turn')} on each flask of oil.`
            : '';
      out.notes.push(`Light reaches ${formatFeet(radius)}. ${burn}`.trim());
    }
    if (typeof detail.capacity_coins === 'number') {
      out.facts.push({ label: 'Capacity', value: count(detail.capacity_coins, 'coin') });
    }
    if (detail.combat) {
      out.facts.push({ label: 'Thrown for', value: detail.combat.damage });
      out.qualities = detail.combat.qualities.map(qualityText);
      const ranges = rangeText(detail.combat.missile_ranges);
      if (ranges) out.facts.push({ label: 'Range', value: ranges });
    }
  }
  return out;
}

/** A short line for a catalog row: damage and first quality for weapons, armour class for armour. */
export function rowSummary(item: ShopItem, ctx: TextContext): string {
  const detail = item.detail;
  if (detail.item_type === 'weapon') {
    const qualities = detail.qualities.map((quality) => qualityText(quality).label.toLowerCase());
    return `${detail.damage}, ${qualities.join(', ')}`;
  }
  if (detail.item_type === 'armour') {
    if (detail.ac !== null) return `Armour class ${detail.ac}`;
    if (detail.ac_bonus !== null) return `Armour class +${detail.ac_bonus}`;
  }
  return lotSentence(item, 1, ctx) ?? '';
}

const ITEM_ICONS: Record<string, IconName> = {
  sword: 'weapon-sword',
  short_sword: 'weapon-sword',
  two_handed_sword: 'weapon-sword',
  battle_axe: 'weapon-axe',
  hand_axe: 'weapon-axe',
  long_bow: 'weapon-bow',
  short_bow: 'weapon-bow',
  crossbow: 'weapon-bow',
  sling: 'weapon-bow',
  mace: 'weapon-mace',
  club: 'weapon-mace',
  war_hammer: 'weapon-mace',
  staff: 'weapon-mace',
  dagger: 'weapon-dagger',
  silver_dagger: 'weapon-dagger',
  spear: 'weapon-spear',
  javelin: 'weapon-spear',
  lance: 'weapon-spear',
  pole_arm: 'weapon-spear',
  leather: 'armour-leather',
  chainmail: 'armour-chain',
  plate_mail: 'armour-plate',
  shield: 'shield',
  torch: 'torch',
  lantern: 'lantern',
  holy_water: 'potion',
  oil_flask: 'potion',
  wine: 'potion',
  rations_standard: 'book',
  rations_iron: 'book',
};

const TYPE_ICONS: Record<string, IconName> = {
  weapon: 'weapon-sword',
  armour: 'shield',
  gear: 'chest',
  ammunition: 'target',
};

/** The icon that stands for an item in lists. Unknown items fall back to their type's icon. */
export function itemIcon(summary: EquipmentSummary): IconName {
  return ITEM_ICONS[summary.id] ?? TYPE_ICONS[summary.item_type] ?? 'chest';
}
