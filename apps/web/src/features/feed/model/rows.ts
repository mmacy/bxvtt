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

/** One row of the feed list. */
export type FeedRow =
  | { type: 'day'; key: string; label: string }
  | { type: 'session'; key: string; entry: SystemEntry | null; sessionId: string | null }
  | { type: 'unread'; key: string }
  | { type: 'messages'; key: string; userId: string | null; entries: MessageEntry[] }
  | { type: 'game'; key: string; entry: GameEntry; compact: boolean }
  | {
      type: 'moves';
      key: string;
      userId: string | null;
      entries: GameEntry[];
      steps: PartyStep[];
      checks: number;
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
const COMPACT_WINDOW_MS = 3 * 60 * 1000;
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
    return visibleEvents(entry, false).events.length > 0;
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

function dayKey(date: Date, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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
      const before = rows.at(-1);
      if (movement !== null) {
        if (
          before?.type === 'moves' &&
          before.userId === entry.user_id &&
          before.entries[0]?.session_id === entry.session_id
        ) {
          before.entries.push(entry);
          before.steps.push(...movement.steps);
          before.checks += movement.checks;
        } else {
          rows.push({
            type: 'moves',
            key: `v${entry.seq}`,
            userId: entry.user_id,
            entries: [entry],
            steps: [...movement.steps],
            checks: movement.checks,
          });
        }
        continue;
      }
      const compact =
        (before?.type === 'game' || before?.type === 'moves') &&
        (before.type === 'game' ? before.entry.user_id : before.userId) === entry.user_id &&
        time(entry) - time(before.type === 'game' ? before.entry : (before.entries.at(-1) ?? entry)) <
          COMPACT_WINDOW_MS;
      rows.push({ type: 'game', key: `g${entry.seq}`, entry, compact });
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
    case 'moves':
      return 36;
    case 'messages':
      return 34 + row.entries.reduce((sum, entry) => sum + (entry.kind === 'roll' ? 76 : 22), 0);
    case 'game':
      return (row.compact ? 12 : 34) + Math.max(1, Math.ceil(row.entry.events.length * 0.7)) * 24;
  }
}

/** The command's label for a game entry's heading, such as "Open a door". */
export function commandLabel(entry: GameEntry): string | null {
  if (entry.command_type === null) return null;
  if (entry.command_type === 'resolve_battle_round') return 'Battle round';
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
    case 'moves':
      return row.entries.at(-1)?.seq ?? null;
    case 'game':
    case 'system':
      return row.entry.seq;
    case 'session':
      return row.entry?.seq ?? null;
    default:
      return null;
  }
}
