/**
 * A server with `BXVTT_HOST_KEY` set: the home page shows the host key field before the first attempt, and
 * creating a table needs the key. The spec starts a second bxvtt server of its own, with its own data directory,
 * on `E2E_HOST_KEY_PORT` (8689 by default), and stops it when the spec ends.
 *
 * That server serves a built client, because Vite proxies only to the suite's own server. In production mode the
 * spec uses the suite's build. In development mode `apps/web/dist` may be older than the source, so the spec runs
 * only when `E2E_WEB_DIST` names a build, and skips otherwise. Build a private copy as `e2e/README.md` describes
 * and pass it with `E2E_WEB_DIST`.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OUTPUT_DIR, PROD, REPO_ROOT } from './support/env';
import { expect, test } from './support/fixtures';
import { serverCommand, serverEnv, spawnServer, stopProcess } from './support/server';

const PORT = Number(process.env.E2E_HOST_KEY_PORT ?? 8689);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HOST_KEY = 'lantern-of-hollin-ferry';
const WEB_DIST = resolve(REPO_ROOT, process.env.E2E_WEB_DIST ?? 'apps/web/dist');
const HAS_BUILD =
  (PROD || process.env.E2E_WEB_DIST !== undefined) && existsSync(join(WEB_DIST, 'index.html'));

let pid: number | null = null;
let dataDir: string | null = null;

/** Waits until the second server answers its health check, or throws with the log's path. */
async function waitForSecondServer(logFile: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${ORIGIN}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`The host key server on ${ORIGIN} did not start. See ${logFile}.`);
}

test.describe('host key', () => {
  test.skip(
    !HAS_BUILD,
    'The host key server serves a built client. In development mode, build one and pass it with E2E_WEB_DIST.',
  );

  test.beforeAll(async () => {
    let taken = false;
    try {
      await fetch(`${ORIGIN}/api/health`);
      taken = true;
    } catch {
      // Nothing listens there, as it should be.
    }
    if (taken)
      throw new Error(`Something already listens on port ${PORT}. Set E2E_HOST_KEY_PORT to a free port.`);
    dataDir = mkdtempSync(join(tmpdir(), 'bxvtt-e2e-host-key-'));
    const env = {
      ...serverEnv(dataDir),
      BXVTT_PORT: String(PORT),
      BXVTT_WEB_DIST: WEB_DIST,
      BXVTT_HOST_KEY: HOST_KEY,
    };
    const logFile = join(OUTPUT_DIR, `server-host-key-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    pid = spawnServer(serverCommand(), env, logFile);
    await waitForSecondServer(logFile);
  });

  test.afterAll(async () => {
    if (pid !== null) await stopProcess(pid);
    if (dataDir !== null) rmSync(dataDir, { recursive: true, force: true });
  });

  test('the home page asks for the host key up front, and only the right key creates a table', async ({
    crew,
  }) => {
    const response = await fetch(`${ORIGIN}/api/health`);
    expect(((await response.json()) as { host_key_required?: boolean }).host_key_required).toBe(true);

    // Each refused attempt is a 403 that the browser logs.
    crew.allowIssues(/403|Forbidden/);
    const hana = await crew.person('Hana', { signedIn: false });
    const { page } = hana;
    await page.goto(`${ORIGIN}/`);
    await page.getByRole('textbox', { name: 'Your name' }).fill('Hana');
    await page
      .getByRole('form', { name: 'Choose your name' })
      .getByRole('button', { name: 'Continue' })
      .click();
    await expect(page.getByRole('heading', { name: 'Your tables', level: 1 })).toBeVisible();

    // The field is there before the first attempt.
    const key = page.getByLabel('Host key');
    await expect(key).toBeVisible();
    await expect(key).toHaveAttribute('type', 'password');
    await expect(page.getByText('Ask the server host for this key.')).toBeVisible();

    // Without the key, the server refuses and the page says why.
    await page.getByRole('textbox', { name: 'Table name' }).fill('Hana runs the bell');
    await page.getByRole('button', { name: 'Create table' }).click();
    await expect(
      page.getByText('Enter the host key from the server host to create a table.', { exact: false }),
    ).toBeVisible();
    await expect(key).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(`${ORIGIN}/`);

    // A wrong key gets its own sentence.
    await key.fill('lantern-of-somewhere-else');
    await page.getByRole('button', { name: 'Create table' }).click();
    await expect(page.getByText("That host key isn't right.", { exact: false })).toBeVisible();
    await expect(page).toHaveURL(`${ORIGIN}/`);

    // The right key creates the table, and Hana is its referee.
    await key.fill(HOST_KEY);
    await page.getByRole('button', { name: 'Create table' }).click();
    await expect(page).toHaveURL(/\/tables\/tbl_/);
    await expect(page.getByRole('heading', { name: 'Hana runs the bell', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replace invite link' })).toBeVisible();
  });
});

test('a server without a host key shows no host key field', async ({ crew }) => {
  const ruth = await crew.person('Ruth');
  await ruth.page.goto('/');
  await expect(ruth.page.getByRole('heading', { name: 'Your tables', level: 1 })).toBeVisible();
  await expect(ruth.page.getByRole('textbox', { name: 'Table name' })).toBeVisible();
  await expect(ruth.page.getByLabel('Host key')).toHaveCount(0);
});
