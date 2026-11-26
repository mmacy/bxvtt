import type { EntryLabel, EntryNames, GameEvent, PlayerView } from '@bxvtt/shared/protocol';
import { creatureNames } from '@bxvtt/shared/protocol';

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
 * @param items - The item names the party knows, as in `scene.names`.
 */
export function entryNames(
  events: readonly GameEvent[],
  book: LabelBook,
  items: ReadonlyMap<string, string>,
  context: { view?: PlayerView; dungeons?: Readonly<Record<string, string>>; actorId?: string | null } = {},
): EntryNames {
  const names: EntryNames = { members: {}, groups: {}, monsters: {}, items: {}, dungeons: {} };
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
    const item = items.get(id);
    if (item !== undefined) names.items[id] = item;
    const dungeon = context.dungeons?.[id];
    if (dungeon !== undefined && names.dungeons !== undefined) names.dungeons[id] = dungeon;
  }
  return names;
}
