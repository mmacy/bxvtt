/**
 * Turns what bxapi reports about a character into one shape the sheet draws from: a party member's sheet in the
 * player view (`MemberView`), or a stored character with its derived values (`StoredCharacter`). Every number
 * here is bxapi's. The functions only rename fields and read the inventory's JSON.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import type { StoredCharacter } from '@bxvtt/shared/protocol';
import {
  capitalizeFirst,
  emptyContext,
  itemLabel,
  magicItemTemplateName,
  classLabel,
  pluralize,
  resolveItemNoun,
  type TextContext,
} from '@bxvtt/shared/text';
import { memberClassName } from '@/app';

/** Coins by denomination. */
export interface Purse {
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

/** Where an item sits. */
export type ItemSlot = 'pack' | 'armour' | 'shield' | 'wielded' | 'ring';

/** One thing a character carries, named for the player and with the ID that commands take. */
export interface InventoryEntry {
  /** A key for React lists, unique within the inventory. */
  key: string;
  /** The ID that `equip_item`, `give_items`, `drop_items`, and `use_item` take. */
  commandId: string;
  kind: 'item' | 'magic' | 'valuable';
  /** The item label to show, without a leading article (such as `Chainmail` or `Potion`). */
  name: string;
  /** What one unit is called in the plural, for a count control: "torches". */
  units: string;
  quantity: number;
  slot: ItemSlot;
  /** `weapon`, `armour`, `gear`, or `ammunition` for a mundane item. */
  itemType: string | null;
  /** The catalog ID to look details up with: an equipment ID, or an identified magic item's template. */
  catalogId: string | null;
  /** The mundane item's template as the view serializes it, for damage, armour class, and weight. */
  template: Record<string, unknown> | null;
  identified: boolean;
  /** Whether the view reports a revealed curse. */
  cursed: boolean;
  /** Weapon qualities, such as `melee` or `missile`, when the view gives them. */
  qualities: string[];
  /** A gem's or jewel's value in gold pieces. */
  valueGp: number | null;
}

/** A character's inventory, sorted by where each thing sits. */
export interface InventoryModel {
  armour: InventoryEntry | null;
  shield: InventoryEntry | null;
  wielded: InventoryEntry[];
  rings: InventoryEntry[];
  pack: InventoryEntry[];
  valuables: InventoryEntry[];
  purse: Purse;
}

/** Everything the sheet draws. */
export interface SheetModel {
  name: string;
  classId: string;
  /** The class as the table reads it, such as `Fighter`. */
  className: string;
  race: string;
  level: number;
  title: string | null;
  alignment: string;
  xp: number;
  /** The experience the next level needs, `null` at the class's last level, `undefined` when unknown. */
  xpNextLevel: number | null | undefined;
  /** The experience bonus or penalty, as a percentage, when bxapi reports it. */
  xpModifierPct: number | null;
  scores: Record<string, number>;
  /** The STR the rules use, when an item sets it. */
  effectiveStrength: number | null;
  modifiers: {
    melee: number;
    openDoors: number;
    missile: number;
    initiative: number;
    hitPoints: number;
    magicSave: number;
    reactions: number;
  };
  saves: Record<string, number>;
  thac0: number;
  attackBonus: number;
  armourClass: number;
  armourClassAscending: number;
  currentHp: number;
  maxHp: number;
  conditions: string[];
  /** Feet per exploration turn, when the session reports it. */
  movementFeet: number | null;
  /** Feet per round in an encounter or battle, when the session reports it. */
  encounterFeet: number | null;
  languages: string[];
  thiefSkills: Record<string, number>;
  spellBook: string[];
  memorized: Array<{ spellId: string; reversed: boolean }>;
  inventory: InventoryModel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPurse(value: unknown): Purse {
  const purse = isRecord(value) ? value : {};
  return { pp: num(purse.pp), gp: num(purse.gp), ep: num(purse.ep), sp: num(purse.sp), cp: num(purse.cp) };
}

function qualitiesOf(record: Record<string, unknown>, template: Record<string, unknown> | null): string[] {
  const direct = record.qualities;
  if (Array.isArray(direct)) return direct.filter((q): q is string => typeof q === 'string');
  const own = template?.qualities;
  if (Array.isArray(own)) return own.filter((q): q is string => typeof q === 'string');
  const combat = template?.combat;
  if (isRecord(combat) && Array.isArray(combat.qualities)) {
    return combat.qualities.filter((q): q is string => typeof q === 'string');
  }
  return [];
}

function stripIndefinite(text: string): string {
  return text.replace(/^(a|an|some)\s+/i, '');
}

/**
 * Reads one serialized inventory entry.
 *
 * @param value - The entry from the view or the stored character.
 * @param slot - Where it sits.
 * @param index - Its position, for a unique key.
 * @param ctx - Names for IDs.
 */
export function readEntry(
  value: unknown,
  slot: ItemSlot,
  index: number,
  ctx: TextContext = emptyContext(),
): InventoryEntry | null {
  if (!isRecord(value)) return null;
  const quantity = Math.max(1, num(value.quantity, 1));
  if (value.instance_type === 'magic_item') {
    const instanceId = str(value.instance_id) ?? `magic-${slot}-${index}`;
    const templateId = str(value.template_id);
    const identified = value.identified !== false && str(value.display) === null;
    const masked = str(value.display);
    const shown = stripIndefinite(
      str(value.name) ??
        (identified && templateId ? magicItemTemplateName(templateId) : undefined) ??
        masked ??
        'magic item',
    );
    return {
      key: `${slot}:${instanceId}`,
      commandId: instanceId,
      kind: 'magic',
      name: capitalizeFirst(shown),
      units: quantity > 1 ? pluralize(shown) : shown,
      quantity,
      slot,
      itemType: null,
      catalogId: identified ? templateId : null,
      template: null,
      identified,
      cursed: value.cursed === true || value.cursed_revealed === true,
      qualities: qualitiesOf(value, null),
      valueGp: null,
    };
  }
  if (value.instance_type === 'valuable') {
    const instanceId = str(value.instance_id) ?? `valuable-${index}`;
    const kind = str(value.kind);
    const rawName = stripIndefinite(str(value.name) ?? (kind === 'jewellery' ? 'Jewellery' : 'Gem'));
    return {
      key: `${slot}:${instanceId}`,
      commandId: instanceId,
      kind: 'valuable',
      name: capitalizeFirst(rawName),
      units: rawName.toLowerCase(),
      quantity: 1,
      slot,
      itemType: kind,
      catalogId: null,
      template: null,
      identified: true,
      cursed: false,
      qualities: [],
      valueGp: typeof value.value_gp === 'number' ? value.value_gp : null,
    };
  }
  const template = isRecord(value.template) ? value.template : null;
  const id = str(template?.id) ?? str(value.template_id) ?? str(value.id);
  if (id === null) return null;
  const noun = resolveItemNoun(id, ctx, { name: str(template?.name) ?? undefined });
  return {
    units: noun.many,
    key: `${slot}:${id}:${index}`,
    commandId: id,
    kind: 'item',
    name: itemLabel(noun, quantity),
    quantity,
    slot,
    itemType: str(template?.item_type),
    catalogId: id,
    template,
    identified: true,
    cursed: false,
    qualities: qualitiesOf(value, template),
    valueGp: null,
  };
}

/**
 * Reads a serialized inventory, from the player view or a stored character.
 *
 * @param raw - The inventory.
 * @param ctx - Names for IDs.
 */
export function readInventory(raw: unknown, ctx: TextContext = emptyContext()): InventoryModel {
  const inv = isRecord(raw) ? raw : {};
  const list = (value: unknown, slot: ItemSlot) =>
    (Array.isArray(value) ? value : [])
      .map((entry, index) => readEntry(entry, slot, index, ctx))
      .filter((entry): entry is InventoryEntry => entry !== null);
  return {
    armour: readEntry(inv.worn_armour, 'armour', 0, ctx),
    shield: readEntry(inv.shield, 'shield', 0, ctx),
    wielded: list(inv.wielded, 'wielded'),
    rings: list(inv.rings, 'ring'),
    pack: list(inv.items, 'pack'),
    valuables: list(inv.valuables, 'pack'),
    purse: readPurse(inv.purse),
  };
}

/** Every equipped entry: armour, shield, weapons, and rings. */
export function equippedEntries(inventory: InventoryModel): InventoryEntry[] {
  return [
    ...(inventory.armour ? [inventory.armour] : []),
    ...(inventory.shield ? [inventory.shield] : []),
    ...inventory.wielded,
    ...inventory.rings,
  ];
}

function memorizedList(value: unknown): Array<{ spellId: string; reversed: boolean }> {
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const spellId = str(entry.spell_id);
    return spellId ? [{ spellId, reversed: entry.reversed === true }] : [];
  });
}

function conditionList(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (isRecord(entry)) {
      const name = str(entry.condition) ?? str(entry.kind) ?? str(entry.name);
      return name ? [name] : [];
    }
    return [];
  });
}

/**
 * The sheet of a party member, from the player view.
 *
 * @param member - The member's sheet.
 * @param ctx - Names for IDs, such as the player view's `item_names`.
 */
export function sheetFromMember(member: MemberView, ctx?: TextContext): SheetModel {
  return {
    name: member.name,
    classId: member.class_id,
    className: memberClassName(member),
    race: member.race,
    level: member.level,
    title: member.title ?? null,
    alignment: member.alignment,
    xp: member.xp,
    xpNextLevel: member.xp_next_level ?? null,
    xpModifierPct: null,
    scores: member.scores,
    effectiveStrength:
      member.effective_strength !== 0 && member.effective_strength !== member.scores.str
        ? member.effective_strength
        : null,
    modifiers: {
      melee: member.melee_modifier,
      openDoors: member.open_doors_chance,
      missile: member.missile_modifier,
      initiative: member.initiative_modifier,
      hitPoints: member.hit_point_modifier,
      magicSave: member.magic_save_modifier,
      reactions: member.npc_reaction_modifier,
    },
    saves: member.saves,
    thac0: member.thac0,
    attackBonus: member.attack_bonus,
    armourClass: member.armour_class,
    armourClassAscending: member.armour_class_ascending,
    currentHp: member.current_hp,
    maxHp: member.max_hp,
    conditions: member.conditions,
    movementFeet: member.movement_rate_feet,
    encounterFeet: member.encounter_rate_feet,
    languages: member.languages,
    thiefSkills: member.thief_skills,
    spellBook: member.spell_book,
    memorized: memorizedList(member.memorized_spells),
    inventory: readInventory(member.inventory, ctx),
  };
}

/**
 * The sheet of a stored character, from its document and bxapi's derived values.
 *
 * @param stored - The stored character.
 * @param xpNextLevel - The experience the next level needs, from the class's progression, when known.
 */
export function sheetFromStored(stored: StoredCharacter, xpNextLevel?: number | null): SheetModel {
  const { character, derived } = stored;
  const saves: Record<string, number> = {};
  for (const [key, value] of Object.entries(derived.saves)) if (typeof value === 'number') saves[key] = value;
  return {
    name: character.name,
    classId: character.class_id,
    className: classLabel(character.class_id),
    race: character.race,
    level: character.level,
    title: derived.level_title,
    alignment: character.alignment,
    xp: character.xp,
    xpNextLevel,
    xpModifierPct: derived.xp_modifier_pct,
    scores: character.scores,
    effectiveStrength: null,
    modifiers: {
      melee: derived.melee_modifier,
      openDoors: derived.open_doors_chance,
      missile: derived.missile_modifier,
      initiative: derived.initiative_modifier,
      hitPoints: derived.hit_point_modifier,
      magicSave: derived.magic_save_modifier,
      reactions: derived.npc_reaction_modifier,
    },
    saves,
    thac0: derived.thac0,
    attackBonus: derived.attack_bonus,
    armourClass: derived.armour_class,
    armourClassAscending: derived.armour_class_ascending,
    currentHp: character.current_hp,
    maxHp: character.max_hp,
    conditions: conditionList(character.conditions),
    movementFeet: null,
    encounterFeet: null,
    languages: derived.languages,
    thiefSkills: {},
    spellBook: character.spell_book,
    memorized: memorizedList(character.memorized_spells),
    inventory: readInventory(character.inventory),
  };
}
