import { rmSync } from 'node:fs';
import { STATE_ENV, readState, stopProcess } from './server';

/** Stops the server the global setup started and removes its data directory. */
export default async function globalTeardown(): Promise<void> {
  if (process.env[STATE_ENV] === undefined) return;
  const state = readState();
  await stopProcess(state.pid);
  if (process.env.E2E_KEEP_DATA !== '1') rmSync(state.dataDir, { recursive: true, force: true });
}
