import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  CreationRules,
  GameSummary,
  Member,
  Role,
  RosterEntry,
  TableDetail,
  TableSettings,
  TableSummary,
  User,
  UserColor,
} from '@bxvtt/shared/protocol';
import {
  AddRosterEntryRequest,
  CreationRules as CreationRulesSchema,
  completeRuleset,
  CreateTableRequest,
  JoinTableRequest,
  ReorderRosterRequest,
  UpdateMemberRequest,
  UpdateTableRequest,
} from '@bxvtt/shared/protocol';
import type { Context } from './context';
import type { Row } from './db';
import { json, num, str, strOrNull } from './db';
import { standardRuleset } from './rulesets';
import { ApiError, notFound, parseBody } from './errors';
import { newId, newInviteCode, normalizeInviteCode, now, secretsEqual } from './ids';
import { rateLimited } from './auth';
import { addressKey } from './util';

/** What the server remembers about a table's current game, in the `game_json` column. */
export interface GameRecord {
  adventure_id: string | null;
  adventure_name: string;
  started_at: string;
  mode: string;
  ended: boolean;
  /** Dungeon names by dungeon ID, for autosave labels. */
  dungeon_names: Record<string, string>;
}

/**
 * Reads a character's recorded creation rules, or `null` for a character from before the server recorded them or
 * whose record no longer parses.
 *
 * @param row - The character row, with `creation_rules_json`.
 */
function creationRulesOf(row: Row): CreationRules | null {
  const text = strOrNull(row, 'creation_rules_json');
  if (text === null) return null;
  const parsed = CreationRulesSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

/** The path parameters of a table route. */
const TableParams = z.object({ tableId: z.string() });
/** The path parameters of a member route. */
const MemberParams = z.object({ tableId: z.string(), userId: z.string() });
/** The path parameters of a roster route. */
const RosterParams = z.object({ tableId: z.string(), entryId: z.string() });

/**
 * Stores tables, memberships, settings, and lobby rosters, and answers permission questions about them.
 */
export class TableStore {
  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  private get db() {
    return this.ctx.db;
  }

  /**
   * Reads a table's row.
   *
   * @param tableId - The table ID.
   * @returns The row, or `undefined`.
   */
  row(tableId: string): Row | undefined {
    return this.db.get('SELECT * FROM tables WHERE id = ?', tableId);
  }

  /**
   * Looks up a user's role at a table.
   *
   * @param tableId - The table ID.
   * @param userId - The user ID.
   * @returns The role, or `null` when the user isn't a member.
   */
  roleOf(tableId: string, userId: string): Role | null {
    const row = this.db.get('SELECT role FROM members WHERE table_id = ? AND user_id = ?', tableId, userId);
    return row === undefined ? null : (str(row, 'role') as Role);
  }

  /**
   * Checks that a user is a member of a table. A table the user isn't a member of looks like one that doesn't
   * exist.
   *
   * @param tableId - The table ID.
   * @param user - The user.
   * @returns The user's role.
   * @throws ApiError `not_found` when the user isn't a member.
   */
  requireMember(tableId: string, user: User): Role {
    const role = this.roleOf(tableId, user.id);
    if (role === null) notFound('table', tableId);
    return role;
  }

  /**
   * Checks that a user is a referee of a table.
   *
   * @param tableId - The table ID.
   * @param user - The user.
   * @throws ApiError `not_found` for a non-member, and `referee_required` for a player.
   */
  requireReferee(tableId: string, user: User): void {
    if (this.requireMember(tableId, user) !== 'referee') {
      throw new ApiError('referee_required', 'Only a referee of this table can do that.');
    }
  }

  /**
   * Reads a table's settings.
   *
   * @param tableId - The table ID.
   */
  settings(tableId: string): TableSettings {
    const row = this.row(tableId);
    if (row === undefined) notFound('table', tableId);
    return {
      party_control: str(row, 'party_control') as TableSettings['party_control'],
      caller_user_id: strOrNull(row, 'caller_user_id'),
      auto_resolve: num(row, 'auto_resolve') === 1,
      autosave: num(row, 'autosave') === 1,
      ruleset: completeRuleset(row.ruleset_json === null ? null : json<unknown>(row, 'ruleset_json')),
      ability_score_rerolls: row.ability_score_rerolls === null ? null : num(row, 'ability_score_rerolls'),
      sub_par_restart: num(row, 'sub_par_restart') === 1,
    };
  }

  /**
   * Lists a table's members, referees first, then by when they joined.
   *
   * @param tableId - The table ID.
   */
  members(tableId: string): Member[] {
    return this.db
      .all(
        `SELECT m.user_id, m.role, m.joined_at, u.name, u.color FROM members m JOIN users u ON u.id = m.user_id
         WHERE m.table_id = ? ORDER BY m.role = 'referee' DESC, m.joined_at, m.user_id`,
        tableId,
      )
      .map((row) => ({
        user_id: str(row, 'user_id'),
        name: str(row, 'name'),
        color: str(row, 'color') as UserColor,
        role: str(row, 'role') as Role,
        joined_at: str(row, 'joined_at'),
      }));
  }

  /**
   * Lists a table's lobby roster in marching order.
   *
   * @param tableId - The table ID.
   */
  roster(tableId: string): RosterEntry[] {
    return this.db
      .all(
        `SELECT r.id, r.character_id, r.owner_user_id, r.added_at, c.name, c.class_id, c.level, c.creation_rules_json,
           (SELECT a.table_id FROM ability_rolls a WHERE a.character_id = c.id LIMIT 1) AS rolled_at_table_id
         FROM roster r JOIN characters c ON c.id = r.character_id WHERE r.table_id = ? ORDER BY r.position, r.added_at`,
        tableId,
      )
      .map((row) => ({
        id: str(row, 'id'),
        character_id: str(row, 'character_id'),
        owner_user_id: str(row, 'owner_user_id'),
        name: str(row, 'name'),
        class_id: str(row, 'class_id'),
        level: num(row, 'level'),
        added_at: str(row, 'added_at'),
        creation_rules: creationRulesOf(row),
        rolled_at_other_table: (strOrNull(row, 'rolled_at_table_id') ?? tableId) !== tableId,
      }));
  }

  /**
   * Reads the table's current bxapi session ID and game record.
   *
   * @param tableId - The table ID.
   * @returns The session ID and record, or `null` in the lobby.
   */
  game(tableId: string): { sessionId: string; record: GameRecord } | null {
    const row = this.row(tableId);
    if (row === undefined) return null;
    const sessionId = strOrNull(row, 'session_id');
    if (sessionId === null) return null;
    return { sessionId, record: json<GameRecord>(row, 'game_json') };
  }

  /**
   * Moves a table to a session, or back to its lobby.
   *
   * @param tableId - The table ID.
   * @param game - The session ID and record, or `null` for the lobby.
   */
  setGame(tableId: string, game: { sessionId: string; record: GameRecord } | null): void {
    if (game === null) {
      // The record stays, so a restore from the lobby knows the adventure's dungeon names.
      this.db.run('UPDATE tables SET session_id = NULL WHERE id = ?', tableId);
      return;
    }
    this.db.run(
      'UPDATE tables SET session_id = ?, game_json = ? WHERE id = ?',
      game.sessionId,
      JSON.stringify(game.record),
      tableId,
    );
  }

  /**
   * Builds the full description of a table.
   *
   * @param tableId - The table ID.
   */
  detail(tableId: string): TableDetail {
    const row = this.row(tableId);
    if (row === undefined) notFound('table', tableId);
    return {
      id: str(row, 'id'),
      name: str(row, 'name'),
      invite_code: str(row, 'invite_code'),
      phase: strOrNull(row, 'session_id') === null ? 'lobby' : 'playing',
      settings: this.settings(tableId),
      members: this.members(tableId),
      roster: this.roster(tableId),
      game: this.gameSummary(row),
      created_by: str(row, 'created_by'),
      created_at: str(row, 'created_at'),
    };
  }

  /**
   * Lists the tables a user is a member of, newest first.
   *
   * @param userId - The user ID.
   */
  summaries(userId: string): TableSummary[] {
    return this.db
      .all(
        `SELECT t.*, m.role AS my_role, (SELECT count(*) FROM members x WHERE x.table_id = t.id) AS member_count
         FROM tables t JOIN members m ON m.table_id = t.id WHERE m.user_id = ? ORDER BY t.created_at DESC, t.id`,
        userId,
      )
      .map((row) => ({
        id: str(row, 'id'),
        name: str(row, 'name'),
        role: str(row, 'my_role') as Role,
        phase: strOrNull(row, 'session_id') === null ? 'lobby' : 'playing',
        member_count: num(row, 'member_count'),
        online_count: this.ctx.hub.presence(str(row, 'id')).online.length,
        game: this.gameSummary(row),
        created_at: str(row, 'created_at'),
      }));
  }

  /**
   * Lists the IDs of the tables a user is a member of.
   *
   * @param userId - The user ID.
   */
  tableIdsOf(userId: string): string[] {
    return this.db
      .all('SELECT table_id FROM members WHERE user_id = ?', userId)
      .map((row) => str(row, 'table_id'));
  }

  /**
   * Lists the user IDs of a table's referees.
   *
   * @param tableId - The table ID.
   */
  refereeIds(tableId: string): string[] {
    return this.db
      .all("SELECT user_id FROM members WHERE table_id = ? AND role = 'referee'", tableId)
      .map((row) => str(row, 'user_id'));
  }

  /**
   * Sends the table's description to every connection of the table.
   *
   * @param tableId - The table ID.
   */
  broadcastTable(tableId: string): void {
    if (this.row(tableId) === undefined) return;
    const table = this.detail(tableId);
    this.ctx.hub.broadcast(tableId, { type: 'table', table });
  }

  private gameSummary(row: Row): GameSummary | null {
    const sessionId = strOrNull(row, 'session_id');
    if (sessionId === null) return null;
    const record = json<GameRecord>(row, 'game_json');
    return {
      session_id: sessionId,
      adventure_id: record.adventure_id,
      adventure_name: record.adventure_name,
      mode: record.mode,
      ended: record.ended,
      started_at: record.started_at,
    };
  }

  /**
   * Creates a table with the user as its referee.
   *
   * @param name - The table's name.
   * @param user - The creator.
   * @returns The table ID.
   */
  create(name: string, user: User): string {
    const id = newId('tbl');
    const created = now();
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO tables (id, name, invite_code, created_by, created_at, party_control, caller_user_id,
         auto_resolve, autosave, ruleset_json, ability_score_rerolls, sub_par_restart)
         VALUES (?, ?, ?, ?, ?, 'caller', NULL, 1, 1, ?, 0, 0)`,
        id,
        name,
        newInviteCode(),
        user.id,
        created,
        JSON.stringify(standardRuleset()),
      );
      this.db.run(
        "INSERT INTO members (table_id, user_id, role, joined_at) VALUES (?, ?, 'referee', ?)",
        id,
        user.id,
        created,
      );
    });
    return id;
  }

  /**
   * Removes a member: clears their seats, takes their characters off the roster, and stops them being the caller.
   * The caller checks that the table keeps a referee.
   *
   * @param tableId - The table ID.
   * @param userId - The member's user ID.
   */
  removeMember(tableId: string, userId: string): void {
    this.db.transaction(() => {
      this.db.run('DELETE FROM members WHERE table_id = ? AND user_id = ?', tableId, userId);
      this.db.run('DELETE FROM roster WHERE table_id = ? AND owner_user_id = ?', tableId, userId);
      this.db.run('UPDATE seats SET user_id = NULL WHERE table_id = ? AND user_id = ?', tableId, userId);
      this.db.run(
        'UPDATE tables SET caller_user_id = NULL WHERE id = ? AND caller_user_id = ?',
        tableId,
        userId,
      );
    });
  }

  /**
   * What a member's leaving would do to a table.
   *
   * - `delete_table`: the member is the last one, so leaving deletes the table.
   * - `last_referee`: the member is the only referee and others remain, so the member can't leave.
   * - `leave`: the member leaves and the table goes on.
   *
   * @param tableId - The table ID.
   * @param userId - The member's user ID.
   */
  leaveOutcome(tableId: string, userId: string): 'leave' | 'delete_table' | 'last_referee' {
    if (this.members(tableId).length === 1) return 'delete_table';
    if (this.roleOf(tableId, userId) === 'referee' && this.refereeCount(tableId) === 1) return 'last_referee';
    return 'leave';
  }

  /**
   * Takes a member out of a table, as `POST /api/tables/{table_id}/leave` does. The last member's leaving deletes
   * the table. Otherwise the member's seats become empty, their characters leave the roster, they stop being the
   * caller, the feed says they left, and their connections to the table close with `removed`. Unless it deletes
   * the table, it does all of this before it returns its promise.
   *
   * @param tableId - The table ID.
   * @param userId - The member's user ID.
   * @throws ApiError `last_referee` when the member is the only referee and others remain.
   */
  async leave(tableId: string, userId: string): Promise<void> {
    const outcome = this.leaveOutcome(tableId, userId);
    if (outcome === 'delete_table') {
      await this.ctx.game.deleteTable(tableId);
      return;
    }
    if (outcome === 'last_referee') {
      throw new ApiError(
        'last_referee',
        "You are the table's only referee. Promote another member to referee before leaving.",
      );
    }
    this.removeMember(tableId, userId);
    this.ctx.feed.system(tableId, userId, 'member_left', { user_id: userId });
    this.ctx.hub.removeUser(tableId, userId, 'left');
    this.broadcastTable(tableId);
    this.ctx.game.broadcastState(tableId);
  }

  /**
   * Counts a table's referees.
   *
   * @param tableId - The table ID.
   */
  refereeCount(tableId: string): number {
    return this.refereeIds(tableId).length;
  }

  /**
   * Checks that the table is in its lobby.
   *
   * @param tableId - The table ID.
   * @throws ApiError `game_active` while a game is in progress.
   */
  requireLobby(tableId: string): void {
    if (this.game(tableId) !== null) {
      throw new ApiError(
        'game_active',
        'A game is in progress. End the game before changing the party roster.',
      );
    }
  }
}

/**
 * Registers the table routes: tables, invites, membership, and the lobby roster.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerTableRoutes(app: FastifyInstance, ctx: Context): void {
  const { tables } = ctx;

  app.get('/api/tables', async (request) => ({ items: tables.summaries(ctx.auth.user(request).id) }));

  app.post('/api/tables', async (request, reply) => {
    const user = ctx.auth.user(request);
    const body = parseBody(CreateTableRequest, request);
    if (ctx.config.hostKey !== null) {
      // The limit applies before the comparison, so an address that has guessed too often can't learn
      // whether its next guess is right.
      const key = addressKey(request.clientIp);
      const blocked = ctx.limits.failedHostKey.peek(key);
      if (blocked > 0)
        throw rateLimited(
          'Too many incorrect host key attempts from this IP address. Try again later.',
          blocked,
        );
      if (body.host_key === undefined || !secretsEqual(body.host_key, ctx.config.hostKey)) {
        if (body.host_key !== undefined) ctx.limits.failedHostKey.take(key);
        throw new ApiError('host_key_required', 'Enter the host key from the server host to create a table.');
      }
    }
    // A table counts while its creator is still one of its referees, so every table that counts is one the
    // creator can open and delete. A creator who hands a table to another referee and leaves gets the slot back.
    const created = num(
      ctx.db.get(
        `SELECT count(*) AS n FROM tables t
           JOIN members m ON m.table_id = t.id AND m.user_id = t.created_by AND m.role = 'referee'
          WHERE t.created_by = ?`,
        user.id,
      ) ?? { n: 0 },
      'n',
    );
    if (created >= ctx.config.quotas.tablesPerUser) {
      throw new ApiError(
        'forbidden',
        `You're the referee of ${created} ${created === 1 ? 'table' : 'tables'} that you created, which is the limit for one person. To make room, open a table you no longer use and choose Delete table from its table menu.`,
      );
    }
    const id = tables.create(body.name, user);
    request.log.info({ table: id, user: user.id }, 'table created');
    return reply.status(201).send(tables.detail(id));
  });

  app.get('/api/tables/:tableId', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    tables.requireMember(tableId, ctx.auth.user(request));
    return tables.detail(tableId);
  });

  app.patch('/api/tables/:tableId', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireReferee(tableId, user);
    const body = parseBody(UpdateTableRequest, request);
    const before = tables.settings(tableId);
    if (body.name !== undefined) ctx.db.run('UPDATE tables SET name = ? WHERE id = ?', body.name, tableId);
    const settings = body.settings ?? {};
    if (settings.caller_user_id !== undefined && settings.caller_user_id !== null) {
      if (tables.roleOf(tableId, settings.caller_user_id) === null) {
        throw new ApiError('validation_error', 'The caller must be a member of this table.', {
          errors: [{ path: ['settings', 'caller_user_id'], message: 'Caller must be a table member.' }],
        });
      }
    }
    if (settings.party_control !== undefined) {
      ctx.db.run('UPDATE tables SET party_control = ? WHERE id = ?', settings.party_control, tableId);
    }
    if (settings.caller_user_id !== undefined) {
      ctx.db.run('UPDATE tables SET caller_user_id = ? WHERE id = ?', settings.caller_user_id, tableId);
    }
    if (settings.auto_resolve !== undefined) {
      ctx.db.run('UPDATE tables SET auto_resolve = ? WHERE id = ?', settings.auto_resolve ? 1 : 0, tableId);
    }
    if (settings.autosave !== undefined) {
      ctx.db.run('UPDATE tables SET autosave = ? WHERE id = ?', settings.autosave ? 1 : 0, tableId);
    }
    // The table's ruleset applies to the next ability roll and the next game. A roll keeps the rules it was made
    // under, and a game keeps the ruleset it started with.
    if (settings.ruleset !== undefined) {
      const ruleset = { ...before.ruleset, ...settings.ruleset };
      ctx.db.run('UPDATE tables SET ruleset_json = ? WHERE id = ?', JSON.stringify(ruleset), tableId);
    }
    if (settings.ability_score_rerolls !== undefined) {
      ctx.db.run(
        'UPDATE tables SET ability_score_rerolls = ? WHERE id = ?',
        settings.ability_score_rerolls,
        tableId,
      );
    }
    if (settings.sub_par_restart !== undefined) {
      ctx.db.run(
        'UPDATE tables SET sub_par_restart = ? WHERE id = ?',
        settings.sub_par_restart ? 1 : 0,
        tableId,
      );
    }
    const after = tables.settings(tableId);
    if (after.caller_user_id !== before.caller_user_id) {
      ctx.feed.system(tableId, user.id, 'caller_changed', { user_id: after.caller_user_id });
    }
    tables.broadcastTable(tableId);
    if (after.caller_user_id !== before.caller_user_id || after.party_control !== before.party_control) {
      ctx.game.broadcastState(tableId);
    }
    if (after.auto_resolve && !before.auto_resolve) await ctx.game.battle.maybeAutoResolve(tableId, user);
    return tables.detail(tableId);
  });

  app.delete('/api/tables/:tableId', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireReferee(tableId, user);
    await ctx.game.deleteTable(tableId);
    request.log.info({ table: tableId, user: user.id }, 'table deleted');
    return reply.status(204).send();
  });

  app.post('/api/tables/:tableId/invite-code', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    tables.requireReferee(tableId, ctx.auth.user(request));
    ctx.db.run('UPDATE tables SET invite_code = ? WHERE id = ?', newInviteCode(), tableId);
    tables.broadcastTable(tableId);
    return tables.detail(tableId);
  });

  app.post('/api/join', async (request) => {
    const user = ctx.auth.user(request);
    const retry = ctx.limits.join.take(addressKey(request.clientIp));
    if (retry > 0)
      throw rateLimited('Too many invite code attempts from this IP address. Try again later.', retry);
    const body = parseBody(JoinTableRequest, request);
    const row = ctx.db.get(
      'SELECT id FROM tables WHERE invite_code = ?',
      normalizeInviteCode(body.invite_code),
    );
    if (row === undefined)
      throw new ApiError(
        'invite_invalid',
        "That invite code doesn't match any table. Check the code with your referee.",
      );
    const tableId = str(row, 'id');
    if (tables.roleOf(tableId, user.id) === null) {
      ctx.db.run(
        "INSERT INTO members (table_id, user_id, role, joined_at) VALUES (?, ?, 'player', ?)",
        tableId,
        user.id,
        now(),
      );
      ctx.feed.system(tableId, user.id, 'member_joined', { user_id: user.id });
      tables.broadcastTable(tableId);
    }
    return tables.detail(tableId);
  });

  app.post('/api/tables/:tableId/leave', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireMember(tableId, user);
    await tables.leave(tableId, user.id);
    return reply.status(204).send();
  });

  app.patch('/api/tables/:tableId/members/:userId', async (request) => {
    const { tableId, userId } = MemberParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireReferee(tableId, user);
    const body = parseBody(UpdateMemberRequest, request);
    const current = tables.roleOf(tableId, userId);
    if (current === null) notFound('member', userId);
    if (current === 'referee' && body.role === 'player' && tables.refereeCount(tableId) === 1) {
      throw new ApiError(
        'last_referee',
        'Every table needs at least one referee. Promote another member to referee first.',
      );
    }
    if (current !== body.role) {
      ctx.db.run(
        'UPDATE members SET role = ? WHERE table_id = ? AND user_id = ?',
        body.role,
        tableId,
        userId,
      );
      ctx.feed.system(tableId, user.id, 'role_changed', { user_id: userId, role: body.role });
      tables.broadcastTable(tableId);
      // The member's projection changes with the role, so they get a new snapshot.
      ctx.game.resyncUser(tableId, userId);
    }
    return tables.detail(tableId);
  });

  app.delete('/api/tables/:tableId/members/:userId', async (request) => {
    const { tableId, userId } = MemberParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireReferee(tableId, user);
    if (userId === user.id) {
      throw new ApiError('forbidden', 'Use Leave table to leave the table yourself.');
    }
    if (tables.roleOf(tableId, userId) === null) notFound('member', userId);
    tables.removeMember(tableId, userId);
    // The removed member saw the invite code, so a new one keeps them from joining again with it.
    ctx.db.run('UPDATE tables SET invite_code = ? WHERE id = ?', newInviteCode(), tableId);
    ctx.feed.system(tableId, user.id, 'member_removed', { user_id: userId });
    ctx.hub.removeUser(tableId, userId, 'kicked');
    tables.broadcastTable(tableId);
    ctx.game.broadcastState(tableId);
    return tables.detail(tableId);
  });

  app.post('/api/tables/:tableId/roster', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireMember(tableId, user);
    tables.requireLobby(tableId);
    const body = parseBody(AddRosterEntryRequest, request);
    const character = ctx.characters.owned(body.character_id, user.id);
    if (character === null) notFound('character', body.character_id);
    const existing = ctx.db.get(
      'SELECT id FROM roster WHERE table_id = ? AND character_id = ?',
      tableId,
      body.character_id,
    );
    if (existing !== undefined)
      throw new ApiError('duplicate_character', 'That character is already on the party roster.');
    const count = num(
      ctx.db.get('SELECT count(*) AS n FROM roster WHERE table_id = ?', tableId) ?? { n: 0 },
      'n',
    );
    if (count >= 20) {
      throw new ApiError('forbidden', 'The party roster is full (maximum 20 characters).');
    }
    const position = num(
      ctx.db.get('SELECT coalesce(max(position), -1) + 1 AS p FROM roster WHERE table_id = ?', tableId) ?? {
        p: 0,
      },
      'p',
    );
    ctx.db.run(
      'INSERT INTO roster (id, table_id, character_id, owner_user_id, position, added_at) VALUES (?, ?, ?, ?, ?, ?)',
      newId('ros'),
      tableId,
      body.character_id,
      user.id,
      position,
      now(),
    );
    tables.broadcastTable(tableId);
    return tables.detail(tableId);
  });

  app.delete('/api/tables/:tableId/roster/:entryId', async (request) => {
    const { tableId, entryId } = RosterParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = tables.requireMember(tableId, user);
    tables.requireLobby(tableId);
    const entry = ctx.db.get('SELECT * FROM roster WHERE table_id = ? AND id = ?', tableId, entryId);
    if (entry === undefined) notFound('roster entry', entryId);
    if (role !== 'referee' && str(entry, 'owner_user_id') !== user.id) {
      throw new ApiError(
        'forbidden',
        "Only that character's owner or a referee can remove them from the roster.",
      );
    }
    ctx.db.run('DELETE FROM roster WHERE id = ?', entryId);
    tables.broadcastTable(tableId);
    return tables.detail(tableId);
  });

  app.put('/api/tables/:tableId/roster', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    tables.requireReferee(tableId, ctx.auth.user(request));
    tables.requireLobby(tableId);
    const body = parseBody(ReorderRosterRequest, request);
    const current = tables.roster(tableId).map((entry) => entry.id);
    const same =
      body.entry_ids.length === current.length &&
      new Set(body.entry_ids).size === current.length &&
      body.entry_ids.every((id) => current.includes(id));
    if (!same) {
      throw new ApiError('validation_error', 'List every roster entry exactly once.', {
        errors: [{ path: ['entry_ids'], message: 'must list every roster entry exactly once' }],
      });
    }
    ctx.db.transaction(() => {
      body.entry_ids.forEach((id, position) => {
        ctx.db.run('UPDATE roster SET position = ? WHERE id = ?', position, id);
      });
    });
    tables.broadcastTable(tableId);
    return tables.detail(tableId);
  });
}
