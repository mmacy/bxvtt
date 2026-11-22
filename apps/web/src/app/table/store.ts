/**
 * The state of one open table, fed by the table's WebSocket and by HTTP responses.
 *
 * Each server message replaces one part of the state wholesale, as the protocol intends: a `table` message
 * replaces the table, a `game` message replaces the game, and so on. Feed entries arrive one at a time and
 * merge by `seq`. {@link reduceServerMessage} is the pure reducer, and {@link createTableStore} wraps it in a
 * zustand store with the actions that HTTP responses use.
 */
import type { CloseReason, ConnectionStatus } from '@bxvtt/shared/client';
import type {
  DeclarationsState,
  FeedEntry,
  FeedPage,
  GameState,
  LevelAnnotations,
  LevelRef,
  MapPing,
  Notes,
  Role,
  ServerMessage,
  ServerMessageOf,
  TableDetail,
  User,
} from '@bxvtt/shared/protocol';
import {
  contextFromPlayerView,
  emptyContext,
  extendContextWithCatalog,
  extendContextWithNames,
  type TextContext,
} from '@bxvtt/shared/text';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Why the server removed this user from the table. */
export type RemovedReason = ServerMessageOf<'removed'>['reason'];

/** A notice the user should hear about, such as a restored save. */
export interface TableNotice {
  id: number;
  code: ServerMessageOf<'notice'>['code'];
  detail: string;
  /** When the client received it, in milliseconds since the epoch. */
  receivedAt: number;
}

/** A map ping from a member, shown for a few seconds. */
export interface TablePing extends MapPing {
  id: string;
  user_id: string;
  at: string;
}

/** The connection's state, plus `idle` before it starts. */
export type TableConnectionStatus = ConnectionStatus;

/** What the store sends to the server outside HTTP. The session supplies it; a test supplies a fake. */
export interface TableTransport {
  sendPing: (ping: MapPing) => void;
  resync: () => void;
}

export interface TableData {
  tableId: string;
  status: TableConnectionStatus;
  /** Why the connection stopped for good, when it did. */
  closeReason: CloseReason | null;
  /** Set when the server removed this user from the table. */
  removed: RemovedReason | null;
  /** Whether the first snapshot has arrived. */
  ready: boolean;
  user: User | null;
  /** The user's role at the table, from the snapshot and then from each `table` message. */
  role: Role | null;
  table: TableDetail | null;
  /** The IDs of the connected users. */
  online: readonly string[];
  /** The game for this user's role, or `null` in the lobby. */
  game: GameState | null;
  declarations: DeclarationsState | null;
  /** The feed entries this client has, oldest first. */
  feed: readonly FeedEntry[];
  /** Whether older feed entries exist on the server than the first one here. */
  feedHasOlder: boolean;
  /** Annotations by level key (`dungeon_id:level_number`). */
  annotations: Readonly<Record<string, LevelAnnotations>>;
  notes: { party: Notes | null; referee: Notes | null };
  pings: readonly TablePing[];
  notices: readonly TableNotice[];
  /**
   * The text context built from every game state so far, carried forward so names survive a command that
   * removes them from the view. It holds player-visible names only. `useTextContext` adds referee data and
   * catalog names.
   */
  baseTextContext: TextContext;
  /** The `command_type` of the command this client is sending, or `null`. One command is in flight at a time. */
  pendingCommand: string | null;
  /** Whether this client is saving or resolving a battle declaration. */
  pendingDeclaration: boolean;
  /** Server time minus local time, in milliseconds, from the last snapshot or heartbeat. */
  serverTimeOffsetMs: number;
  /**
   * The last `error` message from the server, such as `rate_limited` when this user has the table open in too
   * many tabs. The next snapshot clears it.
   */
  connectionError: { code: string; detail: string } | null;
}

export interface TableActions {
  /** Applies one WebSocket message. */
  receive: (message: ServerMessage) => void;
  /** Applies a game state from an HTTP response, unless the store already has a newer revision. */
  receiveGame: (game: GameState | null) => void;
  receiveTable: (table: TableDetail) => void;
  receiveDeclarations: (declarations: DeclarationsState | null) => void;
  receiveNotes: (notes: Notes) => void;
  receiveAnnotations: (annotations: LevelAnnotations) => void;
  /** Merges a page of feed entries, from catching up or scrolling back. */
  receiveFeedPage: (page: FeedPage, direction: 'older' | 'newer') => void;
  setStatus: (status: TableConnectionStatus, reason?: CloseReason) => void;
  dismissNotice: (id: number) => void;
  removePing: (id: string) => void;
  /** Sends a map ping. */
  sendPing: (ping: MapPing) => void;
  /** Asks the server for a new snapshot. */
  resync: () => void;
}

export type TableState = TableData & TableActions;
export type TableStore = StoreApi<TableState>;

/** The key of a level in {@link TableData.annotations}. */
export function levelKey(level: LevelRef): string {
  return `${level.dungeon_id}:${level.level_number}`;
}

/** The state of a table before its first snapshot. */
export function initialTableData(tableId: string): TableData {
  return {
    tableId,
    status: 'idle',
    closeReason: null,
    removed: null,
    ready: false,
    user: null,
    role: null,
    table: null,
    online: [],
    game: null,
    declarations: null,
    feed: [],
    feedHasOlder: false,
    annotations: {},
    notes: { party: null, referee: null },
    pings: [],
    notices: [],
    baseTextContext: emptyContext(),
    pendingCommand: null,
    pendingDeclaration: false,
    serverTimeOffsetMs: 0,
    connectionError: null,
  };
}

/**
 * Picks the game state to keep: the incoming one, unless it is an older revision of the same session. A seat
 * or caller change arrives at the same revision, so an equal revision replaces the game.
 */
export function newerGame(current: GameState | null, incoming: GameState | null): GameState | null {
  if (incoming === null || current === null) return incoming;
  if (incoming.session_id !== current.session_id) return incoming;
  return incoming.revision >= current.revision ? incoming : current;
}

/**
 * Builds the player-visible text context for a game state: names from the player view, the area names of the
 * scene, and the scene's item names, on top of the previous context. Every name goes through the text layer's own
 * functions, which keep its curated nouns: the scene names `Torches (6)` for a torch, and the context still says
 * "a torch".
 */
export function buildBaseTextContext(previous: TextContext, game: GameState | null): TextContext {
  if (game === null) return previous;
  let ctx = contextFromPlayerView(game.view, previous);
  const areas: { id: string; name: string }[] = [];
  for (const level of game.scene.levels) {
    for (const area of level.areas) {
      areas.push({ id: area.id, name: area.name });
      areas.push({ id: `${level.dungeon_id}:${level.level_number}:${area.id}`, name: area.name });
    }
  }
  if (areas.length > 0) ctx = extendContextWithCatalog(ctx, { areas });
  if (Object.keys(game.scene.names).length > 0) ctx = extendContextWithNames(ctx, game.scene.names);
  return ctx;
}

function exploredKeys(game: GameState | null): Set<string> {
  return new Set((game?.view.explored ?? []).map((level) => levelKey(level)));
}

/**
 * Drops the cached annotations of each level the party has just mapped. A player receives an empty list for a
 * level outside `view.explored`, so a level cached before the party reached it loads again.
 */
export function pruneAnnotations(
  annotations: Readonly<Record<string, LevelAnnotations>>,
  previous: GameState | null,
  next: GameState | null,
): Readonly<Record<string, LevelAnnotations>> {
  const before = exploredKeys(previous);
  const stale = [...exploredKeys(next)].filter((key) => !before.has(key) && key in annotations);
  if (stale.length === 0) return annotations;
  const copy = { ...annotations };
  for (const key of stale) delete copy[key];
  return copy;
}

/** Merges feed entries by `seq`, dropping repeats, oldest first. */
export function mergeFeed(current: readonly FeedEntry[], incoming: readonly FeedEntry[]): FeedEntry[] {
  if (incoming.length === 0) return current as FeedEntry[];
  const bySeq = new Map<number, FeedEntry>();
  for (const entry of current) bySeq.set(entry.seq, entry);
  for (const entry of incoming) bySeq.set(entry.seq, entry);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

function roleFromTable(table: TableDetail, userId: string | undefined, fallback: Role | null): Role | null {
  if (userId === undefined) return fallback;
  return table.members.find((member) => member.user_id === userId)?.role ?? fallback;
}

let noticeCounter = 0;

/**
 * Computes the change one server message makes to the table state. It never mutates `state`.
 *
 * @param state - The current state.
 * @param message - A message from the table's WebSocket.
 * @param now - The local time in milliseconds, for notices and the server clock offset.
 * @returns The fields to replace.
 */
export function reduceServerMessage(
  state: TableData,
  message: ServerMessage,
  now: number = Date.now(),
): Partial<TableData> {
  switch (message.type) {
    case 'snapshot': {
      // A first snapshot holds the newest page, and `has_more` means older entries exist. A snapshot after a
      // reconnect holds the entries after the last one this client had, and the session pages the rest.
      const catchingUp = state.feed.length > 0;
      const game = message.game;
      const annotations: Record<string, LevelAnnotations> = {};
      if (message.annotations !== null) annotations[levelKey(message.annotations)] = message.annotations;
      return {
        ready: true,
        user: message.user,
        role: message.role,
        table: message.table,
        online: message.presence.online,
        game,
        declarations: message.declarations,
        feed: catchingUp ? mergeFeed(state.feed, message.feed.entries) : [...message.feed.entries],
        feedHasOlder: catchingUp ? state.feedHasOlder : message.feed.has_more,
        annotations,
        notes: { party: message.notes.party, referee: message.notes.referee },
        baseTextContext: buildBaseTextContext(state.baseTextContext, game),
        serverTimeOffsetMs: serverOffset(message.server_time, now),
        removed: null,
        closeReason: null,
        connectionError: null,
      };
    }
    case 'presence':
      return { online: message.presence.online };
    case 'table':
      return { table: message.table, role: roleFromTable(message.table, state.user?.id, state.role) };
    case 'game': {
      const game = newerGame(state.game, message.game);
      if (game === state.game) return {};
      return {
        game,
        baseTextContext: buildBaseTextContext(state.baseTextContext, game),
        annotations: pruneAnnotations(state.annotations, state.game, game),
      };
    }
    case 'feed': {
      const last = state.feed.at(-1);
      if (last !== undefined && message.entry.seq <= last.seq) {
        return { feed: mergeFeed(state.feed, [message.entry]) };
      }
      return { feed: [...state.feed, message.entry] };
    }
    case 'declarations':
      return { declarations: message.declarations };
    case 'annotations':
      return {
        annotations: { ...state.annotations, [levelKey(message.annotations)]: message.annotations },
      };
    case 'ping': {
      const { type: _type, ...ping } = message;
      const id = `${ping.user_id}-${ping.at}-${ping.x}-${ping.y}`;
      if (state.pings.some((existing) => existing.id === id)) return {};
      return { pings: [...state.pings, { ...ping, id }] };
    }
    case 'notes':
      return { notes: { ...state.notes, [message.notes.kind]: message.notes } };
    case 'notice': {
      noticeCounter += 1;
      const notice: TableNotice = {
        id: noticeCounter,
        code: message.code,
        detail: message.detail,
        receivedAt: now,
      };
      return { notices: [...state.notices.slice(-19), notice] };
    }
    case 'heartbeat':
      return { serverTimeOffsetMs: serverOffset(message.server_time, now) };
    case 'removed':
      return { removed: message.reason };
    case 'error':
      return { connectionError: { code: message.code, detail: message.detail } };
  }
}

function serverOffset(serverTime: string, now: number): number {
  const parsed = Date.parse(serverTime);
  return Number.isNaN(parsed) ? 0 : parsed - now;
}

/**
 * Creates the store for one table.
 *
 * @param tableId - The table ID.
 * @param options - `initial` overrides the starting data (tests pass a snapshot), and `transport` sends pings and
 *   resync requests.
 */
export function createTableStore(
  tableId: string,
  options: { initial?: Partial<TableData>; transport?: TableTransport } = {},
): TableStore {
  const transport: TableTransport = options.transport ?? { sendPing: () => {}, resync: () => {} };
  return createStore<TableState>()((set, get) => ({
    ...initialTableData(tableId),
    ...options.initial,

    receive: (message) => set(reduceServerMessage(get(), message)),

    receiveGame: (incoming) => {
      const state = get();
      const game = newerGame(state.game, incoming);
      if (game === state.game) return;
      set({
        game,
        baseTextContext: buildBaseTextContext(state.baseTextContext, game),
        annotations: pruneAnnotations(state.annotations, state.game, game),
      });
    },

    receiveTable: (table) =>
      set((state) => ({ table, role: roleFromTable(table, state.user?.id, state.role) })),

    receiveDeclarations: (declarations) => set({ declarations }),

    receiveNotes: (notes) => set((state) => ({ notes: { ...state.notes, [notes.kind]: notes } })),

    receiveAnnotations: (annotations) =>
      set((state) => ({
        annotations: { ...state.annotations, [levelKey(annotations)]: annotations },
      })),

    receiveFeedPage: (page, direction) =>
      set((state) => ({
        feed: mergeFeed(state.feed, page.entries),
        ...(direction === 'older' ? { feedHasOlder: page.has_more } : {}),
      })),

    setStatus: (status, reason) =>
      set(status === 'closed' ? { status, closeReason: reason ?? null } : { status }),

    dismissNotice: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),

    removePing: (id) => set((state) => ({ pings: state.pings.filter((p) => p.id !== id) })),

    sendPing: (ping) => transport.sendPing(ping),

    resync: () => transport.resync(),
  }));
}

/**
 * Builds the starting data of a store from a snapshot message, as the store would after receiving it.
 *
 * @param snapshot - A `snapshot` message, such as a test fixture.
 */
export function dataFromSnapshot(snapshot: ServerMessageOf<'snapshot'>): TableData {
  const base = initialTableData(snapshot.table.id);
  return { ...base, ...reduceServerMessage(base, snapshot), status: 'open' };
}
