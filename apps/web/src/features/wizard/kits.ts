/**
 * Quick kits: a shopping list for each class, in the order a new adventurer buys. A kit is a suggestion. The
 * server still checks every purchase and every item to equip when the character is made.
 */
import type { EquipmentSummary } from '@bxvtt/shared/bxapi';

/** One line of a kit: the first option the purse covers is bought. */
interface KitLine {
  options: string[];
  quantity?: number;
  equip?: boolean;
}

const BASICS: KitLine[] = [
  { options: ['backpack'] },
  { options: ['tinder_box'] },
  { options: ['torch'] },
  { options: ['rations_standard'] },
  { options: ['waterskin'] },
];

const KITS: Record<string, { label: string; lines: KitLine[] }> = {
  fighter: {
    label: 'Soldier',
    lines: [
      { options: ['sword'], equip: true },
      { options: ['chainmail', 'leather'], equip: true },
      { options: ['shield'], equip: true },
      ...BASICS,
      { options: ['rope'] },
      { options: ['dagger'] },
      { options: ['iron_spikes'] },
    ],
  },
  cleric: {
    label: 'Temple acolyte',
    lines: [
      { options: ['mace'], equip: true },
      { options: ['chainmail', 'leather'], equip: true },
      { options: ['shield'], equip: true },
      ...BASICS,
      { options: ['holy_symbol'] },
      { options: ['holy_water'] },
    ],
  },
  magic_user: {
    label: 'Apprentice',
    lines: [
      { options: ['dagger'], equip: true },
      ...BASICS,
      { options: ['oil_flask'], quantity: 2 },
      { options: ['lantern'] },
      { options: ['sack_small'] },
    ],
  },
  thief: {
    label: 'Cutpurse',
    lines: [
      { options: ['leather'], equip: true },
      { options: ['short_sword'], equip: true },
      { options: ['thieves_tools'] },
      ...BASICS,
      { options: ['rope'] },
      { options: ['dagger'] },
      { options: ['iron_spikes'] },
    ],
  },
  dwarf: {
    label: 'Delver',
    lines: [
      { options: ['war_hammer', 'hand_axe'], equip: true },
      { options: ['chainmail', 'leather'], equip: true },
      { options: ['shield'], equip: true },
      ...BASICS,
      { options: ['rope'] },
      { options: ['iron_spikes'] },
      { options: ['crowbar'] },
    ],
  },
  elf: {
    label: 'Wayfarer',
    lines: [
      { options: ['sword'], equip: true },
      { options: ['chainmail', 'leather'], equip: true },
      { options: ['shield'], equip: true },
      ...BASICS,
      { options: ['short_bow'] },
      { options: ['arrows'] },
    ],
  },
  halfling: {
    label: 'Hedge scout',
    lines: [
      { options: ['short_sword'], equip: true },
      { options: ['leather'], equip: true },
      { options: ['shield'], equip: true },
      { options: ['sling'] },
      { options: ['sling_stones'] },
      ...BASICS,
    ],
  },
};

/** A cart line. `quantity` counts purchase lots, as bxapi sells them. */
export interface CartLine {
  itemId: string;
  quantity: number;
}

/** What applying a kit puts in the cart. */
export interface KitResult {
  cart: CartLine[];
  equip: string[];
  /** Items the kit lists but the purse couldn't cover. */
  skipped: string[];
}

/** The name of a class's kit, or `null` when the class has none. */
export function kitLabel(classId: string | null): string | null {
  return classId === null ? null : (KITS[classId]?.label ?? null);
}

/**
 * Fills a cart from a class's kit, buying each line in order while the gold lasts. With unknown gold, it buys
 * the first option of every line.
 *
 * @param classId - The class.
 * @param equipment - The equipment catalog, for prices.
 * @param gold - The gold to spend, or `null` when it isn't known.
 */
export function applyKit(
  classId: string,
  equipment: readonly EquipmentSummary[],
  gold: number | null,
): KitResult {
  const kit = KITS[classId];
  const result: KitResult = { cart: [], equip: [], skipped: [] };
  if (!kit) return result;
  const price = new Map(equipment.map((item) => [item.id, item.cost_gp]));
  let left = gold ?? Number.POSITIVE_INFINITY;
  for (const line of kit.lines) {
    const quantity = line.quantity ?? 1;
    const choice = line.options.find((id) => {
      const cost = price.get(id);
      return cost !== undefined && cost * quantity <= left;
    });
    if (choice === undefined) {
      const first = line.options[0];
      if (first !== undefined && price.has(first)) result.skipped.push(first);
      continue;
    }
    left -= (price.get(choice) ?? 0) * quantity;
    result.cart.push({ itemId: choice, quantity });
    if (line.equip) result.equip.push(choice);
  }
  return result;
}
