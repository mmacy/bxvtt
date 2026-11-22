# End-to-end tests

The end-to-end suite plays bxvtt through a real browser with a referee and one or two players at once, each in a separate browser context. It drives the web client against a real bxvtt server and a real bxapi, so it finds the defects that unit tests of one feature can't. `DEFECTS.md` lists the product defects the suite found.

## Run the suite

You need Node 24, the repository's packages, Chromium for Playwright, and a running bxapi:

```sh
npm install
npx playwright install chromium
npm run dev:bxapi        # in another terminal, unless the development bxapi already runs on port 8651
```

Then run the suite against the development client:

```sh
npm run test:e2e
```

To run one spec, or the tests whose titles match a pattern, pass them to Playwright:

```sh
npx playwright test e2e/lobby.spec.ts
npx playwright test -g "invite link"
```

To run the suite against the production build, as CI does, build first and set `E2E_PROD=1`. `npm run test:e2e:prod` does both:

```sh
npm run test:e2e:prod
```

A failed test keeps a trace, a screenshot, and the page's accessibility snapshot under `test-results/`. Open a trace with `npx playwright show-trace test-results/<test>/trace.zip`.

## How the suite starts its servers

The suite starts its own servers for each run and stops them when it finishes. It never touches a bxvtt or Vite server that you started.

- **bxvtt server**: `e2e/support/global-setup.ts` starts it on port 8690 with a new temporary data directory, `BXVTT_RELAX_LIMITS=true`, and `BXVTT_ALLOW_CHARACTER_SEEDS=true`. In development mode it runs `apps/server/src/main.ts` with `tsx`. In production mode it runs `apps/server/dist/main.js`, which serves the built client from `apps/web/dist` with its Content Security Policy. The server's log goes to `.data/e2e/server-<time>.log`.
- **Web client**: in development mode, Playwright's `webServer` starts Vite on port 5190 with `e2e/support/vite.e2e.config.ts`, which proxies `/api` and `/ws` to the suite's bxvtt server and keeps its own dependency cache under `.data/e2e/`. In production mode the bxvtt server serves the client itself.
- **bxapi**: the suite uses the bxapi at `BXAPI_URL`, which defaults to `http://127.0.0.1:8651`. It never starts or stops bxapi.

Global setup fails at once if something already listens on the server port. The restart spec (`restart.spec.ts`) stops and restarts the suite's bxvtt server in the middle of a game, so it runs in its own Playwright project after every other spec. To run it alone, skip the other project with `--no-deps`:

```sh
npx playwright test --project restart --no-deps
```

These environment variables change the defaults:

| Variable | Default | Meaning |
| --- | --- | --- |
| `E2E_SERVER_PORT` | `8690` | Port of the suite's bxvtt server. |
| `E2E_WEB_PORT` | `5190` | Port of the suite's Vite server in development mode. |
| `E2E_PROD` | unset | Set `1` to run against the production build. `CI=true` also selects it. |
| `E2E_WEB_DIST` | `apps/web/dist` | The built client, in production mode. |
| `E2E_SERVER_ENTRY` | `apps/server/dist/main.js` | The built server, in production mode. |
| `E2E_WORKERS` | `3` | How many tests run at once. |
| `E2E_OUTPUT` | `test-results` | Playwright's output directory. Give each copy of the suite its own. |
| `E2E_HOST_KEY_PORT` | `8689` | Port of the second server that `host-key.spec.ts` starts with `BXVTT_HOST_KEY` set. That server serves a built client, so in development mode the spec runs only when `E2E_WEB_DIST` names a build. |
| `E2E_KEEP_DATA` | unset | Set `1` to keep the server's temporary data directory after the run. |
| `E2E_SERVER_LOG_LEVEL` | `warn` | The server's log level. |
| `BXAPI_URL` | `http://127.0.0.1:8651` | The bxapi the server calls. Never use the one on port 8640. |

To run a second copy of the suite at the same time, for example while you work on two specs, give it other ports and another output directory:

```sh
E2E_SERVER_PORT=8691 E2E_WEB_PORT=5193 E2E_OUTPUT=test-results/second npx playwright test e2e/town.spec.ts
```

## What every test checks

Every spec imports `test` and `expect` from `e2e/support/fixtures.ts`. Its `crew` fixture creates the people at the table, and when the test ends it checks their browsers:

- The test fails on any browser console error, uncaught page error, failed request, or response with status 500 or more. A test that expects one, such as a 404 for a stale invite link, calls `crew.allowIssues(/404/)` first.
- The fixture reads every line of the feed on each open table page, scrolling its list from top to bottom, and fails the test when a line contains a raw ID or code, such as `character-0001`, `chr_…`, a snake_case token, a dotted rejection code, coordinates, or `undefined`. `e2e/support/feed-text.ts` lists the patterns. A test that checks the feed itself can call `crew.skipFeedScan()`.

## Add a spec

1. Create `e2e/<area>.spec.ts` and import `test` and `expect` from `./support/fixtures`.
2. Create the people with `crew.person(name)`. Each person has a bxvtt user, an SDK client (`actor.client`) that calls the server directly, and a browser page (`actor.page`) that's already signed in as that user. Pass `{ signedIn: false }` for a visitor who hasn't picked a name.
3. Set the table up through the SDK unless the setup is the thing under test. `setupTable` in `e2e/support/table.ts` creates a table, has the players join, creates a seeded party, and starts a seeded game. `stagedTable` in `e2e/support/states.ts` reaches town, exploring, an encounter, a battle, or a lost game in one call.
4. Drive the thing under test through the interface. Find elements by role and accessible name, such as `page.getByRole('button', { name: 'Set out' })`. When you can't reach an element that way, record that in `DEFECTS.md` as an accessibility defect instead of using a CSS selector.
5. Keep runs repeatable. Characters and games from the setup helpers use fixed seeds. When the interface itself rolls abilities or starts the game, call `actor.seedAbilityRolls([...])` or `actor.seedGameStart(seed)` first, which add a seed to those requests. Assert on structure and on what the person sees, never on the value of an unseeded die roll.
6. When a test fails because of a product defect, keep the test, add an entry to `DEFECTS.md`, and mark the test with `test.fixme` and a comment that names the entry's ID. After the defect is fixed, remove the `fixme` and run the test to confirm the fix.

Check your files before you finish:

```sh
npx tsc --noEmit -p e2e/tsconfig.json
npx eslint e2e playwright.config.ts
npx prettier --check e2e playwright.config.ts
```
