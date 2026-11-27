import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CharacterSummary, StoredCharacter, User } from '@bxvtt/shared/protocol';
import {
  AbilityRollRequest,
  AdjustmentLimitsQuery,
  CharacterCheckRequest,
  CharacterPreviewRequest,
  CharacterRequest,
  StartingRollRequest,
} from '@bxvtt/shared/protocol';
import { AbilityRollStore } from './ability-rolls';
import { rateLimited } from './auth';
import { callBxapi } from './bxapi';
import { CharacterChecker } from './character-check';
import { creationRulesOf } from './rulesets';
import { bxapiChoices, StartingRollKeeper } from './starting-rolls';
import type { Context } from './context';
import type { Row } from './db';
import { num, str } from './db';
import { ApiError, notFound, parseBody, parseQuery } from './errors';

/** The path parameters of a character route. */
const CharacterParams = z.object({ characterId: z.string() });
/** The path parameters of an ability roll route. */
const RollParams = z.object({ rollId: z.string() });
/** The path parameters of a table's ability roll route. */
const TableRollParams = z.object({ tableId: z.string() });

/**
 * Records which user owns each stored bxapi character and ability roll. bxapi has no users, so the server
 * checks ownership before it passes an ID to bxapi.
 */
export class CharacterStore {
  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Reads a character's summary if the user owns it.
   *
   * @param characterId - The character ID.
   * @param userId - The user ID.
   * @returns The summary row, or `null`.
   */
  owned(characterId: string, userId: string): Row | null {
    return (
      this.ctx.db.get('SELECT * FROM characters WHERE id = ? AND owner_user_id = ?', characterId, userId) ??
      null
    );
  }

  /**
   * Whether a user may read a character: they own it, or they referee a table whose roster holds it.
   *
   * @param characterId - The character ID.
   * @param user - The user.
   */
  canRead(characterId: string, user: User): boolean {
    if (this.owned(characterId, user.id) !== null) return true;
    const row = this.ctx.db.get(
      `SELECT 1 FROM roster r JOIN members m ON m.table_id = r.table_id
       WHERE r.character_id = ? AND m.user_id = ? AND m.role = 'referee'`,
      characterId,
      user.id,
    );
    return row !== undefined;
  }

  /**
   * Lists a user's characters, newest first.
   *
   * @param userId - The user ID.
   */
  list(userId: string): CharacterSummary[] {
    return this.ctx.db
      .all('SELECT * FROM characters WHERE owner_user_id = ? ORDER BY created_at DESC, rowid DESC', userId)
      .map((row) => ({
        id: str(row, 'id'),
        name: str(row, 'name'),
        class_id: str(row, 'class_id'),
        level: num(row, 'level'),
        max_hp: num(row, 'max_hp'),
        created_at: str(row, 'created_at'),
      }));
  }
}

/**
 * Checks a request's `seed`, which only a server that allows character seeds accepts.
 *
 * @param ctx - The server's services.
 * @param seed - The seed from the request.
 */
function checkSeed(ctx: Context, seed: number | undefined): void {
  if (seed !== undefined && !ctx.config.allowCharacterSeeds) {
    throw new ApiError('forbidden', 'Custom dice seeds for character creation are disabled on this server.');
  }
}

/**
 * Registers the character routes: ability rolls, previews, and stored characters.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerCharacterRoutes(app: FastifyInstance, ctx: Context): void {
  const { db, bxapi } = ctx;

  const abilityRolls = new AbilityRollStore(ctx);

  // Any member may roll, in the lobby or during a game. The roll belongs to the table and keeps its rules.
  app.post('/api/tables/:tableId/ability-rolls', async (request, reply) => {
    const user = ctx.auth.user(request);
    const { tableId } = TableRollParams.parse(request.params);
    ctx.tables.requireMember(tableId, user);
    const body = parseBody(AbilityRollRequest, request);
    checkSeed(ctx, body.seed);
    await ctx.game.requireEngine();
    return reply.status(201).send(await abilityRolls.roll(tableId, user, body, request.id));
  });

  app.get('/api/tables/:tableId/ability-rolls/current', async (request) => {
    const user = ctx.auth.user(request);
    const { tableId } = TableRollParams.parse(request.params);
    ctx.tables.requireMember(tableId, user);
    return abilityRolls.readNewest(tableId, user.id);
  });

  app.get('/api/ability-rolls/:rollId', async (request) => {
    const user = ctx.auth.user(request);
    const { rollId } = RollParams.parse(request.params);
    return abilityRolls.read(rollId, user.id);
  });

  app.post('/api/characters/preview', async (request) => {
    ctx.auth.user(request);
    const body = parseBody(CharacterPreviewRequest, request);
    // bxapi takes the first-level re-roll only inside `ruleset`, and it refuses the old top-level flag.
    const { ability_roll_id: _roll, hp_reroll_at_first_level: _reroll, ...choices } = body;
    // An older engine refuses the ruleset fields that a preview can carry.
    await ctx.game.requireEngine();
    return callBxapi(() => bxapi.post('/v1/generate/character', choices, { requestId: request.id }));
  });

  const startingRolls = new StartingRollKeeper(ctx, abilityRolls);
  const checker = new CharacterChecker(startingRolls);

  /** Takes one bxapi preview from the user's limit for character checks and starting rolls. */
  const takePreview = (userId: string, detail: string) => {
    const retry = ctx.limits.characterChecks.take(userId);
    if (retry > 0) throw rateLimited(detail, retry);
  };

  app.get('/api/ability-rolls/:rollId/starting-rolls', async (request) => {
    const user = ctx.auth.user(request);
    const { rollId } = RollParams.parse(request.params);
    return startingRolls.status(rollId, user.id);
  });

  app.get('/api/ability-rolls/:rollId/adjustment-limits', async (request) => {
    const user = ctx.auth.user(request);
    const { rollId } = RollParams.parse(request.params);
    const { class_id: classId } = parseQuery(AdjustmentLimitsQuery, request);
    // The roll's checks come first, so a request for a roll the user can't use costs nothing.
    const record = startingRolls.guard(rollId, user.id, { class_id: classId });
    // An engine older than osrlib 2.10.0 has no limits route.
    await ctx.game.requireEngine();
    // bxapi computes the limits on each call, so the call counts against the same limit as a check.
    takePreview(user.id, 'You are checking character choices too quickly. Wait a moment and try again.');
    return startingRolls.adjustmentLimits(record, classId);
  });

  app.post('/api/ability-rolls/:rollId/hit-points', async (request) => {
    const user = ctx.auth.user(request);
    const { rollId } = RollParams.parse(request.params);
    const body = parseBody(StartingRollRequest, request);
    takePreview(user.id, 'You are rolling too quickly. Wait a moment and try again.');
    return startingRolls.rollHitPoints(rollId, user.id, body, request.id);
  });

  app.post('/api/ability-rolls/:rollId/gold', async (request) => {
    const user = ctx.auth.user(request);
    const { rollId } = RollParams.parse(request.params);
    const body = parseBody(StartingRollRequest, request);
    takePreview(user.id, 'You are rolling too quickly. Wait a moment and try again.');
    return startingRolls.rollGold(rollId, user.id, body, request.id);
  });

  // Checking choices stores nothing, but it counts as a change for the per-user write limit like every POST, and
  // against the per-user limit for bxapi previews.
  app.post('/api/characters/check', async (request) => {
    const user = ctx.auth.user(request);
    const body = parseBody(CharacterCheckRequest, request);
    abilityRolls.record(body.ability_roll_id, user.id);
    takePreview(user.id, 'You are checking character choices too quickly. Wait a moment and try again.');
    return checker.check(user, body, request.id);
  });

  // A character comes from the user's newest open roll at a table, under the rules recorded on the roll.
  app.post('/api/characters', async (request, reply) => {
    const user = ctx.auth.user(request);
    const body = parseBody(CharacterRequest, request);
    const owned = num(
      db.get('SELECT count(*) AS n FROM characters WHERE owner_user_id = ?', user.id) ?? { n: 0 },
      'n',
    );
    if (owned >= ctx.config.quotas.charactersPerUser) {
      throw new ApiError(
        'forbidden',
        `You already have ${owned} characters, which is the limit per player. Delete a character you no longer play.`,
      );
    }
    // The creation keeps the class its hit points were rolled for. A refused purchase leaves the roll unused, so
    // buying before the gold is rolled would reveal the gold.
    const record = startingRolls.guard(body.ability_roll_id, user.id, body);
    const character = await callBxapi(() =>
      abilityRolls.closingIfUsed(record, () =>
        bxapi.post<StoredCharacter>(
          '/v1/characters',
          { ...bxapiChoices(body, record), ability_roll_id: record.id },
          { requestId: request.id },
        ),
      ),
    );
    db.transaction(() => {
      db.run(
        `INSERT INTO characters (id, owner_user_id, name, class_id, level, max_hp, created_at, creation_rules_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        character.id,
        user.id,
        character.name,
        character.class_id,
        character.level,
        character.character.max_hp,
        character.created_at,
        JSON.stringify(creationRulesOf(record.rules)),
      );
      abilityRolls.markUsed(record, character.id);
    });
    request.log.info({ character: character.id, user: user.id }, 'character created');
    return reply.status(201).send(character);
  });

  app.get('/api/characters', async (request) => ({ items: ctx.characters.list(ctx.auth.user(request).id) }));

  app.get('/api/characters/:characterId', async (request) => {
    const user = ctx.auth.user(request);
    const { characterId } = CharacterParams.parse(request.params);
    if (!ctx.characters.canRead(characterId, user)) notFound('character', characterId);
    return callBxapi(() => bxapi.get<StoredCharacter>(`/v1/characters/${encodeURIComponent(characterId)}`), {
      passNotFound: true,
    });
  });

  app.delete('/api/characters/:characterId', async (request, reply) => {
    const user = ctx.auth.user(request);
    const { characterId } = CharacterParams.parse(request.params);
    if (ctx.characters.owned(characterId, user.id) === null) notFound('character', characterId);
    try {
      await callBxapi(() => bxapi.request('DELETE', `/v1/characters/${encodeURIComponent(characterId)}`), {
        passNotFound: true,
      });
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'not_found')) throw error;
    }
    const tableIds = db
      .all('SELECT DISTINCT table_id FROM roster WHERE character_id = ?', characterId)
      .map((row) => str(row, 'table_id'));
    db.transaction(() => {
      db.run('DELETE FROM roster WHERE character_id = ?', characterId);
      db.run('DELETE FROM characters WHERE id = ?', characterId);
    });
    for (const tableId of tableIds) ctx.tables.broadcastTable(tableId);
    return reply.status(204).send();
  });
}
