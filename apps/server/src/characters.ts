import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AbilityRoll, CharacterSummary, StoredCharacter, User } from '@bxvtt/shared/protocol';
import { AbilityRollRequest, CharacterRequest } from '@bxvtt/shared/protocol';
import { callBxapi } from './bxapi';
import type { Context } from './context';
import type { Row } from './db';
import { num, str } from './db';
import { ApiError, notFound, parseBody } from './errors';
import { now } from './ids';

/** The path parameters of a character route. */
const CharacterParams = z.object({ characterId: z.string() });
/** The path parameters of an ability roll route. */
const RollParams = z.object({ rollId: z.string() });

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
    throw new ApiError('forbidden', "This server doesn't let users choose the dice for a new character.");
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

  app.post('/api/ability-rolls', async (request, reply) => {
    const user = ctx.auth.user(request);
    const body = parseBody(AbilityRollRequest, request);
    checkSeed(ctx, body.seed);
    const roll = await callBxapi(() =>
      bxapi.post<AbilityRoll>('/v1/ability-rolls', body, { requestId: request.id }),
    );
    db.run(
      'INSERT INTO ability_rolls (id, owner_user_id, created_at) VALUES (?, ?, ?)',
      roll.id,
      user.id,
      now(),
    );
    return reply.status(201).send(roll);
  });

  app.get('/api/ability-rolls/:rollId', async (request) => {
    const user = ctx.auth.user(request);
    const { rollId } = RollParams.parse(request.params);
    if (
      db.get('SELECT 1 FROM ability_rolls WHERE id = ? AND owner_user_id = ?', rollId, user.id) === undefined
    ) {
      notFound('ability roll', rollId);
    }
    return callBxapi(() => bxapi.get<AbilityRoll>(`/v1/ability-rolls/${encodeURIComponent(rollId)}`));
  });

  app.post('/api/characters/preview', async (request) => {
    ctx.auth.user(request);
    const body = parseBody(CharacterRequest, request);
    const { ability_roll_id: _roll, ...choices } = body;
    return callBxapi(() => bxapi.post('/v1/generate/character', choices, { requestId: request.id }));
  });

  app.post('/api/characters', async (request, reply) => {
    const user = ctx.auth.user(request);
    const body = parseBody(CharacterRequest, request);
    checkSeed(ctx, body.seed);
    const owned = num(
      db.get('SELECT count(*) AS n FROM characters WHERE owner_user_id = ?', user.id) ?? { n: 0 },
      'n',
    );
    if (owned >= ctx.config.quotas.charactersPerUser) {
      throw new ApiError(
        'forbidden',
        `You have ${owned} characters, the most this server keeps for one user. Delete one you no longer play.`,
      );
    }
    if (body.ability_roll_id !== undefined) {
      const owns = db.get(
        'SELECT 1 FROM ability_rolls WHERE id = ? AND owner_user_id = ?',
        body.ability_roll_id,
        user.id,
      );
      if (owns === undefined) notFound('ability roll', body.ability_roll_id);
    }
    const character = await callBxapi(() =>
      bxapi.post<StoredCharacter>('/v1/characters', body, { requestId: request.id }),
    );
    db.run(
      'INSERT INTO characters (id, owner_user_id, name, class_id, level, max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      character.id,
      user.id,
      character.name,
      character.class_id,
      character.level,
      character.character.max_hp,
      character.created_at,
    );
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
