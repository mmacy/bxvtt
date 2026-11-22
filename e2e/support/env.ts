/**
 * Settings shared by the Playwright config, the global setup, and the tests. Every value can be overridden from
 * the environment, so a second copy of the suite can run on other ports.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Port of the bxvtt server that the suite starts. */
export const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 8690);

/** Port of the Vite development server that the suite starts in development mode. */
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5190);

/**
 * Whether the suite runs against the production build that the bxvtt server serves itself. CI sets `CI`, and
 * `npm run test:e2e:prod` sets `E2E_PROD=1`. Otherwise the suite runs the Vite development server.
 */
export const PROD = process.env.E2E_PROD === '1' || process.env.CI === 'true';

/** The bxvtt server's own origin, which the SDK calls directly. */
export const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

/** The origin the browsers load the client from. */
export const BASE_URL = PROD ? SERVER_URL : `http://localhost:${WEB_PORT}`;

/** The bxapi the server calls. Never the one on port 8640. */
export const BXAPI_URL = process.env.BXAPI_URL ?? 'http://127.0.0.1:8651';

/** Where the suite writes server logs and screenshots for the defect report. */
export const OUTPUT_DIR = resolve(REPO_ROOT, '.data', 'e2e');

/** Where specs save screenshots that the defect report links to. */
export const SCREENS_DIR = resolve(REPO_ROOT, '.data', 'screens', 'e2e');
