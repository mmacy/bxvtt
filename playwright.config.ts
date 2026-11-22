import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, PROD, SERVER_URL, WEB_PORT } from './e2e/support/env';

/**
 * The end-to-end suite. The global setup starts a bxvtt server on a fresh data directory. In development mode,
 * `webServer` also starts the Vite client, which proxies `/api` and `/ws` to that server. In production mode (CI,
 * or `E2E_PROD=1`), the bxvtt server serves the built client itself.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // A second copy of the suite on other ports sets its own output directory, so the runs don't clean each other's.
  outputDir: process.env.E2E_OUTPUT ?? './test-results',
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: process.env.CI === 'true',
  retries: process.env.CI === 'true' ? 1 : 0,
  workers: Number(process.env.E2E_WORKERS ?? 3),
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI === 'true' ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: ['**/restart.spec.ts'],
    },
    {
      // The restart spec stops the shared server, so it runs alone after everything else.
      name: 'restart',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: '**/restart.spec.ts',
      dependencies: ['chromium'],
    },
  ],
  webServer: PROD
    ? undefined
    : {
        command: 'npx vite --config e2e/support/vite.e2e.config.ts',
        url: `http://localhost:${WEB_PORT}`,
        env: { BXVTT_WEB_PORT: String(WEB_PORT), BXVTT_SERVER_URL: SERVER_URL },
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
