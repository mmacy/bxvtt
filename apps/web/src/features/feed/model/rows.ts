/**
 * Builds the rows of the feed list from the entries: which entries the reader sees, the filter and search, the
 * groups (messages from one author, one block per command, runs of party movement), and the day, session, and
 * unread dividers. Everything here is pure, so the list can rebuild it on every change.
 */
import type { ChatEntry, FeedEntry, GameEntry, RollEntry, SystemEntry } from '@bxvtt/shared/protocol';
import { commandInfo } from '@bxvtt/shared/text';
import { movementSteps, visibleEvents, type PartyStep } from './narrate';

/** Which entries the feed shows. `hidden` is for a referee with the lens on. */
export type FeedFilter = 'all' | 'chat' | 'game' | 'rolls' | 'hidden';

/** A message entry: chat, a whisper, or a dice roll. */
export type MessageEntry = ChatEntry | RollEntry;

/**
 * One part of a command group: a run of plain party movement folded into one line, or one entry's events.
 */
export type CommandPart =
  | { kind: 'steps'; key: string; entries: GameEntry[]; steps: PartyStep[]; checks: number }
  | { kind: 'entry'; key: string; entry: GameEntry };

/** One row of the feed list. */
export type FeedRow =
  | { type: 'day'; key: string; label: string }
  | { type: 'session'; key: string; entry: SystemEntry | null; sessionId: string | null }
  | { type: 'unread'; key: string }
  | { type: 'messages'; key: string; userId: string | null; entries: MessageEntry[] }
  | {
      type: 'command';
      key: string;
      userId: string | null;
      group: string;
      entries: GameEntry[];
      parts: CommandPart[];
    }
  | { type: 'system'; key: string; entry: SystemEntry };

export interface RowOptions {
  /** The reader's user ID. */
  selfId: string | null;
  /** Whether the reader is a referee with the lens on. */
  lens: boolean;
  filter: FeedFilter;
  /** Text to search for, or an empty string. */
  query: string;
  /** The searchable text of an entry. Only called while searching. */
  textOf: (entry: FeedEntry) => string;
  /** The `seq` the reader had read up to, or `null` for no unread divider. */
  unreadAfter: number | null;
  /** The current time, for "Today" and "Yesterday". */
  now: Date;
  /** The time zone to show days in. Tests set it. */
  timeZone?: string;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const COMMAND_WINDOW_MS = 3 * 60 * 1000;
const MOVEMENT_COMMANDS = new Set(['move_party', 'turn_party']);

/** Which commands share a heading: party movement together, each battle round alone, and otherwise one command type. */
function commandGroup(entry: GameEntry): string {
  if (entry.command_type === 'resolve_battle_round') return 'round';
  if (entry.command_type !== null && MOVEMENT_COMMANDS.has(entry.command_type)) return 'movement';
  return entry.command_type ?? 'referee';
}
const SESSION_CODES = new Set(['game_started', 'save_restored', 'game_ended']);

/**
 * Whether the reader should see an entry. The server sends a referee everything. With the lens off, a referee
 * sees what a player sees, except for their own secret rolls.
 */
export function isEntryVisible(entry: FeedEntry, selfId: string | null, lens: boolean): boolean {
  if (lens) return true;
  if (entry.kind === 'roll' && (entry.secret || entry.visibility === 'referees'))
    return entry.user_id === selfId;
  if (entry.kind === 'game') {
    if (entry.visibility === 'referees') return false;
    // The text layer gives a talk and a wait a line of their own when their events are hidden or there are none,
    // so the reader still sees who spoke and that the party waited.
    if (entry.command_type === 'parley' && entry.actor_id) return true;
    if (entry.command_type === 'wait') return true;
    return visibleEvents(entry, false).length > 0;
  }
  return entry.visibility !== 'referees' || entry.user_id === selfId;
}

/** Whether an entry has anything players can't see: a secret roll, a referee command, or a referee-only event. */
export function hasHiddenContent(entry: FeedEntry): boolean {
  if (entry.visibility === 'referees') return true;
  if (entry.kind === 'roll') return entry.secret;
  if (entry.kind === 'game') {
    return entry.events.some((event) => (event as { visibility?: string }).visibility === 'referee');
  }
  return false;
}

function matchesFilter(entry: FeedEntry, filter: FeedFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'chat':
      return entry.kind === 'chat';
    case 'rolls':
      return entry.kind === 'roll';
    case 'game':
      return entry.kind === 'game' || entry.kind === 'system';
    case 'hidden':
      return hasHiddenContent(entry);
  }
}

/** Normalizes text for search: lower case, without accents. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** A formatter for the day of a date, made once per time zone: building one for every entry is slow. */
function dayFormat(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let format = dayFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormats.set(key, format);
  }
  return format;
}

const dayKeys = new Map<string, string>();

function dayKey(date: Date, timeZone: string | undefined): string {
  // Entries keep their timestamps, so each one's day is formatted once.
  const cacheKey = `${timeZone ?? ''}|${date.getTime()}`;
  let key = dayKeys.get(cacheKey);
  if (key === undefined) {
    key = dayFormat(timeZone).format(date);
    if (dayKeys.size > 20_000) dayKeys.clear();
    dayKeys.set(cacheKey, key);
  }
  return key;
}

/**
 * A label for the day of an entry: "Today", "Yesterday", or "Saturday, November 21" (with the year when it isn't
 * this year).
 */
export function dayLabel(date: Date, now: Date, timeZone?: string): string {
  const key = dayKey(date, timeZone);
  if (key === dayKey(now, timeZone)) return 'Today';
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (key === dayKey(yesterday, timeZone)) return 'Yesterday';
  const sameYear =
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(date) ===
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(now);
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

function visibilityKey(entry: FeedEntry): string {
  if (entry.visibility === 'users') return `users:${[...entry.to, entry.user_id ?? ''].sort().join(',')}`;
  if (entry.kind === 'roll' && entry.secret) return 'secret';
  return entry.visibility;
}

function time(entry: FeedEntry): number {
  const parsed = Date.parse(entry.created_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Builds the rows of the feed list.
 *
 * @param entries - The feed entries, oldest first.
 * @param options - The reader, the filter and search, the unread marker, and the clock.
 */
export function buildRows(entries: readonly FeedEntry[], options: RowOptions): FeedRow[] {
  const query = foldText(options.query.trim());
  const rows: FeedRow[] = [];
  let lastDay: string | null = null;
  let lastSession: string | null = null;
  let unreadPlaced = options.unreadAfter === null;

  for (const entry of entries) {
    if (!isEntryVisible(entry, options.selfId, options.lens)) continue;
    if (!matchesFilter(entry, options.filter)) continue;
    if (query !== '' && !foldText(options.textOf(entry)).includes(query)) continue;

    const created = new Date(time(entry));
    const day = dayKey(created, options.timeZone);
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `d${day}`, label: dayLabel(created, options.now, options.timeZone) });
      lastDay = day;
    }

    if (
      !unreadPlaced &&
      options.unreadAfter !== null &&
      entry.seq > options.unreadAfter &&
      entry.user_id !== options.selfId
    ) {
      rows.push({ type: 'unread', key: 'unread' });
      unreadPlaced = true;
    }

    const previous = rows.at(-1);

    if (entry.kind === 'system') {
      if (SESSION_CODES.has(entry.code)) {
        const sessionId = typeof entry.params.session_id === 'string' ? entry.params.session_id : null;
        rows.push({ type: 'session', key: `n${entry.seq}`, entry, sessionId });
        if (sessionId !== null) lastSession = sessionId;
      } else {
        rows.push({ type: 'system', key: `s${entry.seq}`, entry });
      }
      continue;
    }

    if (entry.kind === 'game') {
      if (lastSession !== null && entry.session_id !== lastSession && previous?.type !== 'session') {
        rows.push({ type: 'session', key: `c${entry.seq}`, entry: null, sessionId: entry.session_id });
      }
      lastSession = entry.session_id;
      const movement =
        query === '' && options.filter !== 'hidden' ? movementSteps(entry, options.lens) : null;
      const group = commandGroup(entry);
      const before = rows.at(-1);
      const last = before?.type === 'command' ? before.entries.at(-1) : undefined;
      // One sender's commands of one kind, close together, share one heading. Each battle round has its own.
      const joins =
        before?.type === 'command' &&
        last !== undefined &&
        group !== 'round' &&
        before.group === group &&
        before.userId === entry.user_id &&
        last.session_id === entry.session_id &&
        time(entry) - time(last) < COMMAND_WINDOW_MS;
      const row: Extract<FeedRow, { type: 'command' }> = joins
        ? before
        : { type: 'command', key: `g${entry.seq}`, userId: entry.user_id, group, entries: [], parts: [] };
      if (!joins) rows.push(row);
      row.entries.push(entry);
      const tail = row.parts.at(-1);
      if (movement !== null && tail?.kind === 'steps') {
        tail.entries.push(entry);
        tail.steps.push(...movement.steps);
        tail.checks += movement.checks;
      } else if (movement !== null) {
        row.parts.push({
          kind: 'steps',
          key: `v${entry.seq}`,
          entries: [entry],
          steps: [...movement.steps],
          checks: movement.checks,
        });
      } else {
        row.parts.push({ kind: 'entry', key: `e${entry.seq}`, entry });
      }
      continue;
    }

    // Chat and dice rolls group by author and audience while they come close together.
    if (
      previous?.type === 'messages' &&
      previous.userId === entry.user_id &&
      visibilityKey(previous.entries[0] ?? entry) === visibilityKey(entry)
    ) {
      const last = previous.entries.at(-1);
      if (last !== undefined && time(entry) - time(last) < GROUP_WINDOW_MS) {
        previous.entries.push(entry);
        continue;
      }
    }
    rows.push({ type: 'messages', key: `m${entry.seq}`, userId: entry.user_id, entries: [entry] });
  }
  return rows;
}

/** A guess at a row's height in pixels before the list measures it. */
export function estimateRowHeight(row: FeedRow): number {
  switch (row.type) {
    case 'day':
      return 40;
    case 'session':
      return 64;
    case 'unread':
      return 32;
    case 'system':
      return 30;
    case 'messages':
      return 34 + row.entries.reduce((sum, entry) => sum + (entry.kind === 'roll' ? 76 : 22), 0);
    case 'command':
      return (
        34 +
        row.parts.reduce(
          (sum, part) =>
            sum + (part.kind === 'steps' ? 26 : Math.max(1, Math.ceil(part.entry.events.length * 0.7)) * 24),
          0,
        )
      );
  }
}

/** The command's label for a game entry's heading, such as "Open a door". */
export function commandLabel(entry: GameEntry): string | null {
  if (entry.command_type === null) return null;
  if (entry.command_type === 'resolve_battle_round') return 'Battle round';
  if (MOVEMENT_COMMANDS.has(entry.command_type)) return commandInfo('move_party').label;
  return commandInfo(entry.command_type).label;
}

/** Whether a game entry came from a referee command. */
export function isRefereeCommand(entry: GameEntry): boolean {
  return entry.command_type === null || commandInfo(entry.command_type).kind === 'referee';
}

/** The `seq` of the newest entry in a row. */
export function lastSeqOf(row: FeedRow): number | null {
  switch (row.type) {
    case 'messages':
    case 'command':
      return row.entries.at(-1)?.seq ?? null;
    case 'system':
      return row.entry.seq;
    case 'session':
      return row.entry?.seq ?? null;
    default:
      return null;
  }
}

function sameEntries(a: readonly FeedEntry[], b: readonly FeedEntry[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function sameRow(a: FeedRow, b: FeedRow): boolean {
  if (a.type !== b.type || a.key !== b.key) return false;
  switch (a.type) {
    case 'day':
      return b.type === 'day' && a.label === b.label;
    case 'unread':
      return true;
    case 'session':
      return b.type === 'session' && a.entry === b.entry && a.sessionId === b.sessionId;
    case 'system':
      return b.type === 'system' && a.entry === b.entry;
    case 'messages':
      return b.type === 'messages' && a.userId === b.userId && sameEntries(a.entries, b.entries);
    case 'command':
      return (
        b.type === 'command' &&
        a.userId === b.userId &&
        a.parts.length === b.parts.length &&
        sameEntries(a.entries, b.entries)
      );
  }
}

/**
 * Keeps the row objects that didn't change since the last build, so the list's memoized rows skip rendering when
 * one entry arrives at the bottom of a long feed.
 *
 * @param previous - The rows of the last build.
 * @param next - The rows just built.
 */
export function reuseRows(previous: readonly FeedRow[], next: FeedRow[]): FeedRow[] {
  if (previous.length === 0) return next;
  const byKey = new Map(previous.map((row) => [row.key, row]));
  return next.map((row) => {
    const old = byKey.get(row.key);
    return old !== undefined && sameRow(old, row) ? old : row;
  });
}

/** Remembers the last rows, so each build keeps the row objects that didn't change. */
export class RowCache {
  private last: FeedRow[] = [];

  reuse(next: FeedRow[]): FeedRow[] {
    this.last = reuseRows(this.last, next);
    return this.last;
  }
}
