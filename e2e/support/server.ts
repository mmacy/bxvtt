/**
 * Starts, stops, and restarts the bxvtt server that the suite plays against. The global setup starts it once per
 * run with a fresh data directory. The resilience spec restarts it in the middle of a game, so the server runs as
 * a child process whose ID and settings live in a state file that every worker can read.
 */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BXAPI_URL, OUTPUT_DIR, PROD, REPO_ROOT, SERVER_PORT, SERVER_URL } from './env';

/** What a worker needs to find and restart the server. */
export interface ServerState {
  pid: number;
  dataDir: string;
  logFile: string;
  command: string[];
  env: Record<string, string>;
}

/** The environment variable that names the state file. The global setup sets it for the workers. */
export const STATE_ENV = 'E2E_SERVER_STATE';

/** The server's settings for a run. */
export function serverEnv(dataDir: string): Record<string, string> {
  const env: Record<string, string> = {
    BXVTT_PORT: String(SERVER_PORT),
    BXVTT_HOST: '127.0.0.1',
    BXVTT_DATA_DIR: dataDir,
    BXAPI_URL,
    BXVTT_RELAX_LIMITS: 'true',
    BXVTT_ALLOW_CHARACTER_SEEDS: 'true',
    BXVTT_LOG_LEVEL: process.env.E2E_SERVER_LOG_LEVEL ?? 'warn',
  };
  if (PROD) {
    env.BXVTT_WEB_DIST = resolve(REPO_ROOT, process.env.E2E_WEB_DIST ?? 'apps/web/dist');
  } else {
    // The development client comes from Vite, so make sure the server never serves a stale build.
    env.BXVTT_WEB_DIST = join(dataDir, 'no-web-dist');
  }
  return env;
}

/** The command that runs the server: the built bundle in production mode, the TypeScript source otherwise. */
export function serverCommand(): string[] {
  if (PROD) {
    const entry = resolve(REPO_ROOT, process.env.E2E_SERVER_ENTRY ?? 'apps/server/dist/main.js');
    return [process.execPath, '--disable-warning=ExperimentalWarning', entry];
  }
  return [
    process.execPath,
    '--import',
    'tsx',
    '--disable-warning=ExperimentalWarning',
    resolve(REPO_ROOT, 'apps/server/src/main.ts'),
  ];
}

/** Spawns the server detached, appending its output to the log file, and returns its process ID. */
export function spawnServer(command: string[], env: Record<string, string>, logFile: string): number {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const out = openSync(logFile, 'a');
  const [file, ...args] = command;
  if (file === undefined) throw new Error('The server command is empty.');
  const child = spawn(file, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', out, out],
    detached: true,
  });
  closeSync(out);
  child.unref();
  if (child.pid === undefined) throw new Error('The bxvtt server did not start.');
  return child.pid;
}

/** Waits until the server's health check answers, or throws with the end of the log. */
export async function waitForHealth(logFile: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SERVER_URL}/api/health`);
      if (response.ok) {
        const body = (await response.json()) as { bxapi?: { reachable?: boolean } };
        if (body.bxapi?.reachable === true) return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf8').slice(-4000) : '(no log)';
  throw new Error(`The bxvtt server on ${SERVER_URL} did not become healthy. Log:\n${log}`);
}

/** Whether a process is running. */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Stops a process this suite started, by its ID, and waits for it to exit. */
export async function stopProcess(pid: number, timeoutMs = 15_000): Promise<void> {
  if (!isRunning(pid)) return;
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + timeoutMs;
  while (isRunning(pid) && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (isRunning(pid)) process.kill(pid, 'SIGKILL');
}

/** Reads the state file that the global setup wrote. */
export function readState(): ServerState {
  const file = process.env[STATE_ENV];
  if (file === undefined) throw new Error(`${STATE_ENV} is unset. Run the suite through Playwright.`);
  return JSON.parse(readFileSync(file, 'utf8')) as ServerState;
}

/** Writes the state file. */
export function writeState(file: string, state: ServerState): void {
  writeFileSync(file, JSON.stringify(state, null, 2));
}

/**
 * Stops the server and starts it again with the same data directory and settings, then waits for it to answer.
 * The resilience spec calls it in the middle of a game.
 *
 * @param downMs - How long the server stays down, so clients see the drop.
 */
export async function restartServer(downMs = 1500): Promise<void> {
  const file = process.env[STATE_ENV];
  if (file === undefined) throw new Error(`${STATE_ENV} is unset. Run the suite through Playwright.`);
  const state = readState();
  await stopProcess(state.pid);
  await new Promise((resolveWait) => setTimeout(resolveWait, downMs));
  const pid = spawnServer(state.command, state.env, state.logFile);
  writeState(file, { ...state, pid });
  await waitForHealth(state.logFile);
}
