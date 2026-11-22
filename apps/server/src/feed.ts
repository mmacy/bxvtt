import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  DiceRollResponse,
  FeedEntry,
  FeedPage,
  FeedVisibility,
  Role,
  SystemNoticeCode,
  User,
} from '@bxvtt/shared/protocol';
import { FeedQuery, LIMITS, parseRollCommand, PostFeedRequest } from '@bxvtt/shared/protocol';
import { callBxapi } from './bxapi';
import type { Context } from './context';
import type { Row } from './db';
import { json, num, str, strOrNull } from './db';
import { ApiError, parseBody, parseQuery } from './errors';
import { now } from './ids';
import { rateLimited } from './auth';

/** The fields every feed entry has, which the store fills in. */
type BaseField = 'seq' | 'created_at' | 'user_id' | 'visibility' | 'to';
/** The kind-specific fields of a feed entry, without the fields every entry has. */
export type EntryBody = FeedEntry extends infer Entry
  ? Entry extends FeedEntry
    ? Omit<Entry, BaseField>
    : never
  : never;

/** A new feed entry. `referee` is a fuller copy that referees read instead of `body`. */
export interface NewFeedEntry {
  userId: string | null;
  visibility: FeedVisibility;
  to?: string[];
  body: EntryBody;
  referee?: EntryBody;
}

/** The path parameters of a feed route. */
const TableParams = z.object({ tableId: z.string() });

/**
 * Whether a reader may see a feed entry.
 *
 * @param visibility - The entry's visibility.
 * @param to - The whisper recipients.
 * @param authorId - The entry's author.
 * @param userId - The reader.
 * @param role - The reader's role.
 */
export function canSeeEntry(
  visibility: FeedVisibility,
  to: string[],
  authorId: string | null,
  userId: string,
  role: Role,
): boolean {
  if (visibility === 'everyone') return true;
  if (visibility === 'referees') return role === 'referee';
  return authorId === userId || to.includes(userId);
}

/**
 * The table's feed: one persisted, chronological log of chat, whispers, dice rolls, game results, and system
 * notices. It stores a player copy and a referee copy of each game entry, and serves each reader the copy their
 * role may read.
 */
export class FeedStore {
  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Stores an entry and sends it to every connection that may read it.
   *
   * @param tableId - The table ID.
   * @param entry - The entry.
   * @returns The stored entry's `seq`.
   */
  append(tableId: string, entry: NewFeedEntry): number {
    const to = entry.to ?? [];
    const createdAt = now();
    this.ctx.db.run(
      `INSERT INTO feed (table_id, kind, user_id, visibility, to_json, created_at, data_json, referee_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      tableId,
      entry.body.kind,
      entry.userId,
      entry.visibility,
      JSON.stringify(to),
      createdAt,
      JSON.stringify(entry.body),
      entry.referee === undefined ? null : JSON.stringify(entry.referee),
    );
    const seq = num(this.ctx.db.get('SELECT last_insert_rowid() AS seq') ?? { seq: 0 }, 'seq');
    const base = { seq, created_at: createdAt, user_id: entry.userId, visibility: entry.visibility, to };
    this.ctx.hub.send(tableId, ({ userId, role }) => {
      if (!canSeeEntry(entry.visibility, to, entry.userId, userId, role)) return null;
      const body = role === 'referee' && entry.referee !== undefined ? entry.referee : entry.body;
      return { type: 'feed', entry: { ...base, ...body } as FeedEntry };
    });
    return seq;
  }

  /**
   * Adds a system notice that everyone at the table sees.
   *
   * @param tableId - The table ID.
   * @param userId - The user whose action caused it, or `null`.
   * @param code - What happened.
   * @param params - IDs and labels for the client's sentence.
   */
  system(
    tableId: string,
    userId: string | null,
    code: SystemNoticeCode,
    params: Record<string, string | number | boolean | null>,
  ): void {
    this.append(tableId, { userId, visibility: 'everyone', body: { kind: 'system', code, params } });
  }

  /**
   * Reads a page of the feed for one reader.
   *
   * @param tableId - The table ID.
   * @param userId - The reader.
   * @param role - The reader's role.
   * @param query - `after` or `before`, and `limit`.
   */
  page(tableId: string, userId: string, role: Role, query: FeedQuery): FeedPage {
    const limit = query.limit ?? 50;
    const visible = `(f.visibility = 'everyone'
      OR (f.visibility = 'referees' AND :is_referee = 1)
      OR (f.visibility = 'users' AND (f.user_id = :user_id
          OR EXISTS (SELECT 1 FROM json_each(f.to_json) WHERE value = :user_id))))`;
    const params = {
      table_id: tableId,
      user_id: userId,
      is_referee: role === 'referee' ? 1 : 0,
      limit: limit + 1,
    };
    let rows: Row[];
    if (query.after !== undefined) {
      rows = this.ctx.db.allNamed(
        `SELECT * FROM feed f WHERE f.table_id = :table_id AND f.seq > :after AND ${visible}
         ORDER BY f.seq LIMIT :limit`,
        { ...params, after: query.after },
      );
    } else {
      rows = this.ctx.db
        .allNamed(
          `SELECT * FROM feed f WHERE f.table_id = :table_id AND f.seq < :before AND ${visible}
           ORDER BY f.seq DESC LIMIT :limit`,
          { ...params, before: query.before ?? Number.MAX_SAFE_INTEGER },
        )
        .reverse();
    }
    const hasMore = rows.length > limit;
    if (hasMore) {
      if (query.after !== undefined) rows = rows.slice(0, limit);
      else rows = rows.slice(1);
    }
    return { entries: rows.map((row) => this.toEntry(row, role)), has_more: hasMore };
  }

  private toEntry(row: Row, role: Role): FeedEntry {
    const refereeJson = strOrNull(row, 'referee_json');
    const body =
      role === 'referee' && refereeJson !== null ? JSON.parse(refereeJson) : json(row, 'data_json');
    return {
      seq: num(row, 'seq'),
      created_at: str(row, 'created_at'),
      user_id: strOrNull(row, 'user_id'),
      visibility: str(row, 'visibility') as FeedVisibility,
      to: json<string[]>(row, 'to_json'),
      ...(body as EntryBody),
    } as FeedEntry;
  }

  /**
   * Posts a message from a member: chat, a whisper, or a dice roll.
   *
   * @param tableId - The table ID.
   * @param user - The author.
   * @param role - The author's role.
   * @param request - The parsed body.
   * @param requestId - The request ID, for bxapi's log.
   * @returns The stored entry, as the author sees it.
   */
  async post(
    tableId: string,
    user: User,
    role: Role,
    request: PostFeedRequest,
    requestId: string,
  ): Promise<FeedEntry> {
    const to = request.to === undefined ? [] : [...new Set(request.to)].filter((id) => id !== user.id);
    for (const recipient of to) {
      if (this.ctx.tables.roleOf(tableId, recipient) === null) {
        throw new ApiError('validation_error', 'A whisper can only go to members of the table.', {
          errors: [{ path: ['to'], message: `${recipient} isn't a member of the table` }],
        });
      }
    }
    if (request.to !== undefined && to.length === 0) {
      throw new ApiError('validation_error', 'Name at least one other member to whisper to.', {
        errors: [{ path: ['to'], message: 'must name another member' }],
      });
    }
    const roll = parseRollCommand(request.text);
    const secret = request.secret === true || roll?.secret === true;
    if (secret && roll === null) {
      throw new ApiError('validation_error', 'Only a dice roll can be secret.', {
        errors: [{ path: ['secret'], message: 'only a /roll message can be secret' }],
      });
    }
    if (secret && role !== 'referee') {
      throw new ApiError('referee_required', 'Only a referee can roll in secret.');
    }
    const visibility: FeedVisibility = to.length > 0 ? 'users' : secret ? 'referees' : 'everyone';
    let body: EntryBody;
    if (roll !== null) {
      const result = await callBxapi(() =>
        this.ctx.bxapi.post<DiceRollResponse>(
          '/v1/dice/roll',
          { expression: roll.expression },
          { requestId },
        ),
      );
      const first = result.rolls[0];
      body = {
        kind: 'roll',
        expression: result.expression,
        comment: roll.comment.slice(0, LIMITS.feedText),
        total: first?.total ?? 0,
        rolls: result.rolls,
        seed: result.seed,
        secret,
      };
    } else {
      body = { kind: 'chat', text: request.text };
    }
    const seq = this.append(tableId, { userId: user.id, visibility, to, body });
    const entry = this.page(tableId, user.id, role, { after: seq - 1, limit: 1 }).entries[0];
    if (entry === undefined) throw new Error('The feed entry just written is missing.');
    return entry;
  }
}

/**
 * Registers the feed routes: `GET` and `POST /api/tables/{table_id}/feed`.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerFeedRoutes(app: FastifyInstance, ctx: Context): void {
  app.get('/api/tables/:tableId/feed', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    return ctx.feed.page(tableId, user.id, role, parseQuery(FeedQuery, request));
  });

  app.post('/api/tables/:tableId/feed', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    const body = parseBody(PostFeedRequest, request);
    const retry = ctx.limits.userPosts.take(user.id);
    if (retry > 0) throw rateLimited('You are posting too fast. Wait a moment.', retry);
    return reply.status(201).send(await ctx.feed.post(tableId, user, role, body, request.id));
  });
}
