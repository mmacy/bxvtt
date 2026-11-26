/**
 * Item text for the wizard's shop. The wording matches the town's Outfitter, so a player who learned one shop
 * knows the other: the same columns, the same lot phrases ("Comes as 6 torches"), and the same row summary.
 */
import type { EquipmentDetail } from '@/app';
import { emptyContext, itemPhrase, resolveItemNoun, weaponQualityLabel } from '@bxvtt/shared/text';
import type { IconName } from '@/ui';

/** The size of one purchase lot: how many units the listed price buys. Weapons and armour sell one at a time. */
export function lotSize(detail: EquipmentDetail | undefined): number {
  return detail && 'lot_size' in detail && typeof detail.lot_size === 'number'
    ? Math.max(1, detail.lot_size)
    : 1;
}

/**
 * What a purchase of lots holds, such as "Comes as 6 torches" for one lot or "Comes as 12 torches" for two, or
 * `null` for an item that sells singly. The town's Outfitter uses the same wording.
 */
export function lotSentence(
  id: string,
  name: string,
  detail: EquipmentDetail | undefined,
  lots: number,
): string | null {
  const size = lotSize(detail);
  if (size <= 1) return null;
  const what = itemPhrase(resolveItemNoun(id, emptyContext(), { name }), size * lots);
  return `Comes as ${what}`;
}

/** The weight in coins when the entry lists one. Gear lists none. */
export function weightCoins(detail: EquipmentDetail | undefined): number | null {
  return detail && 'weight_coins' in detail && typeof detail.weight_coins === 'number'
    ? detail.weight_coins
    : null;
}

/** A short line for a row: damage and qualities for a weapon, armour class for armour, the lot for gear. */
export function rowSummary(id: string, name: string, detail: EquipmentDetail | undefined): string {
  if (!detail) return '';
  if (detail.item_type === 'weapon') {
    const qualities = detail.qualities.map((quality) => weaponQualityLabel(quality).toLowerCase());
    return `${detail.damage}, ${qualities.join(', ')}`;
  }
  if (detail.item_type === 'armour') {
    if (detail.ac !== null) return `Armour class ${detail.ac}`;
    if (detail.ac_bonus !== null) return `Armour class +${detail.ac_bonus}`;
  }
  return lotSentence(id, name, detail, 1) ?? '';
}

/** Whether a piece of armour is a shield, which the entry marks with an armour class bonus. */
export function isShield(detail: EquipmentDetail | undefined): boolean {
  return detail?.item_type === 'armour' && detail.ac === null && detail.ac_bonus !== null;
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
};

const TYPE_ICONS: Record<string, IconName> = {
  weapon: 'weapon-sword',
  armour: 'shield',
  gear: 'chest',
  ammunition: 'target',
};

/** The icon that stands for an item in lists, as the Outfitter shows it. */
export function itemIcon(id: string, itemType: string): IconName {
  return ITEM_ICONS[id] ?? TYPE_ICONS[itemType] ?? 'chest';
}
