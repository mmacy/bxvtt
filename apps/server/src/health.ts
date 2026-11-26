import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Meta } from '@bxvtt/shared/bxapi';
import type { Health } from '@bxvtt/shared/protocol';
import { BxapiProblem } from './bxapi';
import { findRepoRoot } from './config';
import type { Context } from './context';

/**
 * The bxvtt server's version: the root `package.json` version, read once at startup. The web build reads the same
 * file, so one file versions a release.
 */
export const SERVER_VERSION = (
  JSON.parse(readFileSync(join(findRepoRoot(), 'package.json'), 'utf8')) as { version: string }
).version;

/**
 * The oldest osrlib that bxapi may run for bxvtt. Since osrlib 2.8, bxapi refuses a command's target when the
 * player view doesn't list it, so bxvtt forwards a player's targets without a check of its own. With an older
 * engine, a player could aim a spell or an item at any creature of the session outside a battle. The client also
 * reads view fields that osrlib 2.8 added, such as `item_names`, `features_here`, and `MapFeatureView.emptied`.
 * Since osrlib 2.9, bxapi takes a table's `ruleset` for ability rolls and character creation, with the
 * `ability_score_method` and `max_hp_at_first_level` house rules, and reports a sub-par roll, which the table
 * rules need.
 */
export const MIN_ENGINE_VERSION = '2.9.0';

/**
 * Whether a dotted numeric version, such as `2.10.0`, is at least another. Missing parts count as zero, so `2.8`
 * equals `2.8.0`. A version that isn't dotted numbers, such as `2.8.0rc1` or an empty string, counts as too old.
 *
 * @param version - The version to check.
 * @param minimum - The oldest version that passes.
 */
export function versionAtLeast(version: string, minimum: string): boolean {
  const parse = (text: string): number[] | null =>
    /^\d+(?:\.\d+)*$/.test(text) ? text.split('.').map(Number) : null;
  const have = parse(version.trim());
  const need = parse(minimum);
  if (have === null || need === null) return false;
  for (let index = 0; index < Math.max(have.length, need.length); index += 1) {
    const a = have[index] ?? 0;
    const b = need[index] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/**
 * The message for the server host when bxapi's engine is older than bxvtt needs, or `null` when it is new enough.
 *
 * @param engineVersion - bxapi's `engine_version`.
 */
export function engineTooOldMessage(engineVersion: string): string | null {
  if (versionAtLeast(engineVersion, MIN_ENGINE_VERSION)) return null;
  return `bxapi runs osrlib ${engineVersion}, and bxvtt needs ${MIN_ENGINE_VERSION} or later. If you host this server, update bxapi and restart it. Otherwise, ask the server host to update it.`;
}

/**
 * Checks bxapi and reports the server's health. It also records bxapi's engine version in `ctx.engine`, so the
 * game service can refuse games on an engine that is too old without asking bxapi on every command.
 *
 * @param ctx - The server's services.
 */
export async function checkHealth(ctx: Context): Promise<Health> {
  let meta: Health['bxapi']['meta'] = null;
  let error: string | null;
  let outdated = false;
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
    ctx.engine = {
      checked: true,
      version: found.engine_version,
      tooOld: !versionAtLeast(found.engine_version, MIN_ENGINE_VERSION),
    };
    outdated = ctx.engine.tooOld;
    if (found.role !== 'referee') error = 'The bxapi key has the player role. bxvtt needs a referee key.';
    else error = engineTooOldMessage(found.engine_version);
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
    bxapi: { reachable: meta !== null, outdated, meta, error },
  };
}

/**
 * The part of the health that anyone may read: the status, the version, whether a host key is needed, and
 * whether bxapi is reachable and up to date. bxapi's versions and storage, and the cause of a failure, go only to a user.
 *
 * @param health - The full health.
 */
export function publicHealth(health: Health): Health {
  return {
    ...health,
    bxapi: {
      reachable: health.bxapi.reachable,
      outdated: health.bxapi.outdated,
      meta: null,
      error:
        health.bxapi.error === null
          ? null
          : health.bxapi.reachable
            ? "The game service isn't set up correctly. Ask the server host to fix it."
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
