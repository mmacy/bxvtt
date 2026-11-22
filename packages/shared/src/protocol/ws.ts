import { z } from 'zod';
import { Role, TableId, Timestamp, UserId } from './common';
import { LevelAnnotations, MapPing } from './annotations';
import { DeclarationsState } from './battle';
import { FeedEntry, FeedPage } from './feed';
import { GameState } from './game';
import { Notes } from './notes';
import { TableDetail } from './tables';
import { User } from './users';

/** The path of the WebSocket endpoint. */
export const WS_PATH = '/ws';

/**
 * Close codes the server uses. A client stops reconnecting after `auth_failed` and `removed`, and reconnects
 * after any other code: at once after `resync`, and with backoff otherwise.
 */
export const WS_CLOSE_CODES = {
  /** The server is shutting down. Reconnect with backoff. */
  server_shutdown: 1001,
  /** A message was larger than the limit. */
  message_too_large: 1009,
  /** The first message wasn't a valid `auth` message, or the token or table is wrong. */
  auth_failed: 4001,
  /** The user isn't a member of the table anymore: they left, a referee removed them, or the table was deleted. */
  removed: 4003,
  /** The client sent too many messages. Reconnect after a pause. */
  rate_limited: 4008,
  /** The user's role changed. Reconnect at once to get a snapshot for the new role. */
  resync: 4010,
  /** The server can't build a snapshot now, usually because bxapi is down. Reconnect with backoff. */
  try_again_later: 1013,
} as const;

/**
 * The first message a client sends after the socket opens. The token goes in this message, never in the URL, so
 * no log or `Referer` header records it. `feed_after` is the `seq` of the last feed entry the client has, so
 * the snapshot catches up from there.
 */
export const AuthMessage = z.strictObject({
  type: z.literal('auth'),
  token: z.string().min(1).max(200),
  table_id: TableId,
  feed_after: z.number().int().min(0).optional(),
});

/** A keepalive. The server answers with its own `heartbeat`. Send one every 20 seconds. */
export const ClientHeartbeatMessage = z.strictObject({
  type: z.literal('heartbeat'),
});

/** A map ping, which the server sends on to every member of the table. */
export const ClientPingMessage = MapPing.extend({
  type: z.literal('ping'),
}).strict();

/** Ask for a new snapshot, for example after the client finds its state inconsistent. */
export const ResyncMessage = z.strictObject({
  type: z.literal('resync'),
  feed_after: z.number().int().min(0).optional(),
});

/** Every message a client may send. */
export const ClientMessage = z.discriminatedUnion('type', [
  AuthMessage,
  ClientHeartbeatMessage,
  ClientPingMessage,
  ResyncMessage,
]);
/** Every message a client may send. */
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Who is connected to the table now. */
export const Presence = z.object({
  online: z.array(UserId),
});
/** Who is connected to the table now. */
export type Presence = z.infer<typeof Presence>;

/**
 * The full table state for the user's role, sent after `auth` and after `resync`. `feed` holds the entries after
 * `feed_after`, or the newest entries when the client had none. `annotations` holds the party's current level.
 * `notes.referee` is `null` for a player.
 */
export const SnapshotMessage = z.object({
  type: z.literal('snapshot'),
  user: User,
  role: Role,
  table: TableDetail,
  presence: Presence,
  game: GameState.nullable(),
  declarations: DeclarationsState.nullable(),
  feed: FeedPage,
  annotations: LevelAnnotations.nullable(),
  notes: z.object({ party: Notes, referee: Notes.nullable() }),
  server_time: Timestamp,
});

/** Who is connected changed. */
export const PresenceMessage = z.object({ type: z.literal('presence'), presence: Presence });

/** The table's members, settings, roster, or game summary changed. */
export const TableMessage = z.object({ type: z.literal('table'), table: TableDetail });

/**
 * The game changed: a command was accepted, a seat moved, a game started or ended, or a save was restored.
 * `game` is `null` when the table went back to its lobby.
 */
export const GameMessage = z.object({ type: z.literal('game'), game: GameState.nullable() });

/** A new feed entry that the user may read. */
export const FeedMessage = z.object({ type: z.literal('feed'), entry: FeedEntry });

/** The battle declarations changed. `declarations` is `null` outside a battle. */
export const DeclarationsMessage = z.object({
  type: z.literal('declarations'),
  declarations: DeclarationsState.nullable(),
});

/** The annotations on one level changed. The message holds every annotation on the level that the user may see. */
export const AnnotationsMessage = z.object({ type: z.literal('annotations'), annotations: LevelAnnotations });

/** A member pinged the map. Show it for a few seconds. */
export const ServerPingMessage = MapPing.extend({
  type: z.literal('ping'),
  user_id: UserId,
  at: Timestamp,
});

/** A notes document changed. */
export const NotesMessage = z.object({ type: z.literal('notes'), notes: Notes });

/**
 * Something happened that the user should hear about beyond the state change itself:
 *
 * - `table_changed`: the user's command lost a race, and the state they acted on is out of date.
 * - `game_restored`: a referee restored a save, so the table plays a new session.
 * - `game_started` and `game_ended`: the table left or returned to its lobby.
 */
export const NoticeMessage = z.object({
  type: z.literal('notice'),
  code: z.enum(['table_changed', 'game_restored', 'game_started', 'game_ended']),
  detail: z.string(),
});

/** The answer to a client `heartbeat`. */
export const ServerHeartbeatMessage = z.object({ type: z.literal('heartbeat'), server_time: Timestamp });

/** The server couldn't use a client message. The connection stays open unless a close follows. */
export const ErrorMessage = z.object({ type: z.literal('error'), code: z.string(), detail: z.string() });

/** The user isn't a member of the table anymore. The server closes the socket with `removed` next. */
export const RemovedMessage = z.object({
  type: z.literal('removed'),
  reason: z.enum(['left', 'kicked', 'table_deleted']),
});

/** Every message the server sends. */
export const ServerMessage = z.discriminatedUnion('type', [
  SnapshotMessage,
  PresenceMessage,
  TableMessage,
  GameMessage,
  FeedMessage,
  DeclarationsMessage,
  AnnotationsMessage,
  ServerPingMessage,
  NotesMessage,
  NoticeMessage,
  ServerHeartbeatMessage,
  ErrorMessage,
  RemovedMessage,
]);
/** Every message the server sends. */
export type ServerMessage = z.infer<typeof ServerMessage>;
/** A server message of one type. */
export type ServerMessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;
