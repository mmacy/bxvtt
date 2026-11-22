/**
 * The lookup data that lets text name things.
 *
 * bxapi events and rejections identify party members, monsters, items, and places by ID. A
 * [`TextContext`][TextContext] holds the names for those IDs. Build one from the player view with
 * `contextFromPlayerView`, then extend it with referee data, catalog lookups, or the events you have just
 * received. A lookup that misses degrades to a readable phrase such as `a party member`, never to a raw ID.
 *
 * A context is plain data (records of strings), so it can be cloned, stored, or sent over a WebSocket.
 */

import {
  classCatalogName,
  equipmentNoun,
  lowerCatalogName,
  magicItemTemplateName,
  monsterTemplateLabels,
  spellCatalogName,
  type ItemNoun,
} from './catalog';
import { capitalizeFirst, lowerFirst, pluralize, prettifyId, withArticle } from './format';

export interface MemberInfo {
  name: string;
  classId?: string;
  level?: number;
}

export interface GroupInfo {
  /** What to call one creature of the group: `goblin`. */
  label: string;
  /** What to call several: `goblins`. */
  labelPlural: string;
  /** How many are alive, when known. */
  count?: number;
}

export interface MonsterInfo {
  /** What to call this creature: `goblin`. */
  label: string;
  labelPlural?: string;
  templateId?: string;
  /** A name for a creature that has one, such as an NPC adventurer. */
  name?: string;
}

export interface TextContext {
  /** Party members by ID (`character-0001`). */
  members: Record<string, MemberInfo>;
  /** Monster groups by ID (`group-0001`). */
  groups: Record<string, GroupInfo>;
  /** Individual monsters and NPC adventurers by ID (`monster-0003`, `npc-0001`), where a referee knows them. */
  monsters: Record<string, MonsterInfo>;
  /** Item names by ID, without an article: `jade idol`. Instance IDs and adventure item IDs go here. */
  items: Record<string, string>;
  /** Spell names by ID, without an article: `magic missile`. */
  spells: Record<string, string>;
  /** Area names by area ID, or by `dungeon:level:area`. */
  areas: Record<string, string>;
  /** Dungeon names by dungeon ID. */
  dungeons: Record<string, string>;
  /** The name of the base town, when known. */
  townName?: string;
}

/** A context that knows nothing. Built-in catalog names still resolve. */
export function emptyContext(): TextContext {
  return { members: {}, groups: {}, monsters: {}, items: {}, spells: {}, areas: {}, dungeons: {} };
}

// Reading unknown JSON ---------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Strip a leading article from a display string: `a potion` becomes `potion`. */
export function stripArticle(text: string): string {
  return text.replace(/^(?:a|an|the|some)\s+/i, '').trim();
}

/** Loose shape of the parts of a player view that the context reads. A `PlayerView` from bxapi fits it. */
export interface PlayerViewLike {
  party?: ReadonlyArray<{
    id: string;
    name: string;
    class_id?: string;
    level?: number;
    inventory?: unknown;
  }>;
  encounter?: {
    groups?: ReadonlyArray<{ id: string; label: string; label_plural?: string; count?: number }>;
  } | null;
  town_name?: string;
}

function registerItemEntry(items: Record<string, string>, entry: unknown): void {
  if (!isRecord(entry)) return;
  const instanceId = asString(entry.instance_id);
  const display = asString(entry.display) ?? asString(entry.name);
  if (instanceId && display) {
    const noun = stripArticle(display);
    // A valuable's name is capitalized as a title in the adventure, so a sentence reads it in lower case.
    items[instanceId] = entry.instance_type === 'valuable' ? lowerFirst(noun) : noun;
  }
  const template = entry.template;
  if (isRecord(template)) {
    const id = asString(template.id);
    const name = asString(template.name);
    // Catalog items already have curated nouns. An item from a custom adventure doesn't, so record its name.
    if (id && name && !equipmentNoun(id)) items[id] = lowerCatalogName(name);
  }
}

function registerInventory(items: Record<string, string>, inventory: unknown): void {
  if (!isRecord(inventory)) return;
  for (const key of ['items', 'valuables', 'wielded', 'rings'] as const) {
    for (const entry of asArray(inventory[key])) registerItemEntry(items, entry);
  }
  registerItemEntry(items, inventory.worn_armour);
  registerItemEntry(items, inventory.shield);
}

/**
 * Build a context from a player view: the party members (name and class), the current monster groups, the
 * display names of magic items and valuables the party carries, and the town name. Pass `base` to add the
 * view's data to a context you already have, so groups from earlier encounters stay known.
 */
export function contextFromPlayerView(view: PlayerViewLike, base?: TextContext): TextContext {
  const ctx = cloneContext(base ?? emptyContext());
  for (const member of view.party ?? []) {
    const info: MemberInfo = { name: member.name };
    if (member.class_id !== undefined) info.classId = member.class_id;
    if (member.level !== undefined) info.level = member.level;
    ctx.members[member.id] = info;
    registerInventory(ctx.items, member.inventory);
  }
  // While an encounter is open, its groups replace the groups of earlier encounters, so that a monster ID
  // with no known template can take the label of the one kind of monster in the fight. When no encounter is
  // open, the previous groups stay known, because the events of the command that ended the fight name them.
  if (view.encounter?.groups) ctx.groups = {};
  for (const group of view.encounter?.groups ?? []) {
    const info: GroupInfo = { label: group.label, labelPlural: group.label_plural || pluralize(group.label) };
    if (group.count !== undefined) info.count = group.count;
    ctx.groups[group.id] = info;
  }
  if (view.town_name) ctx.townName = view.town_name;
  return ctx;
}

/** Loose shape of the parts of a referee view that the context reads. A `RefereeView` from bxapi fits it. */
export interface RefereeViewLike {
  monsters?: ReadonlyArray<{
    id: string;
    template: { id: string; name?: string; display_name?: string; display_name_plural?: string };
  }>;
  npcs?: ReadonlyArray<{ id: string; name: string; class_id?: string; level?: number }>;
  encounter?: {
    groups?: ReadonlyArray<{
      id: string;
      label: string;
      label_plural?: string;
      monster_ids?: readonly string[];
    }>;
  } | null;
  adventure?: unknown;
}

/**
 * Add what only a referee can resolve: the template of each monster ID, the names of NPC adventurers, the
 * encounter groups with their members, and the adventure's area, dungeon, town, and item names.
 */
export function extendContextWithReferee(ctx: TextContext, view: RefereeViewLike): TextContext {
  const next = cloneContext(ctx);
  for (const monster of view.monsters ?? []) {
    const labels = monsterTemplateLabels(monster.template.id);
    const label =
      monster.template.display_name ??
      labels?.label ??
      monster.template.name?.toLowerCase() ??
      prettifyId(monster.template.id);
    const labelPlural = monster.template.display_name_plural ?? labels?.labelPlural ?? pluralize(label);
    next.monsters[monster.id] = { label, labelPlural, templateId: monster.template.id };
  }
  for (const npc of view.npcs ?? []) {
    const info: MonsterInfo = { label: 'adventurer', labelPlural: 'adventurers', name: npc.name };
    if (npc.class_id) info.templateId = `npc:${npc.class_id}`;
    next.monsters[npc.id] = info;
  }
  for (const group of view.encounter?.groups ?? []) {
    next.groups[group.id] = { label: group.label, labelPlural: group.label_plural || pluralize(group.label) };
    for (const monsterId of group.monster_ids ?? []) {
      if (!next.monsters[monsterId]) {
        next.monsters[monsterId] = {
          label: group.label,
          labelPlural: group.label_plural || pluralize(group.label),
        };
      }
    }
  }
  readAdventure(next, view.adventure);
  return next;
}

function readAdventure(ctx: TextContext, adventure: unknown): void {
  if (!isRecord(adventure)) return;
  const town = adventure.town;
  if (isRecord(town) && asString(town.name)) ctx.townName = asString(town.name);
  for (const dungeon of asArray(adventure.dungeons)) {
    if (!isRecord(dungeon)) continue;
    const dungeonId = asString(dungeon.id);
    if (!dungeonId) continue;
    const dungeonName = asString(dungeon.name);
    if (dungeonName) ctx.dungeons[dungeonId] = dungeonName;
    for (const level of asArray(dungeon.levels)) {
      if (!isRecord(level)) continue;
      const levelNumber = asNumber(level.number);
      for (const area of asArray(level.areas)) {
        if (!isRecord(area)) continue;
        const areaId = asString(area.id);
        const areaName = asString(area.name);
        if (!areaId || !areaName) continue;
        if (levelNumber !== undefined) ctx.areas[`${dungeonId}:${levelNumber}:${areaId}`] = areaName;
        if (!(areaId in ctx.areas)) ctx.areas[areaId] = areaName;
      }
    }
  }
  for (const item of asArray(adventure.items)) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const name = asString(item.name);
    if (id && name) ctx.items[id] = lowerCatalogName(name);
  }
  for (const spell of asArray(adventure.spells)) {
    if (!isRecord(spell)) continue;
    const id = asString(spell.id);
    const name = asString(spell.name);
    if (id && name) ctx.spells[id] = lowerCatalogName(name);
  }
}

/** Entries from the rules catalogs (`/v1/rules/equipment`, `/magic-items`, `/spells`, `/monsters`). */
export interface CatalogEntries {
  equipment?: ReadonlyArray<{ id: string; name: string }>;
  magicItems?: ReadonlyArray<{ id: string; name: string }>;
  spells?: ReadonlyArray<{ id: string; name: string }>;
  monsters?: ReadonlyArray<{ id: string; name: string; label?: string; label_plural?: string }>;
  areas?: ReadonlyArray<{ id: string; name: string }>;
}

/** Add names from catalog listings, such as the pages that `GET /v1/rules/spells` returns. */
export function extendContextWithCatalog(ctx: TextContext, entries: CatalogEntries): TextContext {
  const next = cloneContext(ctx);
  for (const entry of entries.equipment ?? []) {
    if (!equipmentNoun(entry.id)) next.items[entry.id] = lowerCatalogName(entry.name);
  }
  for (const entry of entries.magicItems ?? []) {
    if (!magicItemTemplateName(entry.id)) next.items[entry.id] = lowerCatalogName(entry.name);
  }
  for (const entry of entries.spells ?? []) {
    if (!spellCatalogName(entry.id)) next.spells[entry.id] = lowerCatalogName(entry.name);
  }
  for (const entry of entries.areas ?? []) next.areas[entry.id] = entry.name;
  return next;
}

/** Shape of any event that the context can learn from. */
export interface LearnableEvent {
  event_type: string;
  code: string;
  [key: string]: unknown;
}

/**
 * Learn names from events a player may see:
 *
 * - A defeated monster reveals what that monster ID was.
 * - An identified item reveals what an item instance ID was.
 * - A new party member and a new encounter group reveal their names.
 *
 * Call it with the events of a command outcome before you describe them, so that a line like `monster-0003 is
 * slain` can say which kind of monster it was.
 */
export function extendContextWithEvents(ctx: TextContext, events: readonly LearnableEvent[]): TextContext {
  let next: TextContext | undefined;
  const edit = (): TextContext => (next ??= cloneContext(ctx));
  for (const event of events) {
    switch (event.event_type) {
      case 'monster_defeated': {
        const monsterId = asString(event.monster_id);
        const templateId = asString(event.template_id);
        if (monsterId && templateId) {
          const labels = monsterTemplateLabels(templateId);
          edit().monsters[monsterId] = {
            label: labels?.label ?? prettifyId(templateId),
            labelPlural: labels?.labelPlural ?? pluralize(prettifyId(templateId)),
            templateId,
          };
        }
        break;
      }
      case 'item_identified':
      case 'curse_revealed': {
        const instanceId = asString(event.instance_id);
        const templateId = asString(event.template_id);
        if (instanceId && templateId) {
          const name = magicItemTemplateName(templateId) ?? prettifyId(templateId);
          edit().items[instanceId] = name;
        }
        break;
      }
      case 'member_added': {
        const characterId = asString(event.character_id);
        const name = asString(event.name);
        if (characterId && name) {
          const info: MemberInfo = { name };
          const classId = asString(event.class_id);
          const level = asNumber(event.level);
          if (classId) info.classId = classId;
          if (level !== undefined) info.level = level;
          edit().members[characterId] = info;
        }
        break;
      }
      case 'encounter_group_joined': {
        const groupId = asString(event.group_id);
        const label = asString(event.label);
        if (groupId && label) {
          edit().groups[groupId] = {
            label,
            labelPlural: asString(event.label_plural) ?? pluralize(label),
            ...(asNumber(event.count) !== undefined ? { count: asNumber(event.count) } : {}),
          };
        }
        break;
      }
      case 'npc_party_spawned': {
        const ids = asArray(event.npc_ids).filter((id): id is string => typeof id === 'string');
        const classes = asArray(event.class_ids);
        ids.forEach((id, index) => {
          const classId = asString(classes[index]);
          edit().monsters[id] = {
            label: classId ? `${prettifyId(classId)} adventurer` : 'adventurer',
            labelPlural: classId ? `${prettifyId(classId)} adventurers` : 'adventurers',
            ...(classId ? { templateId: `npc:${classId}` } : {}),
          };
        });
        break;
      }
      default:
        break;
    }
  }
  return next ?? ctx;
}

/** Return a copy of a context that you can change without touching the original. */
export function cloneContext(ctx: TextContext): TextContext {
  const copy: TextContext = {
    members: { ...ctx.members },
    groups: { ...ctx.groups },
    monsters: { ...ctx.monsters },
    items: { ...ctx.items },
    spells: { ...ctx.spells },
    areas: { ...ctx.areas },
    dungeons: { ...ctx.dungeons },
  };
  if (ctx.townName !== undefined) copy.townName = ctx.townName;
  return copy;
}

/** Merge several contexts. Later contexts win on a conflict. */
export function mergeContexts(...contexts: readonly TextContext[]): TextContext {
  const merged = emptyContext();
  for (const ctx of contexts) {
    Object.assign(merged.members, ctx.members);
    Object.assign(merged.groups, ctx.groups);
    Object.assign(merged.monsters, ctx.monsters);
    Object.assign(merged.items, ctx.items);
    Object.assign(merged.spells, ctx.spells);
    Object.assign(merged.areas, ctx.areas);
    Object.assign(merged.dungeons, ctx.dungeons);
    if (ctx.townName !== undefined) merged.townName = ctx.townName;
  }
  return merged;
}

// ID patterns ------------------------------------------------------------------------------------------------

export type IdKind =
  | 'character'
  | 'monster'
  | 'group'
  | 'npc'
  | 'effect'
  | 'magic-item'
  | 'valuable'
  | 'cache'
  | 'temple'
  | 'side'
  | 'other';

/** Matches the entity IDs that osrlib allocates and that appear in messages and events. */
export const ENTITY_ID_PATTERN =
  /\b(?:character|monster|group|npc|effect|magic-item|valuable|cache)-\d{4,}\b|\btown-cleric\b/g;

/** Classify an ID by its prefix. */
export function idKind(id: string): IdKind {
  const match = /^(character|monster|group|npc|effect|magic-item|valuable|cache)-\d+$/.exec(id);
  if (match) return match[1] as IdKind;
  if (id === 'town-cleric') return 'temple';
  if (id === 'party' || id === 'monsters') return 'side';
  return 'other';
}

/** True when a string has the form of an ID that osrlib allocates, such as `character-0003`. */
export function isEntityId(value: string): boolean {
  return idKind(value) !== 'other' && idKind(value) !== 'side';
}

// Name resolution -------------------------------------------------------------------------------------------

/** Name of a party member. A member that the context doesn't know reads as `a party member`. */
export function memberName(id: string | null | undefined, ctx: TextContext): string {
  if (!id) return 'a party member';
  const known = ctx.members[id];
  if (known) return known.name;
  const kind = idKind(id);
  if (kind === 'character') return 'a party member';
  if (kind === 'npc') return npcName(id, ctx);
  if (kind === 'monster' || kind === 'group') return entityName(id, ctx);
  return isEntityId(id) ? entityName(id, ctx) : prettifyId(id);
}

/** The class of a member as a lower-case noun, when known: `thief`. */
export function memberClass(id: string, ctx: TextContext): string | undefined {
  const classId = ctx.members[id]?.classId;
  return classId ? (classCatalogName(classId)?.toLowerCase() ?? prettifyId(classId)) : undefined;
}

function npcName(id: string, ctx: TextContext): string {
  const known = ctx.monsters[id];
  if (known?.name) return known.name;
  if (known) return withArticle(known.label);
  return 'an adventurer';
}

/** The labels all current groups share, when exactly one label is known. */
function soleGroupLabel(ctx: TextContext): string | undefined {
  const labels = new Set(Object.values(ctx.groups).map((group) => group.label));
  return labels.size === 1 ? [...labels][0] : undefined;
}

/**
 * Name of a monster: `a goblin`. A monster the context can't resolve takes the label of the encounter's only
 * monster group when there is just one kind, and otherwise reads as `a monster`.
 */
export function monsterName(id: string | null | undefined, ctx: TextContext): string {
  if (!id) return 'a monster';
  const known = ctx.monsters[id];
  if (known?.name) return known.name;
  if (known) return withArticle(known.label);
  const sole = soleGroupLabel(ctx);
  return sole ? withArticle(sole) : 'a monster';
}

/** Name of a monster group: `the goblins`. Pass `count` to include a number: `3 goblins`. */
export function groupName(
  id: string | null | undefined,
  ctx: TextContext,
  options: { count?: number } = {},
): string {
  const known = id ? ctx.groups[id] : undefined;
  if (!known) {
    if (options.count !== undefined) return options.count === 1 ? 'a monster' : `${options.count} monsters`;
    return 'the monsters';
  }
  if (options.count !== undefined) {
    return options.count === 1 ? withArticle(known.label) : `${options.count} ${known.labelPlural}`;
  }
  return known.count === 1 ? `the ${known.label}` : `the ${known.labelPlural}`;
}

/**
 * Name of an item as a noun phrase without an article, for example `torch`, `potion`, or `jade idol`. Pass
 * `count` to get the plural form for a count above one.
 */
export function itemNoun(id: string, ctx: TextContext, count = 1): string {
  const kind = idKind(id);
  const fromContext = ctx.items[id];
  if (fromContext) return count === 1 ? fromContext : pluralize(fromContext);
  if (kind === 'magic-item') return count === 1 ? 'magic item' : 'magic items';
  if (kind === 'valuable') return count === 1 ? 'gem or jewel' : 'gems and jewels';
  const noun: ItemNoun | undefined = equipmentNoun(id);
  if (noun) return count === 1 ? noun.one : noun.many;
  const magic = magicItemTemplateName(id);
  if (magic) return count === 1 ? magic : pluralize(magic);
  const words = prettifyId(id);
  return count === 1 ? words : pluralize(words);
}

/** Name of an item with an article: `a torch`, `thieves' tools`. */
export function itemName(id: string, ctx: TextContext): string {
  const noun: ItemNoun | undefined = ctx.items[id] ? undefined : equipmentNoun(id);
  if (noun?.noArticle) return noun.one;
  const words = itemNoun(id, ctx);
  return /^the\s/i.test(words) ? words : withArticle(words);
}

/** Describe a stack of identical item IDs: `3 torches`, `a sword`. */
export function itemCount(id: string, quantity: number, ctx: TextContext): string {
  if (quantity === 1) return itemName(id, ctx);
  return `${quantity} ${itemNoun(id, ctx, quantity)}`;
}

/** Describe a list of item IDs, one per unit, grouping repeats: `2 torches, a sword, and a rope`. */
export function itemList(ids: readonly string[], ctx: TextContext): string[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const id of ids) {
    if (!counts.has(id)) order.push(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return order.map((id) => itemCount(id, counts.get(id) ?? 1, ctx));
}

/** Name of a spell, lower case: `magic missile`. */
export function spellName(id: string | null | undefined, ctx: TextContext): string {
  if (!id) return 'a spell';
  return ctx.spells[id] ?? spellCatalogName(id) ?? prettifyId(id);
}

/** Name of an area, when the context knows it, and otherwise a phrase built from the ID. */
export function areaName(
  id: string | null | undefined,
  ctx: TextContext,
  dungeonId?: string | null,
  level?: number | null,
): string {
  if (!id) return 'a new area';
  if (dungeonId && level !== undefined && level !== null) {
    const specific = ctx.areas[`${dungeonId}:${level}:${id}`];
    if (specific) return specific;
  }
  return ctx.areas[id] ?? capitalizeFirst(prettifyId(id));
}

/** Name of a dungeon: its name when known, and otherwise the words of its ID, in lower case. */
export function dungeonName(id: string | null | undefined, ctx: TextContext): string {
  if (!id) return 'the dungeon';
  return ctx.dungeons[id] ?? lowerFirst(prettifyId(id));
}

/**
 * Name any entity that bxapi identifies by ID: a party member, a monster, a group, an NPC, an effect, an item
 * instance, a cache, or the temple cleric. IDs that are none of these read as the words of the ID.
 */
export function entityName(id: string | null | undefined, ctx: TextContext): string {
  if (!id) return 'something';
  switch (idKind(id)) {
    case 'character':
      return memberName(id, ctx);
    case 'monster':
      return monsterName(id, ctx);
    case 'group':
      return groupName(id, ctx);
    case 'npc':
      return npcName(id, ctx);
    case 'effect':
      return 'an effect';
    case 'magic-item':
    case 'valuable':
      return itemName(id, ctx);
    case 'cache':
      return 'a treasure cache';
    case 'temple':
      return 'the temple cleric';
    case 'side':
      return id === 'party' ? 'the party' : 'the monsters';
    default:
      if (ctx.members[id]) return memberName(id, ctx);
      return lowerFirst(prettifyId(id));
  }
}
