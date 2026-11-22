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
    if (user === null) throw new ApiError('unauthorized', 'The user no longer exists.');
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

/**
 * Registers the user routes: `POST /api/users`, `GET /api/users/me`, and `PATCH /api/users/me`.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerUserRoutes(app: FastifyInstance, ctx: Context): void {
  app.post('/api/users', async (request, reply) => {
    const retry = ctx.limits.createUser.take(addressKey(request.clientIp));
    if (retry > 0) throw rateLimited('This address has created too many users. Try again later.', retry);
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
}
