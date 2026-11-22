import type { RefereeView } from '@bxvtt/shared/bxapi';
import type { EntryLabel, EntryNames, GameEvent, PlayerView } from '@bxvtt/shared/protocol';
import type { Database } from '../db';
import { str } from '../db';

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

/**
 * Starts a session's label book. Monsters the party met before the server started again keep the label of the
 * group they were first seen in, which the target handles record.
 *
 * @param db - The database.
 * @param sessionId - The session ID.
 */
export function newLabelBook(db: Database, sessionId: string): LabelBook {
  const book: LabelBook = { members: new Map(), groups: new Map(), monsters: new Map() };
  for (const row of db.all('SELECT monster_id, label FROM target_handles WHERE session_id = ?', sessionId)) {
    const label = str(row, 'label');
    book.monsters.set(str(row, 'monster_id'), { label, label_plural: `${label}s` });
  }
  return book;
}

/**
 * Adds what the player view names now: the party's names, the groups' labels, and for each monster of a group
 * the group's label as the player view shows it. The referee view only says which monsters stand in which group,
 * so a monster that the adventure disguises keeps the label the players see.
 *
 * @param book - The book, which this changes.
 * @param view - The player view.
 * @param refereeView - The referee view at the same revision, for each group's monster IDs.
 */
export function learnLabels(
  book: LabelBook,
  view: PlayerView,
  refereeView: Pick<RefereeView, 'encounter'>,
): void {
  for (const member of view.party) book.members.set(member.id, member.name);
  for (const group of view.encounter?.groups ?? []) {
    const size = Math.max(group.count, book.groups.get(group.id)?.size ?? 0);
    const label: EntryLabel = {
      label: group.label,
      label_plural: group.label_plural === '' ? `${group.label}s` : group.label_plural,
      ...(size > 0 ? { size } : {}),
    };
    book.groups.set(group.id, label);
    const source = refereeView.encounter?.groups.find((candidate) => candidate.id === group.id);
    const monster: EntryLabel = { label: label.label, label_plural: label.label_plural };
    for (const monsterId of source?.monster_ids ?? []) book.monsters.set(monsterId, monster);
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
