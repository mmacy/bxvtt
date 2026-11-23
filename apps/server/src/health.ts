import type { FastifyInstance } from 'fastify';
import type { Meta } from '@bxvtt/shared/bxapi';
import type { Health } from '@bxvtt/shared/protocol';
import { BxapiProblem } from './bxapi';
import type { Context } from './context';

/** The bxvtt server's version. */
export const SERVER_VERSION = '0.1.0';

/**
 * Checks bxapi and reports the server's health.
 *
 * @param ctx - The server's services.
 */
export async function checkHealth(ctx: Context): Promise<Health> {
  let meta: Health['bxapi']['meta'] = null;
  let error: string | null = null;
  try {
    const found = await ctx.bxapi.get<Meta>('/v1/meta');
    meta = {
      api_version: found.api_version,
      engine_version: found.engine_version,
      schema_version: found.schema_version,
      auth_enabled: found.auth_enabled,
      role: found.role,
      storage: { used_bytes: found.storage.used_bytes, max_bytes: found.storage.max_bytes ?? null },
    };
    if (found.role !== 'referee') error = 'The bxapi key has the player role. bxvtt needs a referee key.';
  } catch (caught) {
    error =
      caught instanceof BxapiProblem
        ? `bxapi answered ${caught.status} ${caught.code}.`
        : `bxapi is unreachable at ${ctx.config.bxapiUrl}. Check that bxapi is running and that BXAPI_URL is its address. In development, npm run dev:bxapi starts one.`;
  }
  return {
    status: meta !== null && error === null ? 'ok' : 'degraded',
    version: SERVER_VERSION,
    host_key_required: ctx.config.hostKey !== null,
    uptime_seconds: Math.round((Date.now() - ctx.startedAt) / 1000),
    bxapi: { reachable: meta !== null, meta, error },
  };
}

/**
 * The part of the health that anyone may read: the status, the version, whether a host key is needed, and
 * whether bxapi is reachable. bxapi's versions and storage, and the cause of a failure, go only to a user.
 *
 * @param health - The full health.
 */
export function publicHealth(health: Health): Health {
  return {
    ...health,
    bxapi: {
      reachable: health.bxapi.reachable,
      meta: null,
      error:
        health.bxapi.error === null
          ? null
          : "The server can't reach the game service right now. Ask the server host to check it.",
    },
  };
}

/**
 * Registers `GET /api/health`, which needs no token. It answers 200 when bxapi is reachable and 503 otherwise. A
 * request with a user's token gets bxapi's details too.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerHealthRoute(app: FastifyInstance, ctx: Context): void {
  app.get('/api/health', async (request, reply) => {
    const health = await checkHealth(ctx);
    const header = request.headers.authorization;
    const token = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header)?.[1] : undefined;
    // A token is optional here, so a wrong one counts as none and not as a failed sign-in.
    const user = token !== undefined && token.length <= 200 ? ctx.users.byToken(token) : null;
    return reply
      .status(health.bxapi.reachable ? 200 : 503)
      .send(user === null ? publicHealth(health) : health);
  });
}

/** The share of bxapi's storage limit past which the server warns the host. */
const STORAGE_WARNING_SHARE = 0.8;

/**
 * A warning for the host when bxapi's storage for bxvtt is over 80 percent of its limit, or `null`.
 *
 * @param health - The full health, with bxapi's storage figures.
 */
export function storageWarning(health: Health): string | null {
  const storage = health.bxapi.meta?.storage;
  if (storage === undefined || storage.max_bytes === null || storage.max_bytes <= 0) return null;
  const share = storage.used_bytes / storage.max_bytes;
  if (share < STORAGE_WARNING_SHARE) return null;
  const percent = Math.round(share * 100);
  return `bxapi's storage for bxvtt is ${percent} percent full (${storage.used_bytes} of ${storage.max_bytes} bytes). When it is full, nobody can create characters, start games, send commands, or save. Delete old tables and saves, or raise BXAPI_MAX_CLIENT_BYTES.`;
}

/**
 * Checks bxapi's storage now and every `intervalMs`, and logs a warning while it is over 80 percent full.
 *
 * The timer doesn't keep the process alive. Call it after the server listens.
 *
 * @param app - The Fastify instance, whose logger it uses.
 * @param ctx - The server's services.
 * @param intervalMs - How often to check.
 * @returns A function that stops the checks.
 */
export function watchStorage(app: FastifyInstance, ctx: Context, intervalMs = 10 * 60_000): () => void {
  const check = async () => {
    const warning = storageWarning(await checkHealth(ctx));
    if (warning !== null) app.log.warn(warning);
  };
  void check();
  const timer = setInterval(() => void check(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
