/**
 * The outfitter's catalog: bxapi's equipment list joined with each item's details.
 *
 * The list route gives an item's name, type, and price. Damage, qualities, armour class, weight, and the size of
 * a purchase lot live in each item's own entry, so `useEquipmentDetails` loads every entry once, a few at a time,
 * through the shared catalog cache.
 */
import { useEffect, useMemo, useState } from 'react';
import { getApi, loadCatalog, useEquipmentCatalog, type EquipmentDetail } from '@/app';
import type { EquipmentSummary } from '@bxvtt/shared/bxapi';
import type { IconName } from '@/ui';

/** An item the outfitter sells, with its details once they load. */
export interface ShopItem {
  summary: EquipmentSummary;
  detail: EquipmentDetail | null;
}

const PARALLEL_LOADS = 6;

/** Loads the details of every item, `PARALLEL_LOADS` at a time. Failures leave the item without details. */
async function loadDetails(
  ids: readonly string[],
  onLoaded: (id: string, detail: EquipmentDetail) => void,
  isCancelled: () => boolean,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (!isCancelled()) {
      const id = ids[next];
      next += 1;
      if (id === undefined) return;
      try {
        const detail = await loadCatalog<EquipmentDetail>(`entry:equipment/${id}`, () =>
          getApi().rules<EquipmentDetail>(`equipment/${id}`),
        );
        if (!isCancelled()) onLoaded(id, detail);
      } catch {
        // The item stays in the list with its price. Its details appear on a later visit.
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_LOADS }, worker));
}

/**
 * The equipment catalog with each item's details.
 *
 * @returns The items in catalog order, whether the list is loading, an error for the list, and `retry`.
 */
export function useShopItems(): {
  items: ShopItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const catalog = useEquipmentCatalog();
  const [details, setDetails] = useState<Record<string, EquipmentDetail>>({});
  const list = catalog.data;

  useEffect(() => {
    if (list === null) return;
    let cancelled = false;
    // Entries arrive one at a time, so gather them and update the table about every 100 ms, not 51 times.
    let batch: Record<string, EquipmentDetail> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const arrived = batch;
      batch = {};
      if (!cancelled) setDetails((previous) => ({ ...previous, ...arrived }));
    };
    void loadDetails(
      list.map((item) => item.id),
      (id, detail) => {
        batch[id] = detail;
        timer ??= setTimeout(flush, 100);
      },
      () => cancelled,
    ).then(() => {
      if (timer !== null) clearTimeout(timer);
      flush();
    });
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [list]);

  const items = useMemo(
    () => (list ?? []).map((summary) => ({ summary, detail: details[summary.id] ?? null })),
    [list, details],
  );
  return {
    items,
    loading: catalog.loading,
    error: catalog.error ? `${catalog.error.title}. ${catalog.error.detail}` : null,
    retry: catalog.retry,
  };
}

/** What the weapon-quality words mean at the table, in one clause each. */
const QUALITIES: Record<string, { label: string; meaning: string }> = {
  melee: { label: 'Melee', meaning: 'Used hand to hand.' },
  missile: { label: 'Missile', meaning: 'Used at range.' },
  two_handed: { label: 'Two-handed', meaning: "Takes both hands, so it can't be used with a shield." },
  slow: { label: 'Slow', meaning: 'The wielder acts after everyone not using a slow weapon.' },
  blunt: { label: 'Blunt', meaning: 'A crushing weapon rather than an edged one.' },
  brace: { label: 'Brace', meaning: 'Damage doubles when set against a charging enemy.' },
  charge: { label: 'Charge', meaning: 'Damage doubles when the wielder charges.' },
  reload: { label: 'Reload', meaning: 'Takes a round to reload between shots.' },
  splash: { label: 'Splash', meaning: 'Thrown to burst on the target.' },
};

/** The label and meaning of a weapon quality such as `two_handed`. */
export function qualityText(quality: string): { label: string; meaning: string } {
  const known = QUALITIES[quality];
  if (known) return known;
  const label = quality.replace(/_/g, ' ');
  return { label: label.charAt(0).toUpperCase() + label.slice(1), meaning: '' };
}

/** The size of one purchase lot: how many units the listed price buys. Weapons and armour sell one at a time. */
export function lotSize(item: ShopItem): number {
  const detail = item.detail;
  if (detail === null) return 1;
  return 'lot_size' in detail && typeof detail.lot_size === 'number' ? Math.max(1, detail.lot_size) : 1;
}

/** The item's name with its first letter in lower case, for the middle of a sentence. */
function lowerName(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * A plain sentence about a purchase lot, such as "1 lot is 6 torches", or `null` for an item that sells singly.
 * A name that carries its own count, such as "Torches (6)", reads as "6 torches". Any other name stays whole, as in
 * "1 lot is rations (standard, 7 days)".
 *
 * @param item - The shop item.
 * @param lots - How many lots, when more than one.
 */
export function lotSentence(item: ShopItem, lots = 1): string | null {
  const size = lotSize(item);
  if (size <= 1) return null;
  const name = item.summary.name;
  const counted = /^(.*?)\s*\(\d+\)\s*(.*)$/.exec(name);
  if (counted) {
    const noun = lowerName(`${counted[1] ?? ''} ${counted[2] ?? ''}`.trim());
    return lots <= 1 ? `1 lot is ${size} ${noun}` : `${lots} lots are ${size * lots} ${noun}`;
  }
  return lots <= 1 ? `1 lot is ${lowerName(name)}` : `${lots} lots of ${lowerName(name)}`;
}

/** The weight in coins when the entry lists one. Gear lists none. */
export function weightCoins(item: ShopItem): number | null {
  const detail = item.detail;
  if (detail === null) return null;
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
 * @param item - The shop item. Without a loaded entry, only the lot sentence appears.
 */
export function describeItem(item: ShopItem): ItemFacts {
  const out: ItemFacts = { facts: [], qualities: [], notes: [] };
  const detail = item.detail;
  const lot = lotSentence(item);
  if (lot) out.notes.push(`${lot}.`);
  if (detail === null) return out;
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
          ? `Burns for ${turns} turns.`
          : numberParam(params, 'burn_turns_per_flask') !== null
            ? `Burns for ${turns} turns on each flask of oil.`
            : '';
      out.notes.push(`Light reaches ${radius} feet. ${burn}`.trim());
    }
    if (typeof detail.capacity_coins === 'number') {
      out.facts.push({ label: 'Holds', value: `${detail.capacity_coins} coins` });
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
export function rowSummary(item: ShopItem): string {
  const detail = item.detail;
  if (detail === null) return '';
  if (detail.item_type === 'weapon') {
    const qualities = detail.qualities.map((quality) => qualityText(quality).label.toLowerCase());
    return `${detail.damage}, ${qualities.join(', ')}`;
  }
  if (detail.item_type === 'armour') {
    if (detail.ac !== null) return `Armour class ${detail.ac}`;
    if (detail.ac_bonus !== null) return `Armour class +${detail.ac_bonus}`;
  }
  const lot = lotSentence(item);
  return lot ?? '';
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
