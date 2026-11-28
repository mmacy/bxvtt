import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BattleRoundPreview } from '@bxvtt/shared/bxapi';
import type {
  BattleDeclaration,
  DeclarationRefusal,
  DeclarationsState,
  ResolveRoundResult,
  Role,
  RoundProjection,
  User,
} from '@bxvtt/shared/protocol';
import {
  DeclarationBody,
  PreviewCandidatesRequest,
  ResolveRoundRequest,
  SaveDeclarationRequest,
} from '@bxvtt/shared/protocol';
import type { PreviewCandidatesResult } from '@bxvtt/shared/protocol';
import type { Context } from '../context';
import { json, str } from '../db';
import { ApiError, parseBody } from '../errors';
import { now } from '../ids';
import { RESOLVE_ROUND } from './classify';
import { readSeats } from './seats';
import { attributeRefusals, previewRefusals } from './refusals';
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

/** What the server learned from bxapi's preview of one set of stored declarations. */
interface Preview {
  /** The session, the revision, and the declarations the preview judged. */
  key: string;
  /** Why the session would refuse the declarations. */
  refusals: DeclarationRefusal[];
  /** Where everyone would stand after the declared moves, or `null` when the preview failed. */
  projection: RoundProjection | null;
  /** When the preview failed, in milliseconds since the epoch, or `null` when it succeeded. */
  failedAt: number | null;
}

/** A refusal as a comparable key: its member, its code, and its params. */
function refusalKey(refusal: DeclarationRefusal): string {
  return JSON.stringify([refusal.member_id, refusal.code, refusal.params]);
}

/** How long the server waits before it asks bxapi again for a preview that failed. */
const PREVIEW_RETRY_MS = 5000;

/**
 * Battle declarations at a shared table. Each player saves a declaration for the members in their seats, and the
 * server asks bxapi to preview the stored declarations, so everyone sees which ones the session would refuse
 * before the round resolves. When every declarer has a declaration, the server resolves the round,
 * automatically when the table's `auto_resolve` is on and the preview refuses nothing, or when the caller or a
 * referee asks. bxapi accepts or refuses a round as a whole. On a refusal the declarations stay.
 */
export class BattleService {
  /** The latest preview of each table's stored declarations. */
  private readonly previews = new Map<string, Preview>();

  /**
   * @param ctx - The server's services.
   * @param game - The game service.
   */
  constructor(
    private readonly ctx: Context,
    private readonly game: GameService,
  ) {}

  /**
   * Builds the declarations state of a game, or `null` outside a battle. Every member reads the same state,
   * because the party plans together. A preview rejection names only what a declaration named, and osrlib
   * refuses a target that the player view doesn't list as it refuses an ID that doesn't exist.
   *
   * @param live - The game.
   */
  async state(live: LiveGame): Promise<DeclarationsState | null> {
    return this.refereeState(live);
  }

  /** The stored declarations of the round being declared, by member, with who saved each one. */
  private stored(live: LiveGame): {
    declarations: Record<string, BattleDeclaration>;
    declaredBy: Record<string, string>;
  } {
    const declarers = live.view.encounter?.declarers ?? [];
    const declarations: Record<string, BattleDeclaration> = {};
    const declaredBy: Record<string, string> = {};
    for (const row of this.ctx.db.all(
      'SELECT * FROM declarations WHERE table_id = ? AND session_id = ? AND round = ?',
      live.tableId,
      live.sessionId,
      roundOf(live),
    )) {
      const memberId = str(row, 'member_id');
      if (!declarers.includes(memberId)) continue;
      // A row stored before the server dropped unknown fields keeps only bxapi's fields, because every member
      // reads the declarations.
      const parsed = DeclarationBody.safeParse(json<unknown>(row, 'declaration_json'));
      if (!parsed.success) continue;
      declarations[memberId] = { ...parsed.data, character_id: memberId } as BattleDeclaration;
      declaredBy[memberId] = str(row, 'user_id');
    }
    return { declarations, declaredBy };
  }

  /** The cache key of a set of stored declarations at the game's revision. */
  private previewKey(live: LiveGame, declarations: readonly BattleDeclaration[]): string {
    return `${live.sessionId}#${live.revision}#${JSON.stringify(declarations)}`;
  }

  /**
   * Asks bxapi to preview the stored declarations, once for each revision and set of declarations. A preview that
   * fails, because bxapi is unreachable or the battle ended in a race, gives no refusals and no projection, and
   * the server asks again after {@link PREVIEW_RETRY_MS}.
   */
  private async preview(live: LiveGame, declarations: readonly BattleDeclaration[]): Promise<Preview> {
    const key = this.previewKey(live, declarations);
    const cached = this.previews.get(live.tableId);
    if (
      cached !== undefined &&
      cached.key === key &&
      (cached.failedAt === null || Date.now() - cached.failedAt < PREVIEW_RETRY_MS)
    ) {
      return cached;
    }
    let preview: Preview;
    try {
      const result = await this.ctx.bxapi.post<BattleRoundPreview>(
        `/v1/sessions/${encodeURIComponent(live.sessionId)}/battle-round/preview`,
        { declarations },
      );
      const { can_hide: canHide, can_back_stab: canBackStab } = result;
      // A preview from before osrlib 2.8 parses with no lists, which would read as "nobody can hide", and the
      // client prefers the projection's lists. So such a preview counts as a failed one.
      if (!Array.isArray(canHide) || !Array.isArray(canBackStab)) {
        throw new Error('The battle round preview has no can_hide or can_back_stab.');
      }
      preview = {
        key,
        refusals: previewRefusals(result.rejections, live.view.encounter?.declarers ?? []),
        projection: {
          advance_feet: result.advance_feet,
          front_rank: result.front_rank,
          can_hide: canHide,
          can_back_stab: canBackStab,
        },
        failedAt: null,
      };
    } catch (error) {
      this.ctx.log.warn({ err: error, table: live.tableId }, 'could not preview the battle round');
      preview = { key, refusals: [], projection: null, failedAt: Date.now() };
    }
    this.previews.set(live.tableId, preview);
    return preview;
  }

  /** Builds the declarations state as stored, with the preview's refusals, which a referee reads. */
  private async refereeState(live: LiveGame): Promise<DeclarationsState | null> {
    if (!inBattle(live)) return null;
    const declarers = live.view.encounter?.declarers ?? [];
    const { declarations, declaredBy } = this.stored(live);
    const declared = declarers.filter((memberId) => declarations[memberId] !== undefined);
    const preview =
      declared.length === 0
        ? null
        : await this.preview(
            live,
            declared.flatMap((memberId) => declarations[memberId] ?? []),
          );
    return {
      active: true,
      revision: live.revision,
      round: live.view.encounter?.battle_round ?? null,
      declarers,
      declared,
      declarations,
      declared_by: declaredBy,
      refusals: preview?.refusals ?? [],
      projection: preview?.projection ?? null,
      preview_unavailable: preview?.failedAt != null,
    };
  }

  /**
   * Whether the round can resolve on its own: every declarer has declared, and bxapi's preview refuses none of
   * the declarations. When the preview failed, the server resolves anyway and leaves the judgement to bxapi, so
   * a table with `auto_resolve` on never waits for a resolve that nobody can start.
   */
  private async readyToResolve(live: LiveGame): Promise<boolean> {
    const state = await this.refereeState(live);
    return (
      state !== null &&
      state.declarers.length > 0 &&
      state.declared.length === state.declarers.length &&
      state.refusals.length === 0
    );
  }

  /**
   * Sends the declarations state to everyone at the table. The caller holds the table's lock.
   *
   * @param tableId - The table ID.
   */
  async pushLocked(tableId: string): Promise<void> {
    const live = await this.game.current(tableId);
    const declarations = live === null ? null : await this.state(live);
    this.ctx.hub.send(tableId, () => ({ type: 'declarations', declarations }));
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
    this.previews.delete(live.tableId);
  }

  /**
   * Forgets the preview the server holds for a table that was deleted.
   *
   * @param tableId - The deleted table.
   */
  forgetTable(tableId: string): void {
    this.previews.delete(tableId);
  }

  /**
   * Saves a declaration for one member. The declaration is stored even when the preview refuses it, because
   * whether it works can depend on the moves the others declare.
   *
   * @param tableId - The table ID.
   * @param user - The user in the member's seat, or a referee.
   * @param role - The user's role.
   * @param memberId - The member.
   * @param declaration - The declaration, parsed, so it holds only the fields bxapi defines.
   * @param requestId - The request ID, for bxapi's log.
   */
  async save(
    tableId: string,
    user: User,
    role: Role,
    memberId: string,
    declaration: DeclarationBody,
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
      if (this.ctx.tables.settings(tableId).auto_resolve && (await this.readyToResolve(live))) {
        try {
          await this.resolveLocked(live, user.id, false, requestId);
        } catch (error) {
          // The declaration is saved either way. The table can resolve the round again.
          this.ctx.log.warn({ err: error, table: tableId }, 'could not resolve the round automatically');
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
   * Asks bxapi which candidate declarations it would accept beside the stored ones, and stores nothing. The web
   * client offers a one-click choice only when bxapi accepts it, so it never suggests a choice that would hold up
   * the round. Each candidate is for a declarer who hasn't declared, in a seat the user holds unless the user is a
   * referee. A candidate for a member who has declared or can't act is never accepted, and no candidate is accepted
   * when the candidates would make a saved declaration fail.
   *
   * @param tableId - The table ID.
   * @param user - The user asking.
   * @param role - The user's role.
   * @param candidates - A candidate declaration for each member, by member ID.
   */
  async previewCandidates(
    tableId: string,
    user: User,
    role: Role,
    candidates: Record<string, DeclarationBody>,
  ): Promise<PreviewCandidatesResult> {
    const live = await this.game.require(tableId);
    // A client a push behind can ask just after the battle ends. Nothing is accepted then.
    if (!inBattle(live)) return { revision: live.revision, accepted: [] };
    const { declarations: stored } = this.stored(live);
    const declarers = live.view.encounter?.declarers ?? [];
    // A candidate for a member who has declared, or who can no longer act, comes from a client a push behind. The
    // preview leaves it out and doesn't accept it, rather than failing the request.
    const judged = Object.keys(candidates).filter(
      (memberId) => declarers.includes(memberId) && stored[memberId] === undefined,
    );
    for (const memberId of judged) this.checkMember(live, user, role, memberId);
    const declarations = declarers.flatMap((memberId) => {
      const candidate = judged.includes(memberId) ? candidates[memberId] : undefined;
      if (candidate !== undefined) return [{ ...candidate, character_id: memberId }];
      return stored[memberId] ?? [];
    });
    let result: BattleRoundPreview;
    try {
      result = await this.ctx.bxapi.post<BattleRoundPreview>(
        `/v1/sessions/${encodeURIComponent(live.sessionId)}/battle-round/preview`,
        { declarations },
      );
    } catch (error) {
      // Without bxapi's answer the server can't vouch for any candidate, so it accepts none.
      this.ctx.log.warn({ err: error, table: tableId }, 'could not preview the candidate declarations');
      return { revision: live.revision, accepted: [] };
    }
    // A candidate must not make a saved declaration fail. The stored declarations' own preview is cached, so this
    // usually costs no request. When the candidates add a rejection to a saved declaration, the server can't tell
    // which candidate caused it, so it accepts none of them.
    const saved = declarers.flatMap((memberId) => stored[memberId] ?? []);
    const before = saved.length === 0 ? null : await this.preview(live, saved);
    const known = new Set((before?.refusals ?? []).map(refusalKey));
    const breaksSaved =
      before?.failedAt != null ||
      previewRefusals(result.rejections, declarers).some(
        (refusal) =>
          refusal.member_id !== null &&
          !judged.includes(refusal.member_id) &&
          !known.has(refusalKey(refusal)),
      );
    return {
      revision: live.revision,
      accepted: breaksSaved
        ? []
        : judged.filter((memberId) => (result.rejections[memberId] ?? []).length === 0),
    };
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
        declarations: await this.stateOrInactive(after),
        game: await this.game.project(after, role),
      };
    });
  }

  /**
   * Resolves the round automatically after `auto_resolve` was turned on, when every declarer has declared and
   * the preview refuses nothing.
   *
   * @param tableId - The table ID.
   * @param user - The referee who changed the setting.
   */
  async maybeAutoResolve(tableId: string, user: User): Promise<void> {
    await this.game.locked(tableId, async () => {
      const live = await this.game.current(tableId);
      if (live === null) return;
      if (await this.readyToResolve(live)) await this.resolveLocked(live, user.id, false, 'auto-resolve');
    });
  }

  /**
   * Sends `resolve_battle_round` with one declaration per declarer. The caller holds the table's lock.
   *
   * `fillWithHold` declares `hold` only for the members who haven't declared. It never replaces a stored
   * declaration, even one the preview refuses, because the player chose it and can still change it. So a round
   * with a refused declaration is refused until its member declares again or a referee declares for them.
   *
   * @returns Whether bxapi accepted the round.
   */
  private async resolveLocked(
    live: LiveGame,
    userId: string,
    fillWithHold: boolean,
    requestId: string,
  ): Promise<boolean> {
    if (!inBattle(live)) throw new ApiError('not_in_battle', "The party isn't in a battle.");
    const declarers = live.view.encounter?.declarers ?? [];
    const { declarations: stored } = this.stored(live);
    const missing = declarers.filter((memberId) => stored[memberId] === undefined);
    if (missing.length > 0 && !fillWithHold) {
      throw new ApiError('declarations_incomplete', "Some party members haven't declared an action yet.", {
        missing,
      });
    }
    const declarations = declarers.map(
      (memberId) => stored[memberId] ?? { character_id: memberId, action: 'hold' },
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
    // The preview of the same declarations gives the same rejections, so the state shows these until a member
    // declares again. They take the place of the stored declarations' preview.
    const declared = declarers.flatMap((memberId) => stored[memberId] ?? []);
    const previous = this.previews.get(live.tableId);
    const key = this.previewKey(live, declared);
    this.previews.set(live.tableId, {
      key,
      refusals: attributeRefusals(outcome.rejections, declarers),
      projection: previous?.key === key ? previous.projection : null,
      failedAt: null,
    });
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
      throw new ApiError('not_a_declarer', "That party member can't declare an action this round.");
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

  private async stateOrInactive(live: LiveGame): Promise<DeclarationsState> {
    return (
      (await this.state(live)) ?? {
        active: false,
        revision: live.revision,
        round: null,
        declarers: [],
        declared: [],
        declarations: {},
        declared_by: {},
        refusals: [],
        projection: null,
        preview_unavailable: false,
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
    return reply.type('application/json').send(JSON.stringify(await battle.state(live)));
  });

  app.put('/api/tables/:tableId/game/declarations/:memberId', async (request) => {
    const { tableId, memberId } = DeclarationParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    const body = parseBody(SaveDeclarationRequest, request);
    if (body.declaration.character_id !== undefined && body.declaration.character_id !== memberId) {
      throw new ApiError(
        'validation_error',
        'The declaration character does not match the requested party member.',
        {
          errors: [{ path: ['declaration', 'character_id'], message: 'Must match the member in the path.' }],
        },
      );
    }
    return battle.save(tableId, user, role, memberId, body.declaration, request.id);
  });

  app.delete('/api/tables/:tableId/game/declarations/:memberId', async (request) => {
    const { tableId, memberId } = DeclarationParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    return battle.clear(tableId, user, role, memberId);
  });

  app.post('/api/tables/:tableId/game/declarations/preview', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    const body = parseBody(PreviewCandidatesRequest, request);
    return battle.previewCandidates(tableId, user, role, body.candidates);
  });

  app.post('/api/tables/:tableId/game/declarations/resolve', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    const body = parseBody(ResolveRoundRequest, request);
    return battle.resolve(tableId, user, role, body.fill_with_hold === true, request.id);
  });
}
