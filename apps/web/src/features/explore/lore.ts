/**
 * What the table has learned this session that the player view doesn't state: whether a door turned out to be
 * locked or stuck, what a listener heard at it, who already tried a lock, and where the party came into each
 * dungeon. It comes from bxapi's events in the feed and from the refusals of this user's own commands, and it
 * lives in this browser for as long as the page is open.
 *
 * Every rule stays with bxapi. The lore only remembers what bxapi said.
 */
import type { FeedEntry, GameEvent, PlayerView, Rejection } from '@bxvtt/shared/protocol';
import { create } from 'zustand';
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
  /** The cell where the party entered each dungeon, by dungeon ID. */
  entrances: Record<string, { levelNumber: number; x: number; y: number }>;
  /** The party's location at each revision this browser saw, oldest first. */
  history: Array<{ revision: number; location: PartyLocation }>;
  /** The feed entries already read. */
  seenSeqs: Record<number, true>;
}

export function emptyLore(sessionId: string | null = null): Lore {
  return { sessionId, doors: {}, entrances: {}, history: [], seenSeqs: {} };
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

/** Records where the party was at a revision, and the entrance when the party just arrived from town. */
export function observeLocation(lore: Lore, revision: number, location: PartyLocation): Lore {
  const last = lore.history.at(-1);
  if (last && last.revision === revision) return lore;
  let next: Lore = {
    ...lore,
    history: [...lore.history, { revision, location }].slice(-HISTORY_LIMIT),
  };
  if (last && last.location.kind === 'town' && location.kind === 'dungeon') {
    next = recordEntrance(next, location);
  }
  return next;
}

function recordEntrance(lore: Lore, location: PartyLocation): Lore {
  const cell = cellOf(location);
  if (location.kind !== 'dungeon' || location.dungeon_id == null || location.level_number == null || !cell)
    return lore;
  return {
    ...lore,
    entrances: {
      ...lore.entrances,
      [location.dungeon_id]: { levelNumber: location.level_number, x: cell[0], y: cell[1] },
    },
  };
}

/** The location at the latest revision before `revision` that this browser saw, or `null`. */
export function locationBefore(lore: Lore, revision: number): PartyLocation | null {
  let found: PartyLocation | null = null;
  for (const entry of lore.history) {
    if (entry.revision < revision) found = entry.location;
    else break;
  }
  return found;
}

/** The location at `revision`, or `null` when this browser didn't see that revision. */
export function locationAt(lore: Lore, revision: number): PartyLocation | null {
  return lore.history.find((entry) => entry.revision === revision)?.location ?? null;
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
 * @param after - The party's location after it, or `null` when unknown.
 * @param command - What was sent, when this browser sent it, to learn from a pick that changed nothing.
 */
export function learnFromEvents(
  lore: Lore,
  events: readonly GameEvent[],
  before: PartyLocation | null,
  after: PartyLocation | null,
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
      case 'location_entered': {
        if (str(event, 'via') === 'entrance' && after) next = recordEntrance(next, after);
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
 * Reads the feed entries this browser hasn't read yet. An entry is read once the browser has seen the game
 * revision it produced, so the party's location before and after it is known.
 *
 * @param lore - The lore so far.
 * @param feed - The feed, oldest first.
 * @param sessionId - The current session.
 * @param latestRevision - The newest revision this browser has.
 */
export function learnFromFeed(
  lore: Lore,
  feed: readonly FeedEntry[],
  sessionId: string,
  latestRevision: number,
): Lore {
  let next = lore;
  for (const entry of feed) {
    if (next.seenSeqs[entry.seq]) continue;
    if (entry.kind !== 'game') {
      next = { ...next, seenSeqs: { ...next.seenSeqs, [entry.seq]: true } };
      continue;
    }
    if (entry.session_id !== sessionId) {
      next = { ...next, seenSeqs: { ...next.seenSeqs, [entry.seq]: true } };
      continue;
    }
    if (entry.revision > latestRevision) continue;
    const before = locationBefore(next, entry.revision);
    const after = locationAt(next, entry.revision);
    next = learnFromEvents(next, entry.events, before, after);
    next = { ...next, seenSeqs: { ...next.seenSeqs, [entry.seq]: true } };
  }
  return next;
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
      const base = current && current.sessionId === sessionId ? current : emptyLore(sessionId);
      const next = change(base);
      if (next === current) return state;
      return { byTable: { ...state.byTable, [tableId]: next } };
    }),
}));

const EMPTY = emptyLore();

/** The lore of one table and session. */
export function useLore(tableId: string, sessionId: string | null): Lore {
  return useLoreStore((s) => {
    const lore = s.byTable[tableId];
    return lore && lore.sessionId === sessionId ? lore : EMPTY;
  });
}
