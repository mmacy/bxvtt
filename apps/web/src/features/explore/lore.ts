/**
 * What the table has learned this session that the player view doesn't state: whether a door turned out to be
 * locked or stuck, what a listener heard at it, who already tried a lock, and what each member's light is. It comes from bxapi's events in the
 * feed and from the refusals of this user's own commands. This browser keeps it in session storage, so a reload
 * keeps it for as long as the tab is open.
 *
 * Every rule stays with bxapi. The lore only remembers what bxapi said.
 */
import type { FeedEntry, GameEvent, PlayerView, Rejection } from '@bxvtt/shared/protocol';
import { create } from 'zustand';
import { scopedStorage } from '@/app';
import { edgeKey, levelKey, type Direction } from '@/map';

/** What the table knows about one door. Each field is unset until an event or a refusal says so. */
export interface DoorLore {
  locked?: boolean;
  /** Set once the party unlocked the door. */
  unlocked?: boolean;
  stuck?: boolean;
  /** What the last listener heard beyond it. */
  heard?: 'noise' | 'silence';
  /** The members who listened at it. */
  listened?: string[];
  /** The members whose lock pick failed. */
  pickFailed?: string[];
}

/** The party's location as the player view states it. */
export type PartyLocation = PlayerView['location'];

export interface Lore {
  sessionId: string | null;
  /** By `{dungeon}:{level}:{edge key}`. */
  doors: Record<string, DoorLore>;
  /** The source of each member's burning light, such as `torch` or `lantern`, from bxapi's light events. */
  lights: Record<string, string>;
  /** The party's location at each revision this browser saw, oldest first. */
  history: Array<{ revision: number; location: PartyLocation }>;
  /**
   * The `seq` of the newest feed entry already read. The feed is in `seq` order, so each update reads only the
   * entries after it.
   */
  lastSeq: number;
}

export function emptyLore(sessionId: string | null = null): Lore {
  return { sessionId, doors: {}, lights: {}, history: [], lastSeq: 0 };
}

const HISTORY_LIMIT = 400;

function isDirection(value: unknown): value is Direction {
  return value === 'north' || value === 'east' || value === 'south' || value === 'west';
}

function levelOf(location: PartyLocation | null): string | null {
  if (location?.kind !== 'dungeon' || location.dungeon_id == null || location.level_number == null)
    return null;
  return levelKey(location.dungeon_id, location.level_number);
}

function cellOf(location: PartyLocation | null): [number, number] | null {
  if (location?.kind !== 'dungeon' || !location.position) return null;
  return [location.position[0], location.position[1]];
}

function addUnique(list: string[] | undefined, value: string): string[] {
  const current = list ?? [];
  return current.includes(value) ? current : [...current, value];
}

function updateDoor(lore: Lore, key: string, change: (door: DoorLore) => DoorLore): Lore {
  return { ...lore, doors: { ...lore.doors, [key]: change(lore.doors[key] ?? {}) } };
}

/** The door lore key of the side `direction` of the party's cell at `location`. */
export function doorKeyAt(location: PartyLocation | null, direction: Direction): string | null {
  const level = levelOf(location);
  const cell = cellOf(location);
  if (level === null || cell === null) return null;
  return `${level}:${edgeKey(cell[0], cell[1], direction)}`;
}

/** Records where the party was at a revision, so a later feed entry knows the cell its command acted from. */
export function observeLocation(lore: Lore, revision: number, location: PartyLocation): Lore {
  const last = lore.history.at(-1);
  if (last && last.revision === revision) return lore;
  return { ...lore, history: [...lore.history, { revision, location }].slice(-HISTORY_LIMIT) };
}

/** The location at the latest revision before `revision` that this browser saw, or `null`. */
export function locationBefore(lore: Lore, revision: number): PartyLocation | null {
  // From the newest end, because a feed entry is nearly always newer than most of the history.
  for (let i = lore.history.length - 1; i >= 0; i -= 1) {
    const entry = lore.history[i];
    if (entry && entry.revision < revision) return entry.location;
  }
  return null;
}

function str(event: GameEvent, field: string): string | null {
  const value = (event as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}

function num(event: GameEvent, field: string): number | null {
  const value = (event as Record<string, unknown>)[field];
  return typeof value === 'number' ? value : null;
}

/**
 * Learns from the events of one accepted command.
 *
 * @param lore - The lore so far.
 * @param events - The command's events.
 * @param before - The party's location before the command, or `null` when unknown.
 * @param command - What was sent, when this browser sent it, to learn from a pick that changed nothing.
 */
export function learnFromEvents(
  lore: Lore,
  events: readonly GameEvent[],
  before: PartyLocation | null,
  command?: { command_type: string; direction?: unknown; character_id?: unknown },
): Lore {
  let next = lore;
  const level = levelOf(before);
  for (const event of events) {
    switch (event.event_type) {
      case 'door': {
        const x = num(event, 'x');
        const y = num(event, 'y');
        const direction = str(event, 'direction');
        if (level === null || x === null || y === null || !isDirection(direction)) break;
        const key = `${level}:${edgeKey(x, y, direction)}`;
        switch (event.code) {
          case 'exploration.door.stuck':
            next = updateDoor(next, key, (door) => ({ ...door, stuck: true }));
            break;
          case 'exploration.door.forced':
            next = updateDoor(next, key, (door) => ({ ...door, stuck: false, locked: false }));
            break;
          case 'exploration.door.unlocked':
            next = updateDoor(next, key, (door) => ({ ...door, locked: false, unlocked: true }));
            break;
          case 'exploration.door.opened':
            next = updateDoor(next, key, (door) => ({ ...door, locked: false, stuck: false }));
            break;
          default:
            break;
        }
        break;
      }
      case 'listened': {
        const direction = str(event, 'direction');
        const member = str(event, 'character_id');
        const key = isDirection(direction) ? doorKeyAt(before, direction) : null;
        if (key === null) break;
        next = updateDoor(next, key, (door) => ({
          ...door,
          heard: event.code === 'exploration.listen.heard' ? 'noise' : 'silence',
          listened: member ? addUnique(door.listened, member) : door.listened,
        }));
        break;
      }
      case 'light': {
        const member = str(event, 'character_id');
        const source = str(event, 'source');
        if (member === null) break;
        if (event.code === 'exploration.light.lit' && source !== null) {
          next = { ...next, lights: { ...next.lights, [member]: source } };
        } else if (
          event.code === 'exploration.light.expired' ||
          event.code === 'exploration.light.extinguished'
        ) {
          const { [member]: _gone, ...rest } = next.lights;
          next = { ...next, lights: rest };
        }
        break;
      }
      default:
        break;
    }
  }
  if (
    command?.command_type === 'pick_lock' &&
    isDirection(command.direction) &&
    typeof command.character_id === 'string' &&
    !events.some((event) => event.event_type === 'door' && event.code === 'exploration.door.unlocked')
  ) {
    const key = doorKeyAt(before, command.direction);
    const member = command.character_id;
    if (key !== null)
      next = updateDoor(next, key, (door) => ({ ...door, pickFailed: addUnique(door.pickFailed, member) }));
  }
  return next;
}

/** Learns from bxapi's refusal of a door command this browser sent. */
export function learnFromRefusal(
  lore: Lore,
  command: { command_type: string; direction?: unknown; character_id?: unknown },
  rejections: readonly Rejection[],
  location: PartyLocation | null,
): Lore {
  if (!isDirection(command.direction)) return lore;
  const key = doorKeyAt(location, command.direction);
  if (key === null) return lore;
  const member = typeof command.character_id === 'string' ? command.character_id : null;
  let next = lore;
  for (const rejection of rejections) {
    switch (rejection.code) {
      case 'exploration.door.locked':
        next = updateDoor(next, key, (door) => ({ ...door, locked: true }));
        break;
      case 'exploration.door.stuck':
        next = updateDoor(next, key, (door) => ({ ...door, stuck: true }));
        break;
      case 'exploration.door.not_stuck':
        next = updateDoor(next, key, (door) => ({ ...door, stuck: false }));
        break;
      case 'exploration.lock.not_locked':
        next = updateDoor(next, key, (door) => ({ ...door, locked: false }));
        break;
      case 'exploration.lock.locked_out':
        if (member)
          next = updateDoor(next, key, (door) => ({
            ...door,
            pickFailed: addUnique(door.pickFailed, member),
          }));
        break;
      case 'exploration.listen.already_tried':
        if (member)
          next = updateDoor(next, key, (door) => ({ ...door, listened: addUnique(door.listened, member) }));
        break;
      default:
        break;
    }
  }
  return next;
}

/**
 * Reads the feed entries this browser hasn't read yet, in order. A game entry waits until the browser has seen
 * the revision it produced, so the party's location before it is known. Each call visits only the new entries.
 *
 * @param lore - The lore so far.
 * @param feed - The feed, oldest first.
 * @param sessionId - The current session.
 * @param latestRevision - The newest revision this browser has.
 * @param stats - Counts the entries visited, for a test that the work grows linearly with the feed.
 */
export function learnFromFeed(
  lore: Lore,
  feed: readonly FeedEntry[],
  sessionId: string,
  latestRevision: number,
  stats?: { visited: number },
): Lore {
  // Walk back from the end to the first unread entry, so an update costs the new entries, not the whole feed.
  let start = feed.length;
  while (start > 0 && (feed[start - 1]?.seq ?? 0) > lore.lastSeq) start -= 1;
  if (start === feed.length) return lore;
  let next = lore;
  let lastSeq = lore.lastSeq;
  for (let i = start; i < feed.length; i += 1) {
    const entry = feed[i];
    if (entry === undefined) break;
    if (stats) stats.visited += 1;
    if (entry.kind === 'game' && entry.session_id === sessionId) {
      // Wait for the game state this entry produced, so the party's location before it is known.
      if (entry.revision > latestRevision) break;
      next = learnFromEvents(next, entry.events, locationBefore(next, entry.revision));
    }
    lastSeq = entry.seq;
  }
  return lastSeq === lore.lastSeq && next === lore ? lore : { ...next, lastSeq };
}

/** Session storage for the lore, so a reload keeps what the table learned, such as a refusal only this user saw. */
const stored = scopedStorage('explore', 'session');

function storageName(tableId: string, sessionId: string): string {
  return `lore.${tableId}.${sessionId}`;
}

function readDoor(value: unknown): DoorLore | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const door: DoorLore = {};
  for (const flag of ['locked', 'unlocked', 'stuck'] as const) {
    if (typeof record[flag] === 'boolean') door[flag] = record[flag];
  }
  if (record['heard'] === 'noise' || record['heard'] === 'silence') door.heard = record['heard'];
  for (const list of ['listened', 'pickFailed'] as const) {
    const items = record[list];
    if (Array.isArray(items)) door[list] = items.filter((item): item is string => typeof item === 'string');
  }
  return door;
}

/** What this browser stored for a table's session, read with checks, since storage can hold anything. */
export function readStoredLore(tableId: string, sessionId: string): Pick<Lore, 'doors' | 'lights'> {
  const raw = stored.read(storageName(tableId, sessionId));
  const out: Pick<Lore, 'doors' | 'lights'> = { doors: {}, lights: {} };
  if (typeof raw !== 'object' || raw === null) return out;
  const record = raw as Record<string, unknown>;
  const doors = record['doors'];
  if (typeof doors === 'object' && doors !== null) {
    for (const [key, value] of Object.entries(doors as Record<string, unknown>)) {
      const door = readDoor(value);
      if (door) out.doors[key] = door;
    }
  }
  const lights = record['lights'];
  if (typeof lights === 'object' && lights !== null) {
    for (const [member, source] of Object.entries(lights as Record<string, unknown>)) {
      if (typeof source === 'string') out.lights[member] = source;
    }
  }
  return out;
}

interface LoreStore {
  byTable: Record<string, Lore>;
  update: (tableId: string, sessionId: string, change: (lore: Lore) => Lore) => void;
}

/** The lore of every open table, by table ID. A new session starts a new lore. */
export const useLoreStore = create<LoreStore>()((set) => ({
  byTable: {},
  update: (tableId, sessionId, change) =>
    set((state) => {
      const current = state.byTable[tableId];
      const base =
        current && current.sessionId === sessionId
          ? current
          : { ...emptyLore(sessionId), ...readStoredLore(tableId, sessionId) };
      const next = change(base);
      if (next === current) return state;
      if (next.doors !== base.doors || next.lights !== base.lights || base !== current)
        stored.write(storageName(tableId, sessionId), { doors: next.doors, lights: next.lights });
      return { byTable: { ...state.byTable, [tableId]: next } };
    }),
}));

const EMPTY = emptyLore();

/**
 * One part of the lore of a table and session, such as `doors`. Selecting a part keeps a component from
 * rendering again when only the read position or the location history changes, which happens on every feed
 * entry and every move.
 */
export function useLorePart<K extends 'doors' | 'lights'>(
  tableId: string,
  sessionId: string | null,
  part: K,
): Lore[K] {
  return useLoreStore((s) => {
    const lore = s.byTable[tableId];
    return (lore && lore.sessionId === sessionId ? lore : EMPTY)[part];
  });
}
