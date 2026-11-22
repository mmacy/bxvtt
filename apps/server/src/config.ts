import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Limits for one kind of request from one network address: `capacity` requests per `windowMs`. */
export interface RateLimit {
  capacity: number;
  windowMs: number;
}

/** The server's settings. {@link loadConfig} reads them from the environment. */
export interface Config {
  /** Address to listen on. */
  host: string;
  /** Port to listen on. 0 picks a free port. */
  port: number;
  /** Directory for the SQLite database. */
  dataDir: string;
  /** Base URL of bxapi. */
  bxapiUrl: string;
  /** A bxapi key with the referee role, or `null` for a bxapi in anonymous mode. */
  bxapiKey: string | null;
  /** The key a user must present to create a table, or `null` when anyone may. */
  hostKey: string | null;
  /** Extra origins that may open the WebSocket. */
  publicOrigins: string[];
  /** Directory of the built web client, or `null` when it isn't built. */
  webDist: string | null;
  /** Directory of the sample adventure documents. */
  adventuresDir: string;
  /** pino log level, such as `info` or `silent`. */
  logLevel: string;
  /** Whether users may pass `seed` when they roll abilities or create characters. For tests and development. */
  allowCharacterSeeds: boolean;
  /** Per-address rate limits. */
  rateLimits: {
    createUser: RateLimit;
    join: RateLimit;
    failedAuth: RateLimit;
  };
  /** How long a bxapi request may take before the server gives up, in milliseconds. */
  bxapiTimeoutMs: number;
}

/** The default bxapi URL. Development scripts set `BXAPI_URL` to the development bxapi instead. */
export const DEFAULT_BXAPI_URL = 'http://127.0.0.1:8640';

/**
 * Finds the repository root: the nearest directory above this module whose `package.json` declares workspaces.
 *
 * @returns The repository root, or the current directory when none is found.
 */
export function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (parsed.workspaces !== undefined) return dir;
      } catch {
        // Keep looking above a manifest that isn't JSON.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/**
 * Reads the server's settings from environment variables. Relative paths resolve against the repository root.
 *
 * @param env - The environment, usually `process.env`.
 * @returns The settings.
 * @throws Error when a setting has a value the server can't use. The message names the variable.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const root = findRepoRoot();
  const path = (value: string) => (isAbsolute(value) ? value : resolve(root, value));
  const port = Number(env.BXVTT_PORT ?? 8660);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('BXVTT_PORT must be an integer from 0 to 65535.');
  }
  const bxapiUrl = (env.BXAPI_URL ?? DEFAULT_BXAPI_URL).replace(/\/$/, '');
  try {
    new URL(bxapiUrl);
  } catch {
    throw new Error('BXAPI_URL must be an absolute URL, such as http://127.0.0.1:8651.');
  }
  const publicOrigins = (env.BXVTT_PUBLIC_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin !== '');
  for (const origin of publicOrigins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('BXVTT_PUBLIC_ORIGINS must list origins such as https://table.example.');
    }
    if (parsed.origin !== origin) {
      throw new Error('BXVTT_PUBLIC_ORIGINS must list origins with no path, such as https://table.example.');
    }
  }
  const webDist = path(env.BXVTT_WEB_DIST ?? 'apps/web/dist');
  return {
    host: env.BXVTT_HOST ?? '127.0.0.1',
    port,
    dataDir: path(env.BXVTT_DATA_DIR ?? '.data'),
    bxapiUrl,
    bxapiKey: nonEmpty(env.BXAPI_KEY),
    hostKey: nonEmpty(env.BXVTT_HOST_KEY),
    publicOrigins,
    webDist: existsSync(join(webDist, 'index.html')) ? webDist : null,
    adventuresDir: path(env.BXVTT_ADVENTURES_DIR ?? 'adventures'),
    logLevel: env.BXVTT_LOG_LEVEL ?? 'info',
    allowCharacterSeeds: env.BXVTT_ALLOW_CHARACTER_SEEDS === 'true',
    rateLimits: {
      createUser: { capacity: 10, windowMs: 10 * 60_000 },
      join: { capacity: 20, windowMs: 10 * 60_000 },
      failedAuth: { capacity: 30, windowMs: 10 * 60_000 },
    },
    bxapiTimeoutMs: 15_000,
  };
}

/** Returns the value, or `null` when it's missing or empty. */
function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}
