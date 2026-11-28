import type { FastifyInstance } from 'fastify';
import type { User, UserColor } from '@bxvtt/shared/protocol';
import { CreateUserRequest, UpdateUserRequest, USER_COLORS } from '@bxvtt/shared/protocol';
import type { Context } from './context';
import type { Database, Row } from './db';
import { num, str } from './db';
import { ApiError, parseBody } from './errors';
import { hashToken, newId, newToken, now } from './ids';
import { rateLimited } from './auth';
import { addressKey } from './util';

/**
 * Stores users. A user has a display name, a color from {@link USER_COLORS}, and a token, of which the
 * database keeps only a hash.
 */
export class UserStore {
  /**
   * @param db - The database.
   */
  constructor(private readonly db: Database) {}

  /**
   * Creates a user with the next color of the palette.
   *
   * @param name - The display name.
   * @returns The user and the token, which the server never shows again.
   */
  create(name: string): { user: User; token: string } {
    const count = num(this.db.get('SELECT count(*) AS n FROM users') ?? { n: 0 }, 'n');
    const color = USER_COLORS[count % USER_COLORS.length] ?? USER_COLORS[0];
    const token = newToken();
    const user: User = { id: newId('usr'), name, color, created_at: now() };
    this.db.run(
      'INSERT INTO users (id, name, color, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      user.id,
      user.name,
      user.color,
      hashToken(token),
      user.created_at,
    );
    return { user, token };
  }

  /**
   * Finds the user a token belongs to.
   *
   * @param token - The token.
   * @returns The user, or `null`.
   */
  byToken(token: string): User | null {
    const row = this.db.get('SELECT * FROM users WHERE token_hash = ?', hashToken(token));
    return row === undefined ? null : toUser(row);
  }

  /**
   * Reads a user.
   *
   * @param id - The user ID.
   * @returns The user, or `null`.
   */
  get(id: string): User | null {
    const row = this.db.get('SELECT * FROM users WHERE id = ?', id);
    return row === undefined ? null : toUser(row);
  }

  /**
   * Gives a user a new token and makes the old one useless, for a rejoin request a referee approved.
   *
   * @param id - The user ID.
   * @returns The new token, which the server never shows again.
   */
  rotateToken(id: string): string {
    const token = newToken();
    const row = this.db.get('SELECT token_hash FROM users WHERE id = ?', id);
    this.db.transaction(() => {
      // Remember the old token for a while, so a browser that still holds it hears why it stopped working.
      this.db.run(
        "DELETE FROM retired_tokens WHERE retired_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)",
        `-${RETIRED_TOKEN_DAYS} days`,
      );
      if (row !== undefined) {
        this.db.run(
          'INSERT OR REPLACE INTO retired_tokens (token_hash, user_id, retired_at) VALUES (?, ?, ?)',
          str(row, 'token_hash'),
          id,
          now(),
        );
      }
      this.db.run('UPDATE users SET token_hash = ? WHERE id = ?', hashToken(token), id);
    });
    return token;
  }

  /**
   * Signs a user out: the token stops working, and the user gets no new one. The user, their memberships, and their
   * characters stay, and a referee's approval of a rejoin request gives them a token again.
   *
   * @param id - The user ID.
   * @returns A function that makes the old token work again, unless the user got another token since, such as
   *   from a rejoin. Deleting a user calls it when the deletion fails.
   */
  signOut(id: string): () => void {
    const row = this.db.get('SELECT token_hash FROM users WHERE id = ?', id);
    const replacement = hashToken(newToken());
    this.db.run('UPDATE users SET token_hash = ? WHERE id = ?', replacement, id);
    return () => {
      if (row === undefined) return;
      this.db.run(
        'UPDATE users SET token_hash = ? WHERE id = ? AND token_hash = ?',
        str(row, 'token_hash'),
        id,
        replacement,
      );
    };
  }

  /**
   * Whether a token is one a rejoin retired. A retired token never authenticates.
   *
   * @param token - The token.
   */
  isRetired(token: string): boolean {
    return this.db.get('SELECT 1 FROM retired_tokens WHERE token_hash = ?', hashToken(token)) !== undefined;
  }

  /**
   * Changes a user's name or color.
   *
   * @param id - The user ID.
   * @param changes - The new name, color, or both.
   * @returns The user after the change.
   */
  update(id: string, changes: { name?: string; color?: UserColor }): User {
    if (changes.name !== undefined) this.db.run('UPDATE users SET name = ? WHERE id = ?', changes.name, id);
    if (changes.color !== undefined)
      this.db.run('UPDATE users SET color = ? WHERE id = ?', changes.color, id);
    const user = this.get(id);
    if (user === null) throw new ApiError('unauthorized', 'Your user account was not found.');
    return user;
  }
}

/** How long the server remembers a retired token, in days. */
const RETIRED_TOKEN_DAYS = 90;

/** Converts a `users` row. */
function toUser(row: Row): User {
  return {
    id: str(row, 'id'),
    name: str(row, 'name'),
    color: str(row, 'color') as UserColor,
    created_at: str(row, 'created_at'),
  };
}

/** The tables whose rows changed when a deleted user's references were replaced, for new pushes. */
interface ReplacedReferences {
  /** Tables whose creator changed. */
  creators: string[];
  /** Tables whose battle declarations named the user. */
  declarations: string[];
}

/**
 * Replaces every reference to a deleted user in the rows of tables that remain. Within each table, the user's ID
 * becomes a new, unassigned user ID, so members read "a former member" wherever the user's name was,
 * just as they do for a member who left, and the rows that the user wrote stay together. Different tables get
 * different IDs. A table that the user created names its first remaining referee as its creator instead.
 *
 * @param db - The database. The caller holds a transaction.
 * @param userId - The deleted user's ID.
 */
function replaceUserReferences(db: Database, userId: string): ReplacedReferences {
  const quoted = JSON.stringify(userId);
  const rows = db.allNamed(
    `SELECT table_id FROM feed WHERE user_id = :id OR instr(to_json, :quoted) > 0 OR instr(data_json, :quoted) > 0
       OR instr(coalesce(referee_json, ''), :quoted) > 0
     UNION SELECT table_id FROM declarations WHERE user_id = :id
     UNION SELECT table_id FROM saves WHERE created_by = :id
     UNION SELECT table_id FROM annotations WHERE author_id = :id OR instr(data_json, :quoted) > 0
     UNION SELECT table_id FROM notes WHERE updated_by = :id
     UNION SELECT table_id FROM adventures WHERE uploaded_by = :id`,
    { id: userId, quoted },
  );
  const declarations: string[] = [];
  for (const row of rows) {
    const table = str(row, 'table_id');
    const former = newId('usr');
    const ids = { table, id: userId, former };
    // A JSON column names the user as a quoted string, such as a whisper's recipients or a notice's `user_id`.
    const texts = { table, quoted, replacement: JSON.stringify(former) };
    db.runNamed(`UPDATE feed SET user_id = :former WHERE table_id = :table AND user_id = :id`, ids);
    db.runNamed(
      `UPDATE feed SET to_json = replace(to_json, :quoted, :replacement),
         data_json = replace(data_json, :quoted, :replacement),
         referee_json = replace(referee_json, :quoted, :replacement)
       WHERE table_id = :table AND (instr(to_json, :quoted) > 0 OR instr(data_json, :quoted) > 0
         OR instr(coalesce(referee_json, ''), :quoted) > 0)`,
      texts,
    );
    if (
      db.runNamed(
        'UPDATE declarations SET user_id = :former WHERE table_id = :table AND user_id = :id',
        ids,
      ) > 0
    )
      declarations.push(table);
    db.runNamed('UPDATE saves SET created_by = :former WHERE table_id = :table AND created_by = :id', ids);
    db.runNamed(
      'UPDATE annotations SET author_id = :former WHERE table_id = :table AND author_id = :id',
      ids,
    );
    db.runNamed(
      `UPDATE annotations SET data_json = replace(data_json, :quoted, :replacement)
       WHERE table_id = :table AND instr(data_json, :quoted) > 0`,
      texts,
    );
    db.runNamed('UPDATE notes SET updated_by = :former WHERE table_id = :table AND updated_by = :id', ids);
    db.runNamed(
      'UPDATE adventures SET uploaded_by = :former WHERE table_id = :table AND uploaded_by = :id',
      ids,
    );
  }
  // `created_by` refers to a user row, so it names a real member: the table's first referee.
  const creators = db.all('SELECT id FROM tables WHERE created_by = ?', userId).map((row) => str(row, 'id'));
  db.run(
    `UPDATE tables SET created_by = (SELECT m.user_id FROM members m WHERE m.table_id = tables.id
       ORDER BY m.role = 'referee' DESC, m.joined_at, m.user_id LIMIT 1)
     WHERE created_by = ?`,
    userId,
  );
  return { creators, declarations };
}

/**
 * Deletes a user and what is theirs alone, as `DELETE /api/users/me` does.
 *
 * 1. The user's token stops working, so the server refuses their new requests while the rest happens.
 * 2. The user leaves each of their tables exactly as `POST /api/tables/{table_id}/leave` would: the last member's
 *    leaving deletes the table, and at any other table their seats become empty and the members hear that they
 *    left. Every leave is decided in the same turn of the event loop as the check for a sole referee.
 * 3. In the tables that remain, including tables the user left before, what the user wrote stays, but under an
 *    unassigned user ID (see {@link replaceUserReferences}).
 * 4. Their characters, their ability rolls, and the user are deleted, and their characters are deleted from bxapi
 *    too. A game in progress keeps a copy of each character, so the character stays in that game.
 *
 * If a leave fails, or the step that deletes the rows fails, the user's token works again and the error passes on,
 * so the user can try again. The tables the user already left stay left, and a table already deleted stays
 * deleted. The user, their characters, and their remaining memberships stay as they were.
 *
 * @param ctx - The server's services.
 * @param userId - The user ID.
 * @throws ApiError `last_referee` when the user is the only referee of a table that has other members. Nothing
 *   changes then.
 */
export async function deleteUser(ctx: Context, userId: string): Promise<void> {
  const { db, tables } = ctx;
  const tableIds = tables.tableIdsOf(userId);
  const blocked = tableIds.filter((id) => tables.leaveOutcome(id, userId) === 'last_referee');
  if (blocked.length > 0) {
    const names = new Intl.ListFormat('en', { type: 'conjunction' }).format(
      blocked.map((id) => tables.detail(id, 'referee').name),
    );
    throw new ApiError(
      'last_referee',
      `You are the only referee of ${names}. Make another member a referee there, or delete the table from its table menu, before you delete your profile.`,
    );
  }
  const restoreToken = ctx.users.signOut(userId);
  let characterIds: string[];
  let replaced: ReplacedReferences;
  try {
    // Every leave runs to its end before the deletion goes on or gives up, so none is left halfway.
    const leaves = await Promise.allSettled(tableIds.map((id) => tables.leave(id, userId)));
    const failed = leaves.find((result) => result.status === 'rejected');
    if (failed !== undefined) throw failed.reason;
    characterIds = db
      .all('SELECT id FROM characters WHERE owner_user_id = ?', userId)
      .map((row) => str(row, 'id'));
    replaced = deleteUserRows(db, userId);
  } catch (error) {
    restoreToken();
    throw error;
  }
  ctx.rejoin.forgetUser(userId);
  ctx.hub.closeUserEverywhere(userId);
  for (const tableId of replaced.creators) tables.broadcastTable(tableId);
  for (const tableId of replaced.declarations) ctx.game.broadcastState(tableId);
  // bxapi has no ability roll deletion. A character deletion that fails is tried again later (see BxapiJanitor).
  for (const id of characterIds) await ctx.janitor.remove('character', id);
}

/**
 * Deletes a user's rows in one transaction, after the user left every table, and replaces their references in
 * the rows of the tables that remain.
 *
 * @param db - The database.
 * @param userId - The user ID.
 */
function deleteUserRows(db: Database, userId: string): ReplacedReferences {
  return db.transaction(() => {
    const result = replaceUserReferences(db, userId);
    // Leaving cleared these already. They go here too, so no row can still name the user.
    db.run('DELETE FROM roster WHERE owner_user_id = ?', userId);
    db.run('UPDATE seats SET user_id = NULL WHERE user_id = ?', userId);
    db.run('UPDATE tables SET caller_user_id = NULL WHERE caller_user_id = ?', userId);
    db.run('DELETE FROM members WHERE user_id = ?', userId);
    db.run('DELETE FROM characters WHERE owner_user_id = ?', userId);
    db.run('DELETE FROM ability_rolls WHERE owner_user_id = ?', userId);
    // Deleting the user also deletes their retired tokens.
    db.run('DELETE FROM users WHERE id = ?', userId);
    return result;
  });
}

/**
 * Registers the user routes: `POST /api/users`, `GET`, `PATCH`, and `DELETE /api/users/me`, and
 * `POST /api/users/me/sign-out`.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerUserRoutes(app: FastifyInstance, ctx: Context): void {
  app.post('/api/users', async (request, reply) => {
    const retry = ctx.limits.createUser.take(addressKey(request.clientIp));
    if (retry > 0)
      throw rateLimited('Too many accounts created from this IP address. Try again later.', retry);
    const body = parseBody(CreateUserRequest, request);
    const created = ctx.users.create(body.name);
    request.log.info({ user: created.user.id }, 'user created');
    return reply.status(201).send(created);
  });

  app.get('/api/users/me', async (request) => ctx.auth.user(request));

  app.patch('/api/users/me', async (request) => {
    const user = ctx.auth.user(request);
    const body = parseBody(UpdateUserRequest, request);
    const updated = ctx.users.update(user.id, body);
    for (const tableId of ctx.tables.tableIdsOf(user.id)) ctx.tables.broadcastTable(tableId);
    return updated;
  });

  app.delete('/api/users/me', async (request, reply) => {
    const user = ctx.auth.user(request);
    await deleteUser(ctx, user.id);
    request.log.info({ user: user.id }, 'user deleted');
    return reply.status(204).send();
  });

  app.post('/api/users/me/sign-out', async (request, reply) => {
    const user = ctx.auth.user(request);
    ctx.users.signOut(user.id);
    // A connection authenticated with the old token, so it closes as if the token were wrong.
    ctx.hub.closeUserEverywhere(user.id);
    request.log.info({ user: user.id }, 'user signed out');
    return reply.status(204).send();
  });
}
