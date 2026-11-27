import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './env';
import { STATE_ENV, readState, stopProcess } from './server';

/**
 * Stops the server the global setup started, deletes the games, saves, adventures, and characters it stored in
 * bxapi, and removes its data directory. With `E2E_KEEP_DATA=1`, it keeps both for a look after the run.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env[STATE_ENV] === undefined) return;
  const state = readState();
  await stopProcess(state.pid);
  if (process.env.E2E_KEEP_DATA === '1') return;
  try {
    execFileSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', resolve(REPO_ROOT, 'scripts/purge-bxapi.mjs'), state.dataDir],
      {
        env: { ...process.env, ...state.env },
        stdio: 'inherit',
      },
    );
  } catch {
    // The script reported what it couldn't delete. The run's result doesn't depend on it.
  }
  rmSync(state.dataDir, { recursive: true, force: true });
}
