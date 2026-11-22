import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OUTPUT_DIR, SCREENS_DIR, SERVER_URL } from './env';
import { STATE_ENV, serverCommand, serverEnv, spawnServer, waitForHealth, writeState } from './server';

/**
 * Starts the bxvtt server for the run with a fresh temporary data directory, and tells the workers where its
 * state file is. Playwright's `webServer` starts the Vite client separately in development mode.
 */
export default async function globalSetup(): Promise<void> {
  const inUse = await fetch(`${SERVER_URL}/api/health`).then(
    () => true,
    () => false,
  );
  if (inUse) {
    throw new Error(
      `Something already listens on ${SERVER_URL}. Stop it, or set E2E_SERVER_PORT to a free port.`,
    );
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(SCREENS_DIR, { recursive: true });
  const dataDir = mkdtempSync(join(tmpdir(), 'bxvtt-e2e-'));
  const logFile = join(OUTPUT_DIR, `server-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const command = serverCommand();
  const env = serverEnv(dataDir);
  const pid = spawnServer(command, env, logFile);
  const stateFile = join(dataDir, 'server-state.json');
  writeState(stateFile, { pid, dataDir, logFile, command, env });
  process.env[STATE_ENV] = stateFile;
  await waitForHealth(logFile);
}
