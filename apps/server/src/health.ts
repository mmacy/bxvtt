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
        : 'bxapi is unreachable. Start it with scripts/dev-bxapi.sh or check BXAPI_URL.';
  }
  return {
    status: meta !== null && error === null ? 'ok' : 'degraded',
    version: SERVER_VERSION,
    uptime_seconds: Math.round((Date.now() - ctx.startedAt) / 1000),
    bxapi: { reachable: meta !== null, meta, error },
  };
}

/**
 * Registers `GET /api/health`, which needs no token. It answers 200 when bxapi is reachable and 503 otherwise.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerHealthRoute(app: FastifyInstance, ctx: Context): void {
  app.get('/api/health', async (_request, reply) => {
    const health = await checkHealth(ctx);
    return reply.status(health.bxapi.reachable ? 200 : 503).send(health);
  });
}
