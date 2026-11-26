import { z } from 'zod';
import type { CommandOutcome, EventPage, PlayerView, RefereeView, Rejection } from '../bxapi';
import { MemberId, TableId, UserId, displayString } from './common';
import { Scene } from './scene';

export type { EventPage, PlayerView, RefereeView, Rejection };

/** One game event as bxapi serializes it. Each event has `event_type`, `code`, and `visibility`. */
export type GameEvent = CommandOutcome['events'][number];

/**
 * How the server decides who may send a command:
 *
 * - `member`: the command names an acting party member (`member_field`). The user in that member's seat, or a
 *   referee, may send it.
 * - `party`: the command moves or speaks for the whole party. A referee or the caller may send it, or any
 *   member with a seat when `party_control` is `anyone`.
 * - `referee`: a referee command. Only a referee may send it.
 * - `battle`: `resolve_battle_round`. Nobody sends it directly. Use the declarations routes.
 */
export const CommandClass = z.enum(['member', 'party', 'referee', 'battle']);
/** How the server decides who may send a command. */
export type CommandClass = z.infer<typeof CommandClass>;

/** A command that is legal in the session's current mode and that the user's role may send. */
export const LegalCommand = z.object({
  command_type: z.string(),
  /** bxapi's command kind: `play` or `referee`. */
  kind: z.enum(['play', 'referee']),
  class: CommandClass,
  /** For a `member` command, the field that names the acting member, such as `character_id`. Otherwise `null`. */
  member_field: z.string().nullable(),
});
/** A command that is legal in the current mode. */
export type LegalCommand = z.infer<typeof LegalCommand>;

/** The link between a party member in the session and the user who controls it. `user_id: null` is an empty seat, which referees control. */
export const Seat = z.object({
  member_id: MemberId,
  name: z.string(),
  user_id: UserId.nullable(),
});
/** A seat. */
export type Seat = z.infer<typeof Seat>;

/** The fields of bxapi's referee view that the server leaves out of {@link RefereeState}. */
export const REFEREE_VIEW_OMITTED_FIELDS = [
  'adventure',
  'command_log',
  'event_log',
  'listener_state',
  'allocator',
] as const;

/**
 * The dynamic part of bxapi's referee view: everything except the adventure document and the logs. A referee
 * reads the adventure from `GET /api/tables/{table_id}/game/adventure`, and events from
 * `GET /api/tables/{table_id}/game/events`.
 */
export type RefereeState = Omit<RefereeView, (typeof REFEREE_VIEW_OMITTED_FIELDS)[number]>;

/**
 * The state of a table's game for one user. The `game` WebSocket message carries the same object, so a client
 * replaces its copy with each one. Every copy has the player `view`, which states what the party perceives, and
 * the `scene`, which adds item names, known room traps, and emptied caches. A player's copy has `referee: null`.
 * A referee's copy has the dynamic referee state in `referee`, built at the same `revision`.
 */
export const GameState = z.object({
  table_id: TableId,
  session_id: z.string(),
  adventure_id: z.string().nullable(),
  adventure_name: z.string(),
  mode: z.string(),
  ended: z.boolean(),
  revision: z.number().int(),
  /** bxapi's player view at `revision`. */
  view: z.custom<PlayerView>(),
  /** What the server adds to the player view at `revision`. See {@link Scene}. */
  scene: Scene,
  /** The commands that are legal now and that this user's role may send. */
  commands: z.array(LegalCommand),
  seats: z.array(Seat),
  caller_user_id: UserId.nullable(),
  referee: z.custom<RefereeState>().nullable(),
});
/** The state of a table's game for one user. */
export type GameState = z.infer<typeof GameState>;

/**
 * Body of `POST /api/tables/{table_id}/game`: start a game from the roster. Referee only. `adventure_id` is an
 * `id` from the table's adventure list. `ruleset` holds osrlib's optional rule switches. `seed` makes the
 * session's dice repeatable.
 */
export const StartGameRequest = z.strictObject({
  adventure_id: z.string().min(1).max(200),
  name: displayString(200).optional(),
  ruleset: z.record(z.string(), z.unknown()).optional(),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
/** Body of `POST /api/tables/{table_id}/game`. */
export type StartGameRequest = z.infer<typeof StartGameRequest>;

/** A bxapi command: `command_type` and the command's own fields, which bxapi checks against its schema. */
export const Command = z.looseObject({
  command_type: z.string().min(1).max(100),
});
/** A bxapi command. */
export type Command = z.infer<typeof Command>;

/**
 * Body of `POST /api/tables/{table_id}/game/commands`. Pass the `revision` of the state the user acted on as
 * `expected_revision`. When the game has moved on, the server sends nothing to bxapi and answers 409
 * `revision_conflict`.
 */
export const CommandRequest = z.strictObject({
  command: Command,
  expected_revision: z.number().int().min(0).optional(),
});
/** Body of `POST /api/tables/{table_id}/game/commands`. */
export type CommandRequest = z.infer<typeof CommandRequest>;

/**
 * Response of `POST /api/tables/{table_id}/game/commands`. A refused command has `accepted: false` and bxapi's
 * `rejections`, and only the sender receives it. `events` and `messages` are projected for the sender's role.
 * `game` is the sender's game state after the command.
 */
export const CommandResult = z.object({
  accepted: z.boolean(),
  rejections: z.array(z.custom<Rejection>()),
  events: z.array(z.custom<GameEvent>()),
  messages: z.array(z.string()),
  mode: z.string(),
  ended: z.boolean(),
  revision: z.number().int(),
  game: GameState,
});
/** Response of `POST /api/tables/{table_id}/game/commands`. */
export type CommandResult = z.infer<typeof CommandResult>;

/** Query of `GET /api/tables/{table_id}/game/events`. A player may only read `player` events. */
export const EventsQuery = z.strictObject({
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  visibility: z.enum(['player', 'referee']).optional(),
});
/** Query of `GET /api/tables/{table_id}/game/events`. */
export type EventsQuery = z.infer<typeof EventsQuery>;

/** Body of `PUT /api/tables/{table_id}/game/seats/{member_id}`: give a seat to a member, or empty it with `null`. Referee only. */
export const UpdateSeatRequest = z.strictObject({
  user_id: UserId.nullable(),
});
/** Body of `PUT /api/tables/{table_id}/game/seats/{member_id}`. */
export type UpdateSeatRequest = z.infer<typeof UpdateSeatRequest>;

/** Response of `PUT /api/tables/{table_id}/game/seats/{member_id}`: every seat after the change. */
export const SeatList = z.object({ items: z.array(Seat) });
/** Response of `PUT /api/tables/{table_id}/game/seats/{member_id}`. */
export type SeatList = z.infer<typeof SeatList>;
