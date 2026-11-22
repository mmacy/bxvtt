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
      error: health.bxapi.error === null ? null : "bxvtt can't use bxapi, the rules server, now.",
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
