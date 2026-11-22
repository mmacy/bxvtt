import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  BattleDeclaration,
  DeclarationRefusal,
  DeclarationsState,
  ResolveRoundResult,
  Role,
  User,
} from '@bxvtt/shared/protocol';
import { ResolveRoundRequest, SaveDeclarationRequest } from '@bxvtt/shared/protocol';
import type { Context } from '../context';
import { json, str } from '../db';
import { ApiError, parseBody } from '../errors';
import { now } from '../ids';
import { RESOLVE_ROUND } from './classify';
import { readSeats } from './seats';
import type { GameService, LiveGame } from './service';

/** The path parameters of a declaration route. */
const DeclarationParams = z.object({ tableId: z.string(), memberId: z.string() });
/** The path parameters of a table route. */
const TableParams = z.object({ tableId: z.string() });

/** The battle round of a game, or 0 before the first round. */
function roundOf(live: LiveGame): number {
  return live.view.encounter?.battle_round ?? 0;
}

/** Whether a game is in a battle. */
function inBattle(live: LiveGame): boolean {
  return live.mode === 'battle' && live.view.encounter?.in_battle === true;
}

/**
 * Battle declarations at a shared table. Each player saves a declaration for the members in their seats. When
 * every declarer has one, the server resolves the round, automatically when the table's `auto_resolve` is on, or
 * when the caller or a referee asks. bxapi accepts or refuses a round as a whole. On a refusal the declarations
 * stay, and the server reports which declaration bxapi refused.
 */
export class BattleService {
  /**
   * @param ctx - The server's services.
   * @param game - The game service.
   */
  constructor(
    private readonly ctx: Context,
    private readonly game: GameService,
  ) {}

  /**
   * Builds the declarations state of a game, or `null` outside a battle.
   *
   * @param live - The game.
   */
  state(live: LiveGame): DeclarationsState | null {
    if (!inBattle(live)) return null;
    const round = roundOf(live);
    const declarers = live.view.encounter?.declarers ?? [];
    const rows = this.ctx.db.all(
      'SELECT * FROM declarations WHERE table_id = ? AND session_id = ? AND round = ?',
      live.tableId,
      live.sessionId,
      round,
    );
    const declarations: Record<string, BattleDeclaration> = {};
    const declaredBy: Record<string, string> = {};
    for (const row of rows) {
      const memberId = str(row, 'member_id');
      if (!declarers.includes(memberId)) continue;
      declarations[memberId] = json<BattleDeclaration>(row, 'declaration_json');
      declaredBy[memberId] = str(row, 'user_id');
    }
    const refusalRow = this.ctx.db.get(
      'SELECT * FROM battle_refusals WHERE table_id = ? AND session_id = ? AND revision = ?',
      live.tableId,
      live.sessionId,
      live.revision,
    );
    return {
      active: true,
      revision: live.revision,
      round: live.view.encounter?.battle_round ?? null,
      declarers,
      declared: declarers.filter((memberId) => declarations[memberId] !== undefined),
      declarations,
      declared_by: declaredBy,
      refusals: refusalRow === undefined ? [] : json<DeclarationRefusal[]>(refusalRow, 'refusals_json'),
    };
  }

  /**
   * Sends the declarations state to everyone at the table. The caller holds the table's lock.
   *
   * @param tableId - The table ID.
   */
  async pushLocked(tableId: string): Promise<void> {
    const live = await this.game.current(tableId);
    const declarations = live === null ? null : this.state(live);
    this.ctx.hub.broadcast(tableId, { type: 'declarations', declarations });
  }

  /**
   * Clears declarations that no longer apply after an accepted command: all of them when the battle ended, and
   * those of earlier rounds otherwise. The caller holds the table's lock.
   *
   * @param live - The game after the command.
   */
  afterAcceptedLocked(live: LiveGame): void {
    if (!inBattle(live)) {
      this.ctx.db.run('DELETE FROM declarations WHERE table_id = ?', live.tableId);
    } else {
      this.ctx.db.run(
        'DELETE FROM declarations WHERE table_id = ? AND (session_id <> ? OR round <> ?)',
        live.tableId,
        live.sessionId,
        roundOf(live),
      );
    }
    this.ctx.db.run('DELETE FROM battle_refusals WHERE table_id = ?', live.tableId);
  }

  /**
   * Saves a declaration for one member.
   *
   * @param tableId - The table ID.
   * @param user - The user in the member's seat, or a referee.
   * @param role - The user's role.
   * @param memberId - The member.
   * @param declaration - The declaration.
   * @param requestId - The request ID, for bxapi's log.
   */
  async save(
    tableId: string,
    user: User,
    role: Role,
    memberId: string,
    declaration: Record<string, unknown>,
    requestId: string,
  ): Promise<DeclarationsState> {
    return this.game.locked(tableId, async () => {
      const live = await this.requireBattle(tableId);
      this.checkMember(live, user, role, memberId);
      const stored = { ...declaration, character_id: memberId };
      this.ctx.db.run(
        `INSERT OR REPLACE INTO declarations (table_id, session_id, member_id, round, declaration_json, user_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        tableId,
        live.sessionId,
        memberId,
        roundOf(live),
        JSON.stringify(stored),
        user.id,
        now(),
      );
      await this.pushLocked(tableId);
      if (this.ctx.tables.settings(tableId).auto_resolve) {
        const state = this.state(live);
        if (
          state !== null &&
          state.declarers.length > 0 &&
          state.declared.length === state.declarers.length
        ) {
          try {
            await this.resolveLocked(live, user.id, false, requestId);
          } catch (error) {
            // The declaration is saved either way. The table can resolve the round again.
            this.ctx.log.warn({ err: error, table: tableId }, 'could not resolve the round automatically');
          }
        }
      }
      return this.stateOrInactive(await this.game.require(tableId));
    });
  }

  /**
   * Clears one member's declaration.
   *
   * @param tableId - The table ID.
   * @param user - The user in the member's seat, or a referee.
   * @param role - The user's role.
   * @param memberId - The member.
   */
  async clear(tableId: string, user: User, role: Role, memberId: string): Promise<DeclarationsState> {
    return this.game.locked(tableId, async () => {
      const live = await this.requireBattle(tableId);
      this.checkMember(live, user, role, memberId);
      this.ctx.db.run(
        'DELETE FROM declarations WHERE table_id = ? AND session_id = ? AND member_id = ?',
        tableId,
        live.sessionId,
        memberId,
      );
      await this.pushLocked(tableId);
      return this.stateOrInactive(live);
    });
  }

  /**
   * Resolves the round on request.
   *
   * @param tableId - The table ID.
   * @param user - The caller or a referee.
   * @param role - The user's role.
   * @param fillWithHold - Referee only: declare `hold` for each member who hasn't declared.
   * @param requestId - The request ID, for bxapi's log.
   */
  async resolve(
    tableId: string,
    user: User,
    role: Role,
    fillWithHold: boolean,
    requestId: string,
  ): Promise<ResolveRoundResult> {
    if (fillWithHold && role !== 'referee') {
      throw new ApiError(
        'referee_required',
        'Only a referee can resolve a round before everyone has declared.',
      );
    }
    return this.game.locked(tableId, async () => {
      const live = await this.requireBattle(tableId);
      this.game.checkPartyControl(live, user, role);
      const accepted = await this.resolveLocked(live, user.id, fillWithHold, requestId);
      const after = await this.game.require(tableId);
      return {
        accepted,
        declarations: this.stateOrInactive(after),
        game: await this.game.project(after, role),
      };
    });
  }

  /**
   * Resolves the round automatically after `auto_resolve` was turned on, when every declarer has declared.
   *
   * @param tableId - The table ID.
   * @param user - The referee who changed the setting.
   */
  async maybeAutoResolve(tableId: string, user: User): Promise<void> {
    await this.game.locked(tableId, async () => {
      const live = await this.game.current(tableId);
      if (live === null) return;
      const state = this.state(live);
      if (state !== null && state.declarers.length > 0 && state.declared.length === state.declarers.length) {
        await this.resolveLocked(live, user.id, false, 'auto-resolve');
      }
    });
  }

  /**
   * Sends `resolve_battle_round` with one declaration per declarer. The caller holds the table's lock.
   *
   * @returns Whether bxapi accepted the round.
   */
  private async resolveLocked(
    live: LiveGame,
    userId: string,
    fillWithHold: boolean,
    requestId: string,
  ): Promise<boolean> {
    const state = this.state(live);
    if (state === null) throw new ApiError('not_in_battle', "The party isn't in a battle.");
    const missing = state.declarers.filter((memberId) => state.declarations[memberId] === undefined);
    if (missing.length > 0 && !fillWithHold) {
      throw new ApiError('declarations_incomplete', "Some members haven't declared yet.", { missing });
    }
    const declarations = state.declarers.map(
      (memberId) => state.declarations[memberId] ?? { character_id: memberId, action: 'hold' },
    );
    const command = { command_type: RESOLVE_ROUND, declarations };
    const outcome = await this.game.executeLocked(live, command, requestId, userId);
    if (outcome.accepted) {
      await this.game.afterAcceptedLocked(live, outcome, {
        userId,
        commandType: RESOLVE_ROUND,
        class: 'battle',
      });
      return true;
    }
    if (outcome.view !== undefined) live.view = outcome.view;
    const refusals: DeclarationRefusal[] = outcome.rejections.map((rejection) => {
      const params = (rejection.params ?? {}) as Record<string, unknown>;
      const memberId =
        Object.values(params).find(
          (value): value is string => typeof value === 'string' && state.declarers.includes(value),
        ) ?? null;
      return { member_id: memberId, code: rejection.code, params };
    });
    this.ctx.db.run(
      'INSERT OR REPLACE INTO battle_refusals (table_id, session_id, revision, refusals_json) VALUES (?, ?, ?, ?)',
      live.tableId,
      live.sessionId,
      live.revision,
      JSON.stringify(refusals),
    );
    await this.pushLocked(live.tableId);
    return false;
  }

  private async requireBattle(tableId: string): Promise<LiveGame> {
    const live = await this.game.require(tableId);
    if (!inBattle(live)) throw new ApiError('not_in_battle', "The party isn't in a battle.");
    return live;
  }

  private checkMember(live: LiveGame, user: User, role: Role, memberId: string): void {
    const declarers = live.view.encounter?.declarers ?? [];
    if (!declarers.includes(memberId)) {
      throw new ApiError('not_a_declarer', "That member doesn't declare this round.");
    }
    if (role === 'referee') return;
    const seat = readSeats(this.ctx.db, live.tableId, live.sessionId).find((s) => s.member_id === memberId);
    if (seat?.user_id !== user.id) {
      const name = seat?.name ?? memberId;
      throw new ApiError(
        'forbidden',
        `Only the player in ${name}'s seat or a referee can declare for ${name}.`,
      );
    }
  }

  private stateOrInactive(live: LiveGame): DeclarationsState {
    return (
      this.state(live) ?? {
        active: false,
        revision: live.revision,
        round: null,
        declarers: [],
        declared: [],
        declarations: {},
        declared_by: {},
        refusals: [],
      }
    );
  }
}

/**
 * Registers the declaration routes under `/api/tables/{table_id}/game/declarations`.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerBattleRoutes(app: FastifyInstance, ctx: Context): void {
  const battle = ctx.game.battle;

  app.get('/api/tables/:tableId/game/declarations', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    ctx.tables.requireMember(tableId, ctx.auth.user(request));
    const live = await ctx.game.require(tableId);
    return reply.type('application/json').send(JSON.stringify(battle.state(live)));
  });

  app.put('/api/tables/:tableId/game/declarations/:memberId', async (request) => {
    const { tableId, memberId } = DeclarationParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    const body = parseBody(SaveDeclarationRequest, request);
    if (body.declaration.character_id !== undefined && body.declaration.character_id !== memberId) {
      throw new ApiError('validation_error', 'The declaration names a different member than the route.', {
        errors: [{ path: ['declaration', 'character_id'], message: 'must match the member in the path' }],
      });
    }
    return battle.save(tableId, user, role, memberId, body.declaration, request.id);
  });

  app.delete('/api/tables/:tableId/game/declarations/:memberId', async (request) => {
    const { tableId, memberId } = DeclarationParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    return battle.clear(tableId, user, role, memberId);
  });

  app.post('/api/tables/:tableId/game/declarations/resolve', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    const body = parseBody(ResolveRoundRequest, request);
    return battle.resolve(tableId, user, role, body.fill_with_hold === true, request.id);
  });
}
