# End-to-end tests (`e2e/`)

The Playwright suite drives a referee and multiple players simultaneously in isolated Chromium browser contexts against a dedicated bxvtt server and a live `bxapi` instance. Product defects uncovered by E2E runs are tracked in [`DEFECTS.md`](DEFECTS.md).

## Run the suite

Install Node.js 24+, workspace packages, Playwright's Chromium build, and start `bxapi` on port 8651:

```sh
npm install
npx playwright install chromium
npm run dev:bxapi        # in a separate terminal if not already running on :8651
```

Run against the Vite development client, or build and run against the production server bundle and Content Security Policy (matching CI):

```sh
npm run test:e2e
npm run test:e2e:prod
```

Filter to a single spec file, test title, or the isolated server-restart project:

```sh
npx playwright test e2e/lobby.spec.ts
npx playwright test -g "invite link"
npx playwright test --project restart --no-deps
```

Failed tests save Playwright traces, screenshots, and accessibility snapshots under `test-results/` (`npx playwright show-trace test-results/<test>/trace.zip`).

## Server lifecycle and environment variables

Playwright starts and tears down dedicated server instances per run without touching any dev server you started manually:

- **bxvtt server (`e2e/support/global-setup.ts`):** Listens on `8690` with a temporary data directory, `BXVTT_RELAX_LIMITS=true`, and `BXVTT_ALLOW_CHARACTER_SEEDS=true` (`tsx apps/server/src/main.ts` in dev mode; `apps/server/dist/main.js` serving `apps/web/dist` in `E2E_PROD=1` mode). Logs write to `.data/e2e/server-<timestamp>.log`.
- **Web client:** In dev mode, Playwright starts Vite on `5190` (`e2e/support/vite.e2e.config.ts`) proxying `/api` and `/ws` to `:8690`. In `E2E_PROD=1` mode, `:8690` serves the built client directly.
- **`bxapi`:** Connects to `BXAPI_URL` (default `http://127.0.0.1:8651`); never starts or stops `bxapi` and never uses port `8640`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `E2E_SERVER_PORT` | `8690` | Port of the suite's bxvtt server. |
| `E2E_WEB_PORT` | `5190` | Port of the suite's Vite dev server. |
| `E2E_PROD` | unset | Set `1` (or `CI=true`) to test against `apps/server/dist` + `apps/web/dist`. |
| `E2E_WEB_DIST` | `apps/web/dist` | Built client directory. In dev mode, `host-key.spec.ts` runs only when `E2E_WEB_DIST` is explicitly set (for example, `npm run build -w @bxvtt/web && E2E_WEB_DIST=apps/web/dist npx playwright test e2e/host-key.spec.ts`). |
| `E2E_SERVER_ENTRY` | `apps/server/dist/main.js` | Built server entrypoint in production mode. |
| `E2E_WORKERS` | `3` | Concurrent Playwright worker count. |
| `E2E_OUTPUT` | `./test-results` | Artifact output directory (set a unique path when running two E2E suites simultaneously). |
| `E2E_HOST_KEY_PORT` | `8689` | Port of the secondary host-key server spawned by `e2e/host-key.spec.ts`. |
| `E2E_KEEP_DATA` | unset | Set `1` to preserve temporary server data directories after teardown. |
| `E2E_SERVER_LOG_LEVEL` | `warn` | Pino log level for the E2E server. |
| `BXAPI_URL` | `http://127.0.0.1:8651` | Target `bxapi` base URL. |

## Automatic assertions and writing new specs

Import `test` and `expect` from `./support/fixtures`:

- **Automatic teardown checks (`crew`):** Fails any test with uncaught page errors, console errors, failed requests, HTTP `>= 500` responses (override expected errors via `crew.allowIssues(/404/)`), or feed entries leaking raw IDs (`character-0001`, `chr_...`), snake_case tokens, dotted rejection codes, map coordinates, or `undefined` (`e2e/support/feed-text.ts`; opt out via `crew.skipFeedScan()` when testing the feed scanner itself).
- **Actors and seeded state:** Create users and pre-authenticated browser pages with `crew.person(name)` (`{ signedIn: false }` for anonymous visitors). Each browser plays combat rounds back at the fastest speed, so specs never wait on the playback pace; a spec about playback passes `{ playbackSpeed: 'normal' }` (or `playbackSpeed: 'normal'` to `combatTable`). Use `setupTable` (`e2e/support/table.ts`) and `stagedTable` (`e2e/support/states.ts`) with deterministic seeds, or `actor.seedAbilityRolls([...])` / `actor.seedGameStart(seed)` when testing UI creation flows.
- **Accessible locators only:** Query elements via ARIA roles and accessible names (`page.getByRole('button', { name: 'Set out' })`). If a control cannot be reached by accessible role and name, log an accessibility defect in `DEFECTS.md` rather than falling back to CSS selectors.

Verify E2E changes before finishing:

```sh
npm run typecheck:e2e
npx eslint e2e playwright.config.ts
npx prettier --check e2e playwright.config.ts
```
