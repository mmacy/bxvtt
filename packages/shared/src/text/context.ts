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
  equipmentLotSize,
  equipmentNoun,
  itemNounFromName,
  itemPhrase,
  magicItemTemplateName,
  magicItemTemplateNoun,
  monsterTemplateLabels,
  spellCatalogName,
  UNNAMED_ITEM,
  type ItemNoun,
} from './catalog';
import { creatureNames } from './creatures';
import {
  capitalizeFirst,
  classInSentence,
  lowerFirst,
  placeInSentence,
  pluralize,
  prettifyId,
  withArticle,
} from './format';

export interface MemberInfo {
  name: string;
  classId?: string;
  /** The class's name as the player view states it, such as `Fighter`, which is right for a custom class too. */
  className?: string;
  level?: number;
}

export interface GroupInfo {
  /** What to call one creature of the group: `goblin`. */
  label: string;
  /** What to call several: `goblins`. */
  labelPlural: string;
  /** How many are alive, when known. */
  count?: number;
  /**
   * The most the group has had alive, so a group whose last member fell still reads as one creature or several:
   * `the ink-stained clerk`, not `the ink-stained clerks`.
   */
  size?: number;
}

export interface MonsterInfo {
  /** What to call this creature: `goblin`. */
  label: string;
  labelPlural?: string;
  templateId?: string;
  /** A name for a creature that has one, such as an NPC adventurer. */
  name?: string;
  /**
   * What the table calls the creature in its encounter, such as `Goblin 2` or `Ogre`, from
   * [`creatureNames`][creatureNames]. The text names a creature by `name` first, then by this, and then by its
   * label: `a goblin`.
   */
  tableName?: string;
}

export interface TextContext {
  /** Party members by ID (`character-0001`). */
  members: Record<string, MemberInfo>;
  /** Monster groups by ID (`group-0001`). */
  groups: Record<string, GroupInfo>;
  /** Individual monsters and NPC adventurers by ID (`monster-0003`, `npc-0001`), where a referee knows them. */
  monsters: Record<string, MonsterInfo>;
  /**
   * Item names by ID: `jade idol`, `potion`, `Hand of Saint Corvane`. Instance IDs and adventure item IDs go
   * here. The text layer reads every value through [`itemNounFromName`][itemNounFromName], so a value may also
   * be a printed name such as `Torches (6)` or a display name such as `a potion`. A built-in equipment ID always
   * reads with the noun osrlib states for it, whatever this record says.
   */
  items: Record<string, string>;
  /**
   * What to call two or more of an item in `items`, by the same ID, as bxapi states it: `vials of holy water`,
   * `potions`. An item with no entry here takes the plural the text layer forms from its name.
   */
  itemsPlural?: Record<string, string>;
  /**
   * What to call each named gem and piece of jewellery in the middle of a sentence, by instance ID, as bxapi's
   * `valuable_phrases` states it: `the abbot's seal ring`, `a silver altar candlestick`, `Ossor's Eye`. The text
   * uses it as written, with `items` holding the name as written. A valuable with no entry here reads as `items`
   * names it, as any item: an unnamed gem reads `a gem`, and a named valuable from an entry stored before osrlib
   * 2.10.0 reads by the fallback in `legacyValuableNoun`.
   */
  valuablePhrases?: Record<string, string>;
  /** Spell names by ID, as the rules write them: `Magic Missile`. */
  spells: Record<string, string>;
  /**
   * The name of each spell's reversed form by spell ID, such as `Darkness` for `light_mu`, from the player view's
   * `reversed_spell_names`. A spell the context doesn't list here reads as `the reversed form of Light`.
   */
  reversedSpells?: Record<string, string>;
  /** Area names by area ID, or by `dungeon:level:area`. */
  areas: Record<string, string>;
  /** Dungeon names by dungeon ID. */
  dungeons: Record<string, string>;
  /** The name of the base town, when known. */
  townName?: string;
  /**
   * What sets off each adventure trigger, as a phrase such as `entering the drain warren`, by trigger ID.
   * `extendContextWithReferee` fills it from the adventure. Referee clients only.
   */
  triggers?: Record<string, string>;
  /**
   * What each adventure flag is, by key such as `priory.sluice`: a name and what sets and reads it.
   * `extendContextWithReferee` fills it from the adventure's triggers and quests. Referee clients only. A flag the
   * context doesn't know reads by the words of its key, such as `the priory sluice flag`.
   */
  flags?: Record<string, FlagInfo>;
}

/** What an adventure flag is, for text. */
export interface FlagInfo {
  /** What to call the flag in a sentence: `the priory sluice flag`. */
  name: string;
  /** What sets it, as phrases such as `entering the sluice room`. */
  setBy: string[];
  /** What reads it, as phrases such as `the trigger for entering the toll gate`. */
  readBy: string[];
}

/** The name of a flag key in words, when no context names it: `priory.sluice` gives `the priory sluice flag`. */
function flagWords(key: string): string {
  return `the ${prettifyId(key.replace(/\./g, ' ')).toLowerCase()} flag`;
}

/**
 * Name an adventure flag in a sentence: `the priory sluice flag`. A referee context names it from the adventure,
 * and any other context from the words of its key, so the text never shows a raw key such as `priory.sluice`.
 */
export function flagName(key: string, ctx: TextContext): string {
  return ctx.flags?.[key]?.name ?? flagWords(key);
}

/**
 * A flag's value in words: `on` for true, `off` for false, `cleared` for no value, and any other value as
 * written, in quotes: `"open"`.
 */
export function flagValueText(value: unknown): string {
  if (value === true) return 'on';
  if (value === false) return 'off';
  if (value === null || value === undefined) return 'cleared';
  if (typeof value === 'number') return String(value);
  return `"${String(value)}"`;
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

/** A JSON object whose values are all strings, such as an event's `item_names`, or `{}` for anything else. */
function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/**
 * The fields of an event that name its items, each with the field of their plurals. An `equipment_destroyed` event's
 * `item_names` is a list of the destroyed items' names, not a map, so it reads as `{}`.
 */
const EVENT_ITEM_NAME_FIELDS = [
  ['item_names', 'item_names_plural'],
  ['saved_item_names', 'saved_item_names_plural'],
] as const;

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
    class_name?: string;
    level?: number;
    inventory?: unknown;
  }>;
  encounter?: {
    groups?: ReadonlyArray<{
      id: string;
      label: string;
      label_plural?: string;
      count?: number;
      members?: ReadonlyArray<{ id: string; status: 'alive' | 'defeated' | 'fled' }>;
    }>;
  } | null;
  town_name?: string;
  /** What to call one of each item whose ID the view shows, by item ID. */
  item_names?: Readonly<Record<string, string>>;
  /** What to call two or more of each item in `item_names`, by item ID. */
  item_names_plural?: Readonly<Record<string, string>>;
  /** Spell names by spell ID, for every spell the view shows. */
  spell_names?: Readonly<Record<string, string>>;
  /** The names of the reversed forms of the spells in `spell_names` that have one. */
  reversed_spell_names?: Readonly<Record<string, string>>;
  /** The dungeons the party has entered, with their names. */
  dungeons?: ReadonlyArray<{ id?: string; name?: string }>;
  /**
   * The own name of each gem and piece of jewellery that has one, by instance ID, such as
   * `{ 'valuable-0007': "Prior's chain of office" }`. A valuable that isn't a key reads by its kind in `item_names`.
   */
  valuable_names?: Readonly<Record<string, string>>;
  /**
   * What to call each valuable in `valuable_names` in the middle of a sentence, by instance ID, such as
   * `{ 'valuable-0007': "the prior's chain of office" }`. A view from before osrlib 2.10.0 has none.
   */
  valuable_phrases?: Readonly<Record<string, string>>;
  /** The party's map, with the areas it has entered on each level. */
  explored?: ReadonlyArray<{
    dungeon_id: string;
    level_number: number;
    areas?: ReadonlyArray<{ id?: string; name?: string }>;
  }>;
}

/**
 * The form of a noun to store in `TextContext.items`, so that reading it again with `itemNounFromName` gives the
 * same noun. A proper name of one word keeps its `the`, because nothing else marks it as proper.
 */
function storedNoun(noun: ItemNoun): string {
  if (noun.proper && itemNounFromName(noun.one).proper !== true) return `the ${noun.one}`;
  return noun.one;
}

/** Read a name for an item ID the way its source writes it. A magic item's name is a catalog name. */
function nounForId(id: string, name: string): ItemNoun {
  return itemNounFromName(name, { catalog: idKind(id) === 'magic-item' });
}

function registerItemEntry(items: Record<string, string>, entry: unknown): void {
  if (!isRecord(entry)) return;
  const instanceId = asString(entry.instance_id);
  const display = asString(entry.display) ?? asString(entry.name);
  if (instanceId && display) items[instanceId] = storedNoun(nounForId(instanceId, display));
  const template = entry.template;
  if (isRecord(template)) {
    const id = asString(template.id);
    const name = asString(template.name);
    // Catalog items already have the nouns osrlib states. An item from a custom adventure doesn't, so record its name.
    if (id && name && !equipmentNoun(id)) items[id] = storedNoun(itemNounFromName(name));
  }
}

function registerInventory(items: Record<string, string>, inventory: unknown): void {
  if (!isRecord(inventory)) return;
  // A valuable reads by the view's `item_names` and `valuable_names`, not by its inventory entry.
  for (const key of ['items', 'wielded', 'rings'] as const) {
    for (const entry of asArray(inventory[key])) registerItemEntry(items, entry);
  }
  registerItemEntry(items, inventory.worn_armour);
  registerItemEntry(items, inventory.shield);
}

/**
 * The own name of each gem and piece of jewellery that a player view shows, by instance ID, from the view's
 * `valuable_names`, such as `{ 'valuable-0007': "Prior's chain of office" }`. Show a name as written in a list.
 * The view's `item_names` names a valuable by its kind alone. A piece rolled on the treasure tables has no name of
 * its own, so it isn't listed and keeps the kind. To put a piece in a sentence, use its phrase from
 * [`valuablePhrases`][valuablePhrases].
 *
 * @param view - The player view.
 */
export function valuableNames(view: PlayerViewLike): Record<string, string> {
  const names: Record<string, string> = {};
  for (const [id, name] of Object.entries(view.valuable_names ?? {})) {
    if (idKind(id) === 'valuable') names[id] = name;
  }
  return names;
}

/**
 * What to call each named valuable of a player view in the middle of a sentence, by instance ID, from the view's
 * `valuable_phrases`, such as `{ 'valuable-0007': "the prior's chain of office" }`. The text uses the phrase
 * as written. The keys are the ones of [`valuableNames`][valuableNames], and a view from before osrlib 2.10.0
 * has none.
 *
 * @param view - The player view.
 */
export function valuablePhrases(view: PlayerViewLike): Record<string, string> {
  const phrases: Record<string, string> = {};
  for (const [id, phrase] of Object.entries(view.valuable_phrases ?? {})) {
    if (idKind(id) === 'valuable') phrases[id] = phrase;
  }
  return phrases;
}

/**
 * The context's item entry for a valuable whose phrase bxapi didn't state, which is only a name recorded by an
 * entry or a view from before osrlib 2.10.0. It reads the name as any item an author names: a common noun with an
 * article, and `the` for a possessive. This stands in for the phrase bxapi has stated since 2.10.0, and it gets a
 * name wrong that is a proper name or a plural. Nothing reaches it for a valuable of a current view or entry.
 */
function legacyValuableNoun(id: string, name: string): string {
  return storedNoun(nounForId(id, name));
}

/**
 * Record a named valuable. With bxapi's phrase, the context keeps the name as written and the phrase as written.
 * Without one, which only a name from before osrlib 2.10.0 is, the context falls back to
 * [`legacyValuableNoun`][legacyValuableNoun]. A valuable is one thing, so it has no plural.
 */
function registerValuable(ctx: TextContext, id: string, name: string, phrase: string | undefined): void {
  if (phrase === undefined) {
    // Fallback for names stored before osrlib 2.10.0, with no phrase.
    if (name.trim() === '') return;
    ctx.items[id] = legacyValuableNoun(id, name);
    delete ctx.valuablePhrases?.[id];
  } else {
    ctx.items[id] = name;
    (ctx.valuablePhrases ??= {})[id] = phrase;
  }
  delete ctx.itemsPlural?.[id];
}

/** Record item names and their plurals by ID. A built-in equipment ID keeps the noun osrlib states for it. */
function registerItemNames(
  ctx: TextContext,
  names: Readonly<Record<string, string>>,
  plurals: Readonly<Record<string, string>>,
): void {
  for (const [id, name] of Object.entries(names)) {
    if (equipmentNoun(id) || name.trim() === '') continue;
    ctx.items[id] = storedNoun(nounForId(id, name));
    const plural = plurals[id];
    if (plural !== undefined && plural.trim() !== '') (ctx.itemsPlural ??= {})[id] = plural;
  }
}

/**
 * Build a context from a player view: the party members (name and class), the current monster groups and the
 * monsters in them, the names of the items the view shows (`item_names` and `item_names_plural`, the own names
 * of valuables in `valuable_names`, and the inventory of a view from before bxapi stated them), the names of the
 * spells, dungeons, and areas the view
 * shows, and the town name. Pass `base` to add the view's data to a context you
 * already have, so groups from earlier encounters stay known.
 *
 * The view's own names win over the built-in catalog, so a custom class, a spell the adventure bundles, and an
 * area or a dungeon of the adventure read by the names their author gave them, without the referee view. With a
 * view from an older bxapi that lacks these names, the catalog names them.
 */
export function contextFromPlayerView(view: PlayerViewLike, base?: TextContext): TextContext {
  const ctx = cloneContext(base ?? emptyContext());
  for (const member of view.party ?? []) {
    const info: MemberInfo = { name: member.name };
    if (member.class_id !== undefined) info.classId = member.class_id;
    if (member.class_name) info.className = member.class_name;
    if (member.level !== undefined) info.level = member.level;
    ctx.members[member.id] = info;
    registerInventory(ctx.items, member.inventory);
  }
  registerItemNames(ctx, view.item_names ?? {}, view.item_names_plural ?? {});
  // `item_names` names a valuable by its kind, so its own name and its phrase go on top.
  const phrases = valuablePhrases(view);
  for (const [id, name] of Object.entries(valuableNames(view))) registerValuable(ctx, id, name, phrases[id]);
  for (const [id, name] of Object.entries(view.spell_names ?? {})) {
    if (name.trim() !== '') ctx.spells[id] = name;
  }
  for (const [id, name] of Object.entries(view.reversed_spell_names ?? {})) {
    if (name.trim() !== '') (ctx.reversedSpells ??= {})[id] = name;
  }
  for (const dungeon of view.dungeons ?? []) {
    if (dungeon.id && dungeon.name) ctx.dungeons[dungeon.id] = dungeon.name;
  }
  for (const level of view.explored ?? []) {
    for (const area of level.areas ?? []) {
      if (!area.id || !area.name) continue;
      ctx.areas[`${level.dungeon_id}:${level.level_number}:${area.id}`] = area.name;
      if (!(area.id in ctx.areas)) ctx.areas[area.id] = area.name;
    }
  }
  // While an encounter is open, its groups replace the groups of earlier encounters, so that a monster ID
  // with no known template can take the label of the one kind of monster in the fight. When no encounter is
  // open, the previous groups stay known, because the events of the command that ended the fight name them.
  const earlier = ctx.groups;
  if (view.encounter?.groups) ctx.groups = {};
  for (const group of view.encounter?.groups ?? []) {
    const info: GroupInfo = { label: group.label, labelPlural: group.label_plural || pluralize(group.label) };
    if (group.count !== undefined) info.count = group.count;
    const size = Math.max(group.count ?? 0, earlier[group.id]?.size ?? 0, earlier[group.id]?.count ?? 0);
    if (size > 0) info.size = size;
    ctx.groups[group.id] = info;
  }
  // Each creature reads by what the table calls it, such as `Goblin 2`, and otherwise by its group's label, which
  // is what the players see. A label or a real name the context already has, such as a referee's NPC name, stays.
  for (const creature of creatureNames(view.encounter?.groups)) {
    const group = ctx.groups[creature.group_id];
    const known: MonsterInfo = ctx.monsters[creature.id] ?? {
      label: group?.label ?? 'monster',
      ...(group === undefined ? {} : { labelPlural: group.labelPlural }),
    };
    ctx.monsters[creature.id] = { ...known, tableName: creature.name };
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
    // What the table calls the monster stays, so the referee reads `Goblin 2` as the players do.
    const tableName = next.monsters[monster.id]?.tableName;
    next.monsters[monster.id] = {
      label,
      labelPlural,
      templateId: monster.template.id,
      ...(tableName === undefined ? {} : { tableName }),
    };
  }
  for (const npc of view.npcs ?? []) {
    const info: MonsterInfo = { label: 'adventurer', labelPlural: 'adventurers', name: npc.name };
    if (npc.class_id) info.templateId = `npc:${npc.class_id}`;
    const tableName = next.monsters[npc.id]?.tableName;
    if (tableName !== undefined) info.tableName = tableName;
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
    if (id && name && !equipmentNoun(id)) ctx.items[id] = storedNoun(itemNounFromName(name));
  }
  for (const spell of asArray(adventure.spells)) {
    if (!isRecord(spell)) continue;
    const id = asString(spell.id);
    const name = asString(spell.name);
    if (id && name) ctx.spells[id] = name;
  }
  for (const trigger of asArray(adventure.triggers)) {
    if (!isRecord(trigger)) continue;
    const id = asString(trigger.id);
    const phrase = isRecord(trigger.when) ? triggerPhrase(trigger.when, ctx) : undefined;
    if (id && phrase) (ctx.triggers ??= {})[id] = phrase;
  }
  readFlags(ctx, adventure);
}

/** The flag keys that a JSON value sets with `set_flag`, and those it reads with a flag pattern or condition. */
function flagUses(value: unknown, sets: Set<string>, reads: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) flagUses(entry, sets, reads);
    return;
  }
  if (!isRecord(value)) return;
  const key = asString(value.key);
  if (key && value.command_type === 'set_flag') sets.add(key);
  if (key && (value.pattern_type === 'flag_set' || value.condition_type === 'flag_equals')) reads.add(key);
  for (const entry of Object.values(value)) flagUses(entry, sets, reads);
}

/** Learn what sets and reads each flag from the adventure's triggers and quests. */
function readFlags(ctx: TextContext, adventure: Record<string, unknown>): void {
  const info = (key: string): FlagInfo => {
    const flags = (ctx.flags ??= {});
    return (flags[key] ??= { name: flagWords(key), setBy: [], readBy: [] });
  };
  for (const trigger of asArray(adventure.triggers)) {
    if (!isRecord(trigger)) continue;
    const id = asString(trigger.id);
    const when = id ? ctx.triggers?.[id] : undefined;
    const sets = new Set<string>();
    const reads = new Set<string>();
    flagUses(trigger.consequences, sets, reads);
    flagUses({ when: trigger.when, conditions: trigger.conditions }, new Set(), reads);
    for (const key of sets) info(key).setBy.push(when ?? 'an adventure trigger');
    for (const key of reads) info(key).readBy.push(when ? `the trigger for ${when}` : 'an adventure trigger');
  }
  for (const quest of asArray(adventure.quests)) {
    if (!isRecord(quest)) continue;
    const name = asString(quest.name) ?? 'a quest';
    const sets = new Set<string>();
    const reads = new Set<string>();
    flagUses(quest, sets, reads);
    for (const key of sets) info(key).setBy.push(`the quest ${name}`);
    for (const key of reads) info(key).readBy.push(`the quest ${name}`);
  }
}

/** What sets off a trigger, from its `when` pattern: `entering the drain warren`. */
function triggerPhrase(when: Record<string, unknown>, ctx: TextContext): string | undefined {
  const dungeonId = asString(when.dungeon_id);
  const level = asNumber(when.level_number);
  switch (when.pattern_type) {
    case 'area_entered': {
      const areaId = asString(when.area_id);
      if (!areaId) return undefined;
      const name = areaName(areaId, ctx, dungeonId, level);
      return `entering ${/^the\s/i.test(name) ? lowerFirst(name) : `the ${lowerFirst(name)}`}`;
    }
    case 'level_entered':
      return level === undefined ? undefined : `reaching level ${level} of ${theDungeon(dungeonId, ctx)}`;
    case 'dungeon_entered':
      return `entering ${theDungeon(dungeonId, ctx)}`;
    case 'town_entered':
      return `arriving in ${ctx.townName ?? 'town'}`;
    case 'item_acquired': {
      const itemId = asString(when.item_id);
      return itemId ? `finding ${itemName(itemId, ctx)}` : undefined;
    }
    case 'monster_defeated': {
      const templateId = asString(when.template_id);
      if (!templateId) return undefined;
      return `defeating ${withArticle(monsterTemplateLabels(templateId)?.label ?? prettifyId(templateId))}`;
    }
    case 'flag_set': {
      const key = asString(when.key);
      return key ? `setting ${flagWords(key)}` : undefined;
    }
    default:
      return undefined;
  }
}

function theDungeon(dungeonId: string | undefined, ctx: TextContext): string {
  return placeInSentence(dungeonName(dungeonId, ctx));
}

/** Entries from the rules catalogs (`/v1/rules/equipment`, `/magic-items`, `/spells`, `/monsters`). */
export interface CatalogEntries {
  equipment?: ReadonlyArray<{ id: string; name: string }>;
  magicItems?: ReadonlyArray<{ id: string; name: string }>;
  spells?: ReadonlyArray<{ id: string; name: string }>;
  monsters?: ReadonlyArray<{ id: string; name: string; label?: string; label_plural?: string }>;
  areas?: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * Add names from catalog listings, such as the pages that `GET /v1/rules/spells` returns. Pass the entries as
 * the catalog prints them: an equipment lot name such as `Torches (6)` and a title-case magic item name such as
 * `Ring of Fire Resistance` both become nouns that read well in a sentence (`torch`, `ring of fire resistance`).
 * A built-in ID keeps the noun osrlib states for it.
 */
export function extendContextWithCatalog(ctx: TextContext, entries: CatalogEntries): TextContext {
  const next = cloneContext(ctx);
  for (const entry of entries.equipment ?? []) {
    if (!equipmentNoun(entry.id)) next.items[entry.id] = itemNounFromName(entry.name, { catalog: true }).one;
  }
  for (const entry of entries.magicItems ?? []) {
    if (!magicItemTemplateName(entry.id))
      next.items[entry.id] = itemNounFromName(entry.name, { catalog: true }).one;
  }
  for (const entry of entries.spells ?? []) {
    if (!spellCatalogName(entry.id)) next.spells[entry.id] = entry.name;
  }
  for (const entry of entries.areas ?? []) next.areas[entry.id] = entry.name;
  return next;
}

/**
 * Add display names by item ID, with their plurals when you have them, such as a player view's `item_names` and
 * `item_names_plural`: `{ 'magic-item-0001': 'potion', hand_of_saint_corvane: 'Hand of Saint Corvane' }`. Each
 * name becomes a noun that reads well in a sentence. A built-in equipment ID keeps the noun osrlib states for it, an
 * unidentified magic item keeps its masked name, and an adventure's proper name keeps its capitals.
 *
 * ```ts
 * ctx = extendContextWithNames(ctx, view.item_names, view.item_names_plural);
 * itemName('hand_of_saint_corvane', ctx); // 'the Hand of Saint Corvane'
 * ```
 */
export function extendContextWithNames(
  ctx: TextContext,
  names: Readonly<Record<string, string>>,
  plurals: Readonly<Record<string, string>> = {},
): TextContext {
  const next = cloneContext(ctx);
  registerItemNames(next, names, plurals);
  return next;
}

/** What players called one monster group or monster, as a feed entry's `names` records it. */
export interface EntryLabelLike {
  label: string;
  label_plural?: string;
  /** For a group, how many of it were alive when the entry was written. */
  count?: number;
  /** For a group, the most it has had alive. */
  size?: number;
  /** For a monster, what the table called it in its encounter, such as `Goblin 2`. */
  name?: string;
}

/** Loose shape of a game feed entry's `names` from the bxvtt server. A protocol `EntryNames` fits it. */
export interface EntryNamesLike {
  members?: Readonly<Record<string, string>>;
  groups?: Readonly<Record<string, EntryLabelLike>>;
  monsters?: Readonly<Record<string, EntryLabelLike>>;
  items?: Readonly<Record<string, string>>;
  /** What to call two or more of each item in `items`, by item ID. */
  items_plural?: Readonly<Record<string, string>>;
  /**
   * What to call each named valuable of `items` in the middle of a sentence, by item ID, as the player view's
   * `valuable_phrases` states it. An entry stored before osrlib 2.10.0 has none.
   */
  valuable_phrases?: Readonly<Record<string, string>>;
  /** Dungeon names by dungeon ID, for the dungeons the party has entered. */
  dungeons?: Readonly<Record<string, string>>;
}

/**
 * Add the names a game feed entry recorded for the IDs in its events (`entry.names` from the bxvtt server), so
 * the entry reads later as it read live. Without them, a battle loaded from the feed history reads "A monster
 * hits Osric", because the encounter that named the goblins is gone from the player view.
 *
 * The entry's member, group, and monster labels replace what the context had for those IDs, because they are
 * what the players saw when the command ran. Its item names fill in the items the context doesn't know, read as
 * in [`extendContextWithNames`][extendContextWithNames].
 *
 * ```ts
 * for (const entry of feed.entries) {
 *   if (entry.kind !== 'game') continue;
 *   const lines = describeEvents(entry.events, extendContextWithEntryNames(ctx, entry.names));
 * }
 * ```
 *
 * @param ctx - The context, which isn't changed.
 * @param names - The entry's `names`, or `undefined` for an entry that has none.
 * @returns A new context.
 */
export function extendContextWithEntryNames(
  ctx: TextContext,
  names: EntryNamesLike | undefined,
): TextContext {
  if (names === undefined) return ctx;
  const next = cloneContext(ctx);
  const label = (entry: EntryLabelLike) => ({
    label: entry.label,
    labelPlural:
      entry.label_plural && entry.label_plural !== '' ? entry.label_plural : pluralize(entry.label),
  });
  for (const [id, name] of Object.entries(names.members ?? {})) {
    if (name.trim() !== '') next.members[id] = { ...next.members[id], name };
  }
  for (const [id, entry] of Object.entries(names.groups ?? {})) {
    if (entry.label.trim() === '') continue;
    next.groups[id] = {
      ...next.groups[id],
      ...label(entry),
      ...(entry.count === undefined ? {} : { count: entry.count }),
      ...(entry.size === undefined ? {} : { size: entry.size }),
    };
  }
  for (const [id, name] of Object.entries(names.dungeons ?? {})) {
    if (name.trim() !== '') next.dungeons[id] = name;
  }
  for (const [id, entry] of Object.entries(names.monsters ?? {})) {
    if (entry.label.trim() === '') continue;
    // The entry's label and table name replace the context's, and a real name the context has, such as a
    // referee's NPC name, stays.
    const tableName = entry.name !== undefined && entry.name.trim() !== '' ? entry.name : undefined;
    next.monsters[id] = {
      ...next.monsters[id],
      ...label(entry),
      ...(tableName === undefined ? {} : { tableName }),
    };
  }
  const unknownItems = Object.fromEntries(
    Object.entries(names.items ?? {}).filter(([id]) => next.items[id] === undefined),
  );
  // A named valuable reads by the phrase the entry recorded. One with none, from an entry stored before osrlib
  // 2.10.0, stays in `unknownItems` and reads by the fallback in `legacyValuableNoun`.
  for (const [id, phrase] of Object.entries(names.valuable_phrases ?? {})) {
    const name = unknownItems[id];
    if (idKind(id) !== 'valuable' || name === undefined) continue;
    registerValuable(next, id, name, phrase);
    delete unknownItems[id];
  }
  return extendContextWithNames(next, unknownItems, names.items_plural ?? {});
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
 * - A defeated monster reveals what that monster ID was, when the context doesn't name it yet. A monster the
 *   context already names, such as one that `extendContextWithEntryNames` labelled as the players saw it, keeps
 *   that label, so a disguised monster isn't unmasked by its defeat.
 * - An identified item reveals what an item instance ID was.
 * - A new party member and a new encounter group reveal their names.
 * - Since osrlib 2.12, an item event names the items it lists in `item_names` and `item_names_plural` (and an
 *   `equipment_destroyed` event names its saved items in `saved_item_names`), with the names the party knew when it
 *   happened. Those names fill in only the items the context doesn't name, so an item a command used up, sold, or
 *   left behind still has a name. An event stored before 2.12 has none.
 *
 * Call it with the events of a command outcome before you describe them, so that a line like `monster-0003 is
 * slain` can say which kind of monster it was.
 */
export function extendContextWithEvents(ctx: TextContext, events: readonly LearnableEvent[]): TextContext {
  let next: TextContext | undefined;
  const edit = (): TextContext => (next ??= cloneContext(ctx));
  for (const event of events) {
    for (const [namesKey, pluralsKey] of EVENT_ITEM_NAME_FIELDS) {
      const names = stringRecord(event[namesKey]);
      const unknown = Object.fromEntries(
        Object.entries(names).filter(([id]) => (next ?? ctx).items[id] === undefined),
      );
      if (Object.keys(unknown).length > 0)
        registerItemNames(edit(), unknown, stringRecord(event[pluralsKey]));
    }
    switch (event.event_type) {
      case 'monster_defeated': {
        const monsterId = asString(event.monster_id);
        const templateId = asString(event.template_id);
        // Only a built-in template names what the players saw. An adventure's own template, such as the
        // disguised `drowned_prior`, can show the players another name, so its ID teaches nothing.
        const labels = templateId ? monsterTemplateLabels(templateId) : undefined;
        if (monsterId && templateId && labels && ctx.monsters[monsterId] === undefined) {
          edit().monsters[monsterId] = { label: labels.label, labelPlural: labels.labelPlural, templateId };
        }
        break;
      }
      case 'item_identified':
      case 'curse_revealed': {
        const instanceId = asString(event.instance_id);
        const templateId = asString(event.template_id);
        if (instanceId && templateId) {
          // Since osrlib 2.8, an identified item's event states its display names. An older event reads by the
          // built-in catalog, or by the words of its template ID.
          const noun = magicItemTemplateNoun(templateId);
          const name = asString(event.display_name) ?? noun?.one;
          const plural = asString(event.display_name_plural) ?? noun?.many;
          const next = edit();
          if (name !== undefined) next.items[instanceId] = name;
          if (name !== undefined && plural !== undefined) (next.itemsPlural ??= {})[instanceId] = plural;
          else if (name !== undefined) delete next.itemsPlural?.[instanceId];
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
  if (ctx.itemsPlural !== undefined) copy.itemsPlural = { ...ctx.itemsPlural };
  if (ctx.valuablePhrases !== undefined) copy.valuablePhrases = { ...ctx.valuablePhrases };
  if (ctx.reversedSpells !== undefined) copy.reversedSpells = { ...ctx.reversedSpells };
  if (ctx.townName !== undefined) copy.townName = ctx.townName;
  if (ctx.triggers !== undefined) copy.triggers = { ...ctx.triggers };
  if (ctx.flags !== undefined) copy.flags = { ...ctx.flags };
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
    if (ctx.itemsPlural !== undefined) merged.itemsPlural = { ...merged.itemsPlural, ...ctx.itemsPlural };
    if (ctx.valuablePhrases !== undefined)
      merged.valuablePhrases = { ...merged.valuablePhrases, ...ctx.valuablePhrases };
    Object.assign(merged.spells, ctx.spells);
    Object.assign(merged.areas, ctx.areas);
    Object.assign(merged.dungeons, ctx.dungeons);
    if (ctx.reversedSpells !== undefined)
      merged.reversedSpells = { ...merged.reversedSpells, ...ctx.reversedSpells };
    if (ctx.townName !== undefined) merged.townName = ctx.townName;
    if (ctx.triggers !== undefined) merged.triggers = { ...merged.triggers, ...ctx.triggers };
    if (ctx.flags !== undefined) merged.flags = { ...merged.flags, ...ctx.flags };
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

/**
 * The class of a member as it reads in the middle of a sentence, when known: `thief`, or `warlock of Sarn`. The
 * player view's class name comes first, so a custom class reads by its own name. {@link classInSentence} decides
 * which letters read in lower case.
 */
export function memberClass(id: string, ctx: TextContext): string | undefined {
  const known = ctx.members[id];
  if (known?.className) return classInSentence(known.className);
  const classId = known?.classId;
  return classId ? classInSentence(classCatalogName(classId) ?? prettifyId(classId)) : undefined;
}

function npcName(id: string, ctx: TextContext): string {
  const known = ctx.monsters[id];
  if (known?.name) return known.name;
  if (known) return tabledName(known);
  return 'an adventurer';
}

/** The labels all current groups share, when exactly one label is known. */
function soleGroupLabel(ctx: TextContext): string | undefined {
  const labels = new Set(Object.values(ctx.groups).map((group) => group.label));
  return labels.size === 1 ? [...labels][0] : undefined;
}

/**
 * Name of a monster: its own name when it has one (an NPC adventurer's), what the table calls it in its encounter
 * (`Goblin 2`), or its label (`a goblin`). A monster the context can't resolve takes the label of the encounter's
 * only monster group when there is just one kind, and otherwise reads as `a monster`.
 */
export function monsterName(id: string | null | undefined, ctx: TextContext): string {
  if (!id) return 'a monster';
  const known = ctx.monsters[id];
  if (known?.name) return known.name;
  if (known) return tabledName(known);
  const sole = soleGroupLabel(ctx);
  return sole ? oneOf(sole) : 'a monster';
}

/**
 * Whether a group label is a proper name, such as `Mag Corrie`, `Gashnak One-Ear`, or `Mag's bodyguard`: the
 * adventure writes it with a capital letter. A proper name takes no article and no plural. A common noun, such
 * as `goblin` or `robed corpse`, is written in lower case.
 */
export function isProperLabel(label: string): boolean {
  return /^\p{Lu}/u.test(label.trim());
}

/**
 * A creature the context knows, in a sentence: what the table calls it when that tells it apart from others of its
 * label (`Goblin 2`), and otherwise its label (`an ogre`, or `Mag Corrie` for a proper name).
 */
function tabledName(known: MonsterInfo): string {
  const table = known.tableName;
  if (table !== undefined && table !== capitalizeFirst(known.label)) return table;
  return oneOf(known.label);
}

/** One creature by its label: `a goblin`, or `Mag Corrie` for a proper name. */
function oneOf(label: string): string {
  return isProperLabel(label) ? label : withArticle(label);
}

/**
 * A group by its label and size, as it reads in a list: `2 goblins`, `a robed corpse`, or `Mag Corrie` for a
 * proper name, which takes no count.
 *
 * @param label - What to call one of them.
 * @param labelPlural - What to call several.
 * @param count - How many there are.
 */
export function countedLabel(label: string, labelPlural: string | undefined, count: number): string {
  if (isProperLabel(label) && count <= 1) return label;
  if (count === 1) return withArticle(label);
  return `${count} ${labelPlural && labelPlural !== '' ? labelPlural : pluralize(label)}`;
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
  if (options.count !== undefined) return countedLabel(known.label, known.labelPlural, options.count);
  const one = groupIsSingle(known);
  // A proper name takes no article: `Mag Corrie`, or `Mag's bodyguards` for several.
  if (isProperLabel(known.label)) return one === false ? known.labelPlural : known.label;
  return one === true ? `the ${known.label}` : `the ${known.labelPlural}`;
}

/**
 * Whether a group is one creature: `true` when it has one alive, or had one at most; `false` when it has or had
 * several; `undefined` when the context doesn't know its size.
 */
export function groupIsSingle(group: GroupInfo): boolean | undefined {
  if (group.count !== undefined && group.count > 0) return group.count === 1;
  if (group.size !== undefined && group.size > 0) return group.size === 1;
  return undefined;
}

/**
 * The noun for an item ID, with its singular, its plural, and whether it is a proper name. This is the one place
 * the text layer names items, so use it wherever the interface names an item in a sentence or a list.
 *
 * It tries, in order: the noun osrlib states for a built-in equipment ID (`torch`), the name in `ctx.items` (an
 * adventure item, a valuable, or a magic item's masked or identified name), `name` (a printed name you have,
 * such as an inventory entry's `template.name`), and a built-in magic item template. When nothing names the
 * item, the noun reads `something`, never the words of the ID, because an authored ID can say more than the
 * item's display name does.
 *
 * ```ts
 * const noun = resolveItemNoun('torch', ctx); // { one: 'torch', many: 'torches' }
 * itemPhrase(noun, 6); // '6 torches'
 * resolveItemNoun('moon_blade', ctx, { name: 'Moon blade' }).one; // 'moon blade'
 * itemName('moon_blade', emptyContext()); // 'something'
 * ```
 */
export function resolveItemNoun(id: string, ctx: TextContext, options: { name?: string } = {}): ItemNoun {
  const kind = idKind(id);
  const stated = kind === 'other' ? equipmentNoun(id) : undefined;
  if (stated) return stated;
  const fromContext = ctx.items[id];
  if (fromContext) {
    // A named valuable reads by bxapi's phrase, as written. `one` is the phrase without its article.
    const phrase = kind === 'valuable' ? ctx.valuablePhrases?.[id] : undefined;
    if (phrase !== undefined) {
      const one = stripArticle(phrase);
      return { one, many: pluralize(one), phrase };
    }
    const noun = nounForId(id, fromContext);
    // bxapi's plural, when the context has it, replaces the one the text layer would form.
    const plural = ctx.itemsPlural?.[id];
    return plural === undefined ? noun : { ...noun, many: plural };
  }
  if (options.name) return nounForId(id, options.name);
  if (kind === 'magic-item') return { one: 'magic item', many: 'magic items' };
  if (kind === 'valuable') return { one: 'gem or jewel', many: 'gems or jewels' };
  const magic = magicItemTemplateNoun(id);
  if (magic) return magic;
  // Nothing names the item. An authored ID can say more than the item's display name does, so the text never
  // reads the ID's words.
  return UNNAMED_ITEM;
}

/**
 * Name of an item as a noun phrase without an article, for example `torch`, `potion`, or `jade idol`. Pass
 * `count` to get the plural form for a count above one.
 */
export function itemNoun(id: string, ctx: TextContext, count = 1): string {
  const noun = resolveItemNoun(id, ctx);
  return count === 1 ? noun.one : noun.many;
}

/** Name of an item with an article: `a torch`, `an iron spike`, `thieves' tools`, `the Hand of Saint Corvane`. */
export function itemName(id: string, ctx: TextContext): string {
  return itemPhrase(resolveItemNoun(id, ctx));
}

/** Describe a stack of identical item IDs: `3 torches`, `a sword`. */
export function itemCount(id: string, quantity: number, ctx: TextContext): string {
  return itemPhrase(resolveItemNoun(id, ctx), quantity);
}

/** Options for [`itemList`][itemList]. */
export interface ItemListOptions {
  /**
   * Count each ID as one purchase lot rather than one unit, as the `item_ids` of a purchase do, so two `torch`
   * IDs read as `12 torches`.
   */
  lots?: boolean;
}

/**
 * Describe a list of item IDs, one per unit, grouping repeats: `2 torches, a sword, and a rope`. The IDs that
 * nothing names collapse into one entry at the end: `something`, or `something else` beside named items.
 */
export function itemList(ids: readonly string[], ctx: TextContext, options: ItemListOptions = {}): string[] {
  // Items count together by what they read as, so four unnamed valuables read `4 gems or jewels`.
  const order: string[] = [];
  const groups = new Map<string, { noun: ItemNoun; count: number }>();
  let unnamed = false;
  for (const id of ids) {
    const noun = resolveItemNoun(id, ctx);
    if (noun.unnamed === true) {
      unnamed = true;
      continue;
    }
    const key = JSON.stringify([noun.one, noun.many, noun.proper === true, noun.phrase ?? null]);
    const units = options.lots ? (equipmentLotSize(id) ?? 1) : 1;
    const known = groups.get(key);
    if (known === undefined) {
      order.push(key);
      groups.set(key, { noun, count: units });
    } else {
      known.count += units;
    }
  }
  const phrases = order.map((key) => {
    const group = groups.get(key);
    return group === undefined ? '' : itemPhrase(group.noun, group.count);
  });
  if (unnamed) phrases.push(phrases.length > 0 ? 'something else' : 'something');
  return phrases;
}

/** Name of a spell, as the rules write it, which is a proper name: `Magic Missile`. */
export function spellName(id: string | null | undefined, ctx: TextContext): string {
  if (!id) return 'a spell';
  return ctx.spells[id] ?? spellCatalogName(id) ?? prettifyId(id);
}

/**
 * Name of a spell in the form it was cast or memorized: its name, or for the reversed form, the reverse's own
 * name when the context knows it (`Darkness`), and otherwise `the reversed form of Light`.
 */
export function spellFormName(
  id: string | null | undefined,
  reversed: boolean | null | undefined,
  ctx: TextContext,
): string {
  if (reversed !== true) return spellName(id, ctx);
  const reverse = id ? ctx.reversedSpells?.[id] : undefined;
  return reverse ?? `the reversed form of ${spellName(id, ctx)}`;
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
      return 'a treasure';
    case 'temple':
      return 'the temple cleric';
    case 'side':
      return id === 'party' ? 'the party' : 'the monsters';
    default:
      if (ctx.members[id]) return memberName(id, ctx);
      return lowerFirst(prettifyId(id));
  }
}
