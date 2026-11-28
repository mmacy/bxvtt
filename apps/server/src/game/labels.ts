import type { EntryLabel, EntryNames, GameEvent, PlayerView } from '@bxvtt/shared/protocol';
import { creatureNames } from '@bxvtt/shared/text';

/**
 * What the players of a session have called each member, group, and monster so far. The server reads it from
 * the player view after every command, so it keeps the label of a monster after its encounter ends and the
 * player view stops showing the group.
 */
export interface LabelBook {
  members: Map<string, string>;
  groups: Map<string, EntryLabel>;
  monsters: Map<string, EntryLabel>;
}

/** Starts a session's label book, which the server fills from the player view. */
export function newLabelBook(): LabelBook {
  return { members: new Map(), groups: new Map(), monsters: new Map() };
}

/**
 * Adds what the player view names now: the party's names, the groups' labels, and for each creature of a group
 * the group's label and the creature's name in the encounter, such as `Goblin 2`. The player view shows the label
 * the players see, so a monster that the adventure disguises keeps its disguise.
 *
 * @param book - The book, which this changes.
 * @param view - The player view.
 */
export function learnLabels(book: LabelBook, view: PlayerView): void {
  for (const member of view.party) book.members.set(member.id, member.name);
  const groups = view.encounter?.groups ?? [];
  for (const group of groups) {
    const size = Math.max(group.count, book.groups.get(group.id)?.size ?? 0);
    book.groups.set(group.id, {
      label: group.label,
      label_plural: group.label_plural === '' ? `${group.label}s` : group.label_plural,
      ...(size > 0 ? { size } : {}),
    });
  }
  const labels = new Map(groups.map((group) => [group.id, book.groups.get(group.id)]));
  for (const creature of creatureNames(groups)) {
    const label = labels.get(creature.group_id);
    if (label === undefined) continue;
    book.monsters.set(creature.id, {
      label: label.label,
      label_plural: label.label_plural,
      name: creature.name,
    });
  }
}

/** What to call one and several of each item, by item ID, from what a player can see. */
export interface ItemNames {
  one: Map<string, string>;
  many: Map<string, string>;
  /** What to call each named valuable in a sentence, by item ID, from the views' `valuable_phrases`. */
  phrases: Map<string, string>;
}

/** The fields of an event that name the items it lists, each with the field of their plurals. */
const EVENT_NAME_FIELDS = [
  ['item_names', 'item_names_plural'],
  ['saved_item_names', 'saved_item_names_plural'],
] as const;

/** A JSON object whose values are all strings, or `{}` for anything else, such as a list. */
function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/**
 * Collects the item names for a command's feed entry from what a player can see. The referee view is never read,
 * so a masked magic item keeps its masked name.
 *
 * - **The events:** since osrlib 2.12, each item event names the items it lists in `item_names` and
 *   `item_names_plural` (and `equipment_destroyed` its saved items in `saved_item_names`), with the names the party
 *   knew when it happened. So an item that the command used up, sold, or left behind has a name, and an item
 *   identified before it was used has its true name. A later event's name wins.
 * - **The player view after the command:** its `item_names` and `item_names_plural` fill in an ID that no event
 *   names, and the `display_name` of an `item_identified` event fills in one that neither names.
 * - **Named valuables:** an event names a gem or a piece of jewellery by its kind, and only a view states the own
 *   name of a piece that has one (`valuable_names`) with its phrase (`valuable_phrases`). So the view from before
 *   the command, `earlier`, still names a valuable that the command sold or gave away. The view after wins.
 *
 * @param view - The player view after the command.
 * @param events - The events of the command.
 * @param earlier - The player view before the command, read only for named valuables.
 */
export function itemNames(
  view: PlayerView,
  events: readonly GameEvent[] = [],
  earlier?: PlayerView,
): ItemNames {
  const names: ItemNames = { one: new Map(), many: new Map(), phrases: new Map() };
  for (const event of events) {
    const fields = event as unknown as Record<string, unknown>;
    for (const [namesKey, pluralsKey] of EVENT_NAME_FIELDS) {
      const plurals = stringRecord(fields[pluralsKey]);
      for (const [id, name] of Object.entries(stringRecord(fields[namesKey]))) {
        if (name.trim() === '') continue;
        names.one.set(id, name);
        const plural = plurals[id];
        if (plural === undefined || plural.trim() === '') names.many.delete(id);
        else names.many.set(id, plural);
      }
    }
  }
  const plurals = view.item_names_plural ?? {};
  for (const [id, name] of Object.entries(view.item_names ?? {})) {
    if (names.one.has(id)) continue;
    names.one.set(id, name);
    const plural = plurals[id];
    if (plural !== undefined) names.many.set(id, plural);
  }
  for (const event of events) {
    // An event stored before osrlib 2.8 has no display names.
    if (event.event_type !== 'item_identified' || !event.display_name) continue;
    for (const id of [event.instance_id, event.template_id]) {
      if (names.one.has(id)) continue;
      names.one.set(id, event.display_name);
      if (event.display_name_plural) names.many.set(id, event.display_name_plural);
    }
  }
  for (const source of earlier === undefined ? [view] : [earlier, view]) {
    // A named valuable's own name wins, with no plural, because a named valuable is one thing.
    for (const [id, name] of Object.entries(source.valuable_names ?? {})) {
      names.one.set(id, name);
      names.many.delete(id);
      const phrase = source.valuable_phrases?.[id];
      if (phrase === undefined) names.phrases.delete(id);
      else names.phrases.set(id, phrase);
    }
  }
  return names;
}

/**
 * The names of the dungeons the party has entered, by dungeon ID, from the player view.
 *
 * @param view - The player view.
 */
export function dungeonNames(view: PlayerView): Record<string, string> {
  const names: Record<string, string> = {};
  for (const dungeon of view.dungeons) if (dungeon.name) names[dungeon.id] = dungeon.name;
  return names;
}

/** Every string in a JSON value. */
function strings(value: unknown, into: Set<string>): Set<string> {
  if (typeof value === 'string') into.add(value);
  else if (Array.isArray(value)) for (const entry of value) strings(entry, into);
  else if (typeof value === 'object' && value !== null)
    for (const entry of Object.values(value)) strings(entry, into);
  return into;
}

/**
 * The names for the IDs that some events name.
 *
 * @param events - The events of one copy of a feed entry.
 * @param book - The session's labels.
 * @param items - The item names a player can see, from {@link itemNames}.
 * @param context - The player view after the command, the dungeon names, and the member who acted.
 */
export function entryNames(
  events: readonly GameEvent[],
  book: LabelBook,
  items: ItemNames,
  context: { view?: PlayerView; dungeons?: Readonly<Record<string, string>>; actorId?: string | null } = {},
): EntryNames {
  const names: EntryNames = {
    members: {},
    groups: {},
    monsters: {},
    items: {},
    items_plural: {},
    valuable_phrases: {},
    dungeons: {},
  };
  // The member who acted, whom the events may leave out, such as the speaker of a talk.
  const actor = context.actorId == null ? undefined : book.members.get(context.actorId);
  if (context.actorId != null && actor !== undefined) names.members[context.actorId] = actor;
  // The groups of the open encounter, with their sizes, so a talk or an encounter's start can name the monsters.
  for (const group of context.view?.encounter?.groups ?? []) {
    const size = Math.max(group.count, book.groups.get(group.id)?.size ?? 0);
    names.groups[group.id] = {
      label: group.label,
      label_plural: group.label_plural === '' ? `${group.label}s` : group.label_plural,
      count: group.count,
      ...(size > 0 ? { size } : {}),
    };
  }
  for (const id of strings(events, new Set())) {
    const member = book.members.get(id);
    if (member !== undefined) names.members[id] = member;
    const group = book.groups.get(id);
    if (group !== undefined && names.groups[id] === undefined) names.groups[id] = group;
    const monster = book.monsters.get(id);
    if (monster !== undefined) names.monsters[id] = monster;
    const item = items.one.get(id);
    if (item !== undefined) names.items[id] = item;
    const plural = items.many.get(id);
    if (plural !== undefined && names.items_plural !== undefined) names.items_plural[id] = plural;
    const phrase = items.phrases.get(id);
    if (phrase !== undefined && names.valuable_phrases !== undefined) names.valuable_phrases[id] = phrase;
    const dungeon = context.dungeons?.[id];
    if (dungeon !== undefined && names.dungeons !== undefined) names.dungeons[id] = dungeon;
  }
  return names;
}
