import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import type { ServerMessage, User } from '@bxvtt/shared/protocol';
import { ClientMessage, LIMITS, WS_CLOSE_CODES, WS_PATH } from '@bxvtt/shared/protocol';
import { levelAnnotations } from './annotations';
import type { Config } from './config';
import type { Context } from './context';
import { ApiError } from './errors';
import type { Connection } from './hub';
import { now } from './ids';
import { readNotes } from './notes';
import { addressKey, RateLimiter } from './util';

/** How long a client has to send its `auth` message after the socket opens. */
const AUTH_TIMEOUT_MS = 10_000;
/** How often the server pings each socket, and how long a socket may go without answering. */
const PING_INTERVAL_MS = 30_000;

/**
 * Decides whether a WebSocket handshake's `Origin` may connect: the server's own origin, any `localhost` or
 * loopback origin, and the origins in `BXVTT_PUBLIC_ORIGINS`. A request with no `Origin` comes from a program
 * rather than a browser page, and it still has to authenticate.
 *
 * @param origin - The `Origin` header.
 * @param host - The `Host` header.
 * @param config - The server's settings.
 */
export function originAllowed(origin: string | undefined, host: string | undefined, config: Config): boolean {
  if (origin === undefined) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (host !== undefined && url.host.toLowerCase() === host.toLowerCase()) return true;
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())) return true;
  return config.publicOrigins.includes(url.origin);
}

/**
 * Builds the snapshot of a table for one user: the table, presence, the game and declarations for the user's
 * role, the feed since `feedAfter` (or its newest page), the annotations of the party's level, and the notes.
 *
 * @param ctx - The server's services.
 * @param tableId - The table ID.
 * @param user - The user.
 * @param feedAfter - The `seq` of the last feed entry the client has.
 */
export async function buildSnapshot(
  ctx: Context,
  tableId: string,
  user: User,
  feedAfter: number | undefined,
): Promise<ServerMessage> {
  return ctx.game.locked(tableId, async () => {
    const role = ctx.tables.roleOf(tableId, user.id);
    if (role === null) throw new ApiError('not_found', 'The user is not a member of the table.');
    const live = await ctx.game.current(tableId);
    const game = live === null ? null : await ctx.game.project(live, role);
    const location = live?.view.location;
    return {
      type: 'snapshot',
      user,
      role,
      table: ctx.tables.detail(tableId),
      presence: ctx.hub.presence(tableId),
      game,
      declarations: live === null ? null : ctx.game.battle.state(live),
      feed: ctx.feed.page(
        tableId,
        user.id,
        role,
        feedAfter === undefined ? { limit: 50 } : { after: feedAfter, limit: LIMITS.feedPage },
      ),
      annotations:
        location?.kind === 'dungeon' && location.dungeon_id != null && location.level_number != null
          ? levelAnnotations(
              ctx,
              tableId,
              { dungeon_id: location.dungeon_id, level_number: location.level_number },
              role,
            )
          : null,
      notes: {
        party: readNotes(ctx, tableId, 'party'),
        referee: role === 'referee' ? readNotes(ctx, tableId, 'referee') : null,
      },
      server_time: now(),
    };
  });
}

/**
 * Registers the WebSocket endpoint at `/ws`. The client authenticates with its first message, then receives a
 * snapshot and a message for each change. The server checks the handshake's `Origin`, limits message sizes and
 * rates, and pings each socket to find dead connections.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerWebSocket(app: FastifyInstance, ctx: Context): void {
  const alive = new WeakMap<WebSocket, boolean>();
  const sockets = new Set<WebSocket>();
  const pinger = setInterval(() => {
    for (const socket of sockets) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, PING_INTERVAL_MS);
  pinger.unref();
  app.addHook('onClose', async () => clearInterval(pinger));

  const checkOrigin = async (request: FastifyRequest) => {
    if (!originAllowed(request.headers.origin, request.headers.host, ctx.config)) {
      request.log.warn({ origin: request.headers.origin }, 'WebSocket origin refused');
      throw new ApiError('forbidden', 'This origin may not open the bxvtt WebSocket.');
    }
  };

  // Sockets that haven't authenticated yet, by address key.
  const pendingByAddress = new Map<string, number>();

  app.get(WS_PATH, { websocket: true, preValidation: checkOrigin }, (socket, request) => {
    sockets.add(socket);
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));
    let connection: Connection | null = null;
    let user: User | null = null;
    const messages = new RateLimiter({ capacity: 40, windowMs: 2000 });
    const pings = new RateLimiter({ capacity: 5, windowMs: 2000 });
    const resyncs = new RateLimiter({ capacity: 3, windowMs: 10_000 });
    const addressId = addressKey(request.clientIp);
    let pending = true;
    const settle = () => {
      if (!pending) return;
      pending = false;
      const left = (pendingByAddress.get(addressId) ?? 1) - 1;
      if (left <= 0) pendingByAddress.delete(addressId);
      else pendingByAddress.set(addressId, left);
    };
    const waiting = (pendingByAddress.get(addressId) ?? 0) + 1;
    pendingByAddress.set(addressId, waiting);
    if (waiting > ctx.config.quotas.pendingSocketsPerAddress) {
      settle();
      socket.close(WS_CLOSE_CODES.rate_limited, 'too many sockets waiting to authenticate');
      sockets.delete(socket);
      return;
    }
    const authTimer = setTimeout(
      () => socket.close(WS_CLOSE_CODES.auth_failed, 'no auth message'),
      AUTH_TIMEOUT_MS,
    );
    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const fail = (code: string, detail: string) => send({ type: 'error', code, detail });

    const authenticate = async (token: string, tableId: string, feedAfter: number | undefined) => {
      let found: User | null;
      try {
        found = ctx.auth.authenticate(token, request.clientIp);
      } catch (error) {
        fail('rate_limited', error instanceof Error ? error.message : 'Too many attempts.');
        socket.close(WS_CLOSE_CODES.rate_limited, 'rate limited');
        return;
      }
      if (found === null || ctx.tables.roleOf(tableId, found.id) === null) {
        fail('unauthorized', 'The token is unknown, or the user is not a member of the table.');
        socket.close(WS_CLOSE_CODES.auth_failed, 'auth failed');
        return;
      }
      if (ctx.hub.connectionsOf(tableId, found.id) >= ctx.config.quotas.connectionsPerUser) {
        fail('rate_limited', 'You have too many connections to this table. Close a tab and try again.');
        socket.close(WS_CLOSE_CODES.rate_limited, 'too many connections');
        return;
      }
      user = found;
      connection = ctx.hub.add(socket, tableId, found.id);
      await deliverSnapshot(connection, found, feedAfter);
    };

    const deliverSnapshot = async (target: Connection, owner: User, feedAfter: number | undefined) => {
      ctx.hub.hold(target);
      try {
        ctx.hub.activate(target, await buildSnapshot(ctx, target.tableId, owner, feedAfter));
      } catch (error) {
        request.log.warn({ err: error, table: target.tableId }, 'could not build a snapshot');
        fail('bxapi_unavailable', "The server can't read the game now. It will try again.");
        socket.close(WS_CLOSE_CODES.try_again_later, 'snapshot failed');
      }
    };

    socket.on('message', (data: RawData, isBinary: boolean) => {
      const size = Array.isArray(data) ? data.reduce((sum, part) => sum + part.length, 0) : data.byteLength;
      if (isBinary || size > LIMITS.wsMessageBytes) {
        socket.close(WS_CLOSE_CODES.message_too_large, 'message too large or binary');
        return;
      }
      if (messages.take('socket') > 0) {
        socket.close(WS_CLOSE_CODES.rate_limited, 'too many messages');
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      } catch {
        fail('bad_request', 'A message must be one JSON object.');
        return;
      }
      const result = ClientMessage.safeParse(parsed);
      if (!result.success) {
        fail('validation_error', "The message doesn't match any client message schema.");
        return;
      }
      const message = result.data;
      if (connection === null || user === null) {
        if (message.type !== 'auth') {
          fail('unauthorized', 'Send an auth message first.');
          socket.close(WS_CLOSE_CODES.auth_failed, 'auth expected');
          return;
        }
        clearTimeout(authTimer);
        settle();
        void authenticate(message.token, message.table_id, message.feed_after);
        return;
      }
      const current = connection;
      // A member removed a moment ago may still have frames in flight. They go nowhere.
      const role = ctx.tables.roleOf(current.tableId, current.userId);
      if (role === null) return;
      switch (message.type) {
        case 'auth':
          fail('bad_request', 'The connection is already authenticated.');
          return;
        case 'heartbeat':
          send({ type: 'heartbeat', server_time: now() });
          return;
        case 'resync':
          // Each snapshot reads the game under the table's lock, so a client may ask only now and then.
          if (resyncs.take('socket') > 0) {
            fail('rate_limited', 'Ask for a new snapshot less often.');
            return;
          }
          void deliverSnapshot(current, user, message.feed_after);
          return;
        case 'ping': {
          if (pings.take('socket') > 0) {
            fail('rate_limited', 'Ping less often.');
            return;
          }
          const { type: _type, ...ping } = message;
          const out = { type: 'ping' as const, ...ping, user_id: current.userId, at: now() };
          // A player sees a ping only on a level the party has mapped, like the annotations there.
          const known = ctx.game.levelKnown(current.tableId, ping);
          ctx.hub.send(current.tableId, (recipient) => (recipient.role === 'referee' || known ? out : null));
          return;
        }
      }
    });

    socket.on('close', () => {
      settle();
      clearTimeout(authTimer);
      sockets.delete(socket);
      if (connection !== null) ctx.hub.remove(connection);
    });
  });
}
