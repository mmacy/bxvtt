/**
 * Reads what a party member carries out of bxapi's player view.
 *
 * `MemberView.inventory` is an untyped object in the generated bxapi types, so this module narrows it at run time
 * and never assumes a field exists. It only reads and formats. It decides nothing about what a member may use.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { capitalizeFirst } from '@bxvtt/shared/text';

/** The five coin metals a purse holds. */
export interface Purse {
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

/** One stack of a mundane or magic item in a member's pack or worn. */
export interface CarriedItem {
  /** The catalog ID for a mundane item, or the instance ID for a magic item. Pass it to `equip_item`. */
  id: string;
  name: string;
  /** `weapon`, `armour`, `gear`, `ammunition`, or `magic_item`. */
  itemType: string;
  quantity: number;
  /** Whether the member wields or wears it now. */
  equipped: boolean;
}

/** A gem or piece of jewellery that a town buyer pays for. */
export interface Valuable {
  /** The instance ID that `sell_treasure` takes. */
  instanceId: string;
  kind: 'gem' | 'jewellery';
  name: string;
  valueGp: number;
}

/** What one member carries. */
export interface MemberInventory {
  purse: Purse;
  /** Every stack, with the equipped ones first. */
  items: CarriedItem[];
  valuables: Valuable[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function whole(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stripIndefinite(value: string): string {
  return value.replace(/^(a|an|some)\s+/i, '');
}

/** Reads an item instance: a mundane stack (`template`) or a magic item. */
function readInstance(value: unknown, equipped: boolean): CarriedItem | null {
  const instance = record(value);
  if (instance === null) return null;
  const template = record(instance.template);
  if (template !== null) {
    return {
      id: text(template.id, ''),
      name: capitalizeFirst(stripIndefinite(text(template.name, 'Item'))),
      itemType: text(template.item_type, 'gear'),
      quantity: Math.max(1, whole(instance.quantity)),
      equipped,
    };
  }
  return {
    id: text(instance.instance_id, ''),
    name: capitalizeFirst(stripIndefinite(text(instance.name, text(instance.display, 'Magic item')))),
    itemType: 'magic_item',
    quantity: Math.max(1, whole(instance.quantity)),
    equipped,
  };
}

/** Reads a member's purse. */
export function readPurse(member: MemberView): Purse {
  const purse = record(record(member.inventory)?.purse);
  return {
    pp: whole(purse?.pp),
    gp: whole(purse?.gp),
    ep: whole(purse?.ep),
    sp: whole(purse?.sp),
    cp: whole(purse?.cp),
  };
}

/**
 * Reads what a member carries.
 *
 * @param member - A member of `PlayerView.party`.
 * @returns The purse, the stacks (equipped first), and the valuables.
 */
export function readInventory(member: MemberView): MemberInventory {
  const inventory = record(member.inventory);
  const equippedInstances = [
    inventory?.worn_armour,
    inventory?.shield,
    ...list(inventory?.wielded),
    ...list(inventory?.rings),
  ];
  const items: CarriedItem[] = [];
  for (const value of equippedInstances) {
    const item = readInstance(value, true);
    if (item !== null) items.push(item);
  }
  for (const value of list(inventory?.items)) {
    const item = readInstance(value, false);
    if (item !== null) items.push(item);
  }
  const valuables: Valuable[] = [];
  for (const value of list(inventory?.valuables)) {
    const valuable = record(value);
    if (valuable === null || typeof valuable.instance_id !== 'string') continue;
    valuables.push({
      instanceId: valuable.instance_id,
      kind: valuable.kind === 'jewellery' ? 'jewellery' : 'gem',
      // A name shows as `valuable_names` writes it. A piece with no name shows its kind.
      name: text(valuable.name, valuable.kind === 'jewellery' ? 'Jewellery' : 'Gem'),
      valueGp: whole(valuable.value_gp),
    });
  }
  return { purse: readPurse(member), items, valuables };
}

/** The gold pieces in a purse, which is what a displayed price is compared with for a hint. */
export function goldIn(purse: Purse): number {
  return purse.gp;
}

/** Whether a purse holds no coins at all. */
export function isEmptyPurse(purse: Purse): boolean {
  return purse.pp + purse.gp + purse.ep + purse.sp + purse.cp === 0;
}

/** The total a list of valuables sells for, in gold pieces. */
export function totalValue(valuables: readonly Valuable[]): number {
  return valuables.reduce((sum, valuable) => sum + valuable.valueGp, 0);
}

/** How many of one catalog item a member carries, equipped or not. */
export function countCarried(inventory: MemberInventory, itemId: string): number {
  return inventory.items.filter((item) => item.id === itemId).reduce((sum, item) => sum + item.quantity, 0);
}
