import { z } from 'zod';
import { CharacterId, LIMITS, Role, TableId, Timestamp, UserColor, UserId, displayString } from './common';
import type { Ruleset } from './rulesets';
import { AbilityScoreRerolls, CreationRules, RulesetPatch } from './rulesets';

/**
 * Who may send party commands such as `move_party`. With `caller`, a referee or the caller. With `anyone`, a
 * referee or any member who has a seat.
 */
export const PartyControl = z.enum(['caller', 'anyone']);
/** Who may send party commands. */
export type PartyControl = z.infer<typeof PartyControl>;

/** A table's settings. Only a referee can change them. */
export const TableSettings = z.object({
  /** Who may send party commands. */
  party_control: PartyControl,
  /** The member who speaks for the party, or `null` for none. Defaults to the owner of the first seat. */
  caller_user_id: UserId.nullable(),
  /** Whether the server resolves a battle round as soon as every declarer has declared. */
  auto_resolve: z.boolean(),
  /** Whether the server saves the game by itself at meaningful moments. */
  autosave: z.boolean(),
  /**
   * The table's osrlib `Ruleset`, with every field. The server rolls ability scores, creates characters, and starts
   * games with it. A new table, and a table from before the ruleset setting, starts with the `standard` starting
   * ruleset from `GET /api/rulesets`.
   */
  ruleset: z.custom<Ruleset>(),
  /**
   * How many times a player may roll new ability scores at the table after the first roll, or `null` for no
   * limit. Defaults to 0.
   */
  ability_score_rerolls: AbilityScoreRerolls,
  /**
   * Whether a player may discard a roll that bxapi reports as sub-par and roll again without using a reroll.
   * Defaults to `false`.
   */
  sub_par_restart: z.boolean(),
});
/** A table's settings. */
export type TableSettings = z.infer<typeof TableSettings>;

/** A member of a table: a user and their role. */
export const Member = z.object({
  user_id: UserId,
  name: z.string(),
  color: UserColor,
  role: Role,
  joined_at: Timestamp,
});
/** A member of a table. */
export type Member = z.infer<typeof Member>;

/** One character on the lobby roster, with the user who owns it. The roster order is the marching order. */
export const RosterEntry = z.object({
  id: z.string(),
  character_id: CharacterId,
  owner_user_id: UserId,
  name: z.string(),
  class_id: z.string(),
  level: z.number().int(),
  added_at: Timestamp,
  /**
   * The creation rules the character was built under, recorded from its ability roll. `null` for a character
   * created before the server recorded them. A client compares them with the table's settings to see whether the
   * character was built under other rules.
   */
  creation_rules: CreationRules.nullable(),
  /**
   * Whether the character's ability scores were rolled at another table. `false` when they were rolled at this
   * table, and also when the server doesn't know where: a character created before the server recorded it, or one
   * whose table has since been deleted.
   */
  rolled_at_other_table: z.boolean(),
});
/** One character on the lobby roster. */
export type RosterEntry = z.infer<typeof RosterEntry>;

/** Whether the table is in its lobby or playing a game. */
export const TablePhase = z.enum(['lobby', 'playing']);
/** Whether the table is in its lobby or playing a game. */
export type TablePhase = z.infer<typeof TablePhase>;

/**
 * The short facts about a table's current game, for a table list and a lobby header. The server sends a new
 * `table` message when `mode` or `ended` changes. For the revision, read the game state.
 */
export const GameSummary = z.object({
  session_id: z.string(),
  adventure_id: z.string().nullable(),
  adventure_name: z.string(),
  mode: z.string(),
  ended: z.boolean(),
  started_at: Timestamp,
  /**
   * `true` when the server found that bxapi no longer has the game, so the game can't be loaded until a referee
   * ends it or deletes the table (`game_missing`). It stays `false` while bxapi is only unreachable, which ends
   * by itself. Optional in the type so that older fixtures still compile. This server always sends it.
   */
  missing: z.boolean().optional(),
});
/** The short facts about a table's current game. */
export type GameSummary = z.infer<typeof GameSummary>;

/** A table in the list of the user's tables. */
export const TableSummary = z.object({
  id: TableId,
  name: z.string(),
  role: Role,
  phase: TablePhase,
  member_count: z.number().int(),
  /**
   * How many members have a WebSocket open to the table right now, the same users that the table's
   * `presence` message lists. Optional in the type so that older fixtures still compile. This server always
   * sends it.
   */
  online_count: z.number().int().optional(),
  game: GameSummary.nullable(),
  created_at: Timestamp,
});
/** A table in the list of the user's tables. */
export type TableSummary = z.infer<typeof TableSummary>;

/**
 * Everything about a table except the game state: members, settings, roster, and, for a referee, the invite code.
 * The `table` WebSocket message carries the same object, built for each recipient's role, so a client replaces its
 * copy with each one.
 */
export const TableDetail = z.object({
  id: TableId,
  name: z.string(),
  /**
   * The invite code, grouped as `XXXXX-XXXXX-XXXXX-XXXXX`. The server sends it only to a referee of the table and
   * omits it for a player. A member who becomes a referee receives it in the next `table` message, and a referee who
   * becomes a player stops receiving it.
   */
  invite_code: z.string().optional(),
  phase: TablePhase,
  settings: TableSettings,
  members: z.array(Member),
  roster: z.array(RosterEntry),
  game: GameSummary.nullable(),
  created_by: UserId,
  created_at: Timestamp,
});
/** Everything about a table except the game state. */
export type TableDetail = z.infer<typeof TableDetail>;

/**
 * A table as a referee receives it, with the invite code. `POST /api/tables` and
 * `POST /api/tables/{table_id}/invite-code` answer with this shape, because only a referee can call them.
 */
export const RefereeTableDetail = TableDetail.extend({ invite_code: z.string() });
/** A table as a referee receives it, with the invite code. */
export type RefereeTableDetail = z.infer<typeof RefereeTableDetail>;

/** Response of `GET /api/tables`: the tables the user is a member of, most recently created first. */
export const TableList = z.object({ items: z.array(TableSummary) });
/** Response of `GET /api/tables`. */
export type TableList = z.infer<typeof TableList>;

/** Body of `POST /api/tables`. `host_key` is required when the server sets `BXVTT_HOST_KEY`. */
export const CreateTableRequest = z.strictObject({
  name: displayString(LIMITS.tableName),
  host_key: z.string().max(200).optional(),
});
/** Body of `POST /api/tables`. */
export type CreateTableRequest = z.infer<typeof CreateTableRequest>;

/**
 * Body of `PATCH /api/tables/{table_id}`: rename the table, change settings, or both. Referee only. `ruleset` holds
 * only the rules to change, which the server merges into the table's ruleset. Each key must be a `Ruleset` field
 * and each value one that bxapi's `Ruleset` schema allows, or the server answers 422 `validation_error`. A change
 * of rules applies to the next ability roll and the next game. An ability roll keeps the rules it was made under.
 */
export const UpdateTableRequest = z.strictObject({
  name: displayString(LIMITS.tableName).optional(),
  settings: z
    .strictObject({
      party_control: PartyControl.optional(),
      caller_user_id: UserId.nullable().optional(),
      auto_resolve: z.boolean().optional(),
      autosave: z.boolean().optional(),
      ruleset: RulesetPatch.optional(),
      ability_score_rerolls: AbilityScoreRerolls.optional(),
      sub_par_restart: z.boolean().optional(),
    })
    .optional(),
});
/** Body of `PATCH /api/tables/{table_id}`. */
export type UpdateTableRequest = z.infer<typeof UpdateTableRequest>;

/** Body of `POST /api/join`: join a table with its invite code. Case and dashes don't matter. */
export const JoinTableRequest = z.strictObject({
  invite_code: z.string().min(1).max(64),
});
/** Body of `POST /api/join`. */
export type JoinTableRequest = z.infer<typeof JoinTableRequest>;

/** Body of `PATCH /api/tables/{table_id}/members/{user_id}`: change a member's role. Referee only. */
export const UpdateMemberRequest = z.strictObject({
  role: Role,
});
/** Body of `PATCH /api/tables/{table_id}/members/{user_id}`. */
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequest>;

/** Body of `POST /api/tables/{table_id}/roster`: put one of your stored characters on the roster. */
export const AddRosterEntryRequest = z.strictObject({
  character_id: CharacterId,
});
/** Body of `POST /api/tables/{table_id}/roster`. */
export type AddRosterEntryRequest = z.infer<typeof AddRosterEntryRequest>;

/** Body of `PUT /api/tables/{table_id}/roster`: the roster entry IDs in the new marching order. Referee only. */
export const ReorderRosterRequest = z.strictObject({
  entry_ids: z.array(z.string().min(1).max(64)).max(20),
});
/** Body of `PUT /api/tables/{table_id}/roster`. */
export type ReorderRosterRequest = z.infer<typeof ReorderRosterRequest>;
