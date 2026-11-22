---
title: Local development and testing
sidebar_label: Development and testing
description: Set up the monorepo, start the development servers, run unit and Playwright E2E suites, regenerate types and screenshots, and follow project rules.
sidebar_position: 1
---

# Local development and testing

bxvtt is an npm workspaces monorepo requiring Node.js 24+, `uv`, and a sibling checkout of [`bxapi`](https://github.com/mmacy/bxapi) at `~/repos/bxapi` (or at the path set in `BXAPI_DIR`).

## Start the development servers

Open two terminals in the `bxvtt` repository root (`scripts/dev-bxapi.sh` reads `~/repos/bxapi` by default, or `BXAPI_DIR`), install dependencies once, and start both watch servers:

```sh
npm install
BXAPI_DIR=../bxapi npm run dev:bxapi    # terminal 1 (in bxvtt): anonymous bxapi on http://127.0.0.1:8651
npm run dev                             # terminal 2 (in bxvtt): Fastify on :8660 + Vite on http://localhost:5180
```

`scripts/dev-bxapi.sh` disables `bxapi` rate limits and client storage caps so automated test suites can create thousands of sessions without hitting quotas. Open [http://localhost:5180](http://localhost:5180) in your browser; Vite hot-reloads client edits and proxies `/api` and `/ws` to `http://127.0.0.1:8660`.

### Reserved ports

- **8651:** Shared development `bxapi` (`npm run dev:bxapi`, unit tests, and E2E tests).
- **8660 and 5180:** Default bxvtt server and Vite web client ports.
- **8689, 8690, and 5190:** Isolated Playwright E2E server and Vite ports.
- **8640 and 5173:** Reserved when working alongside other local projects; development and test scripts always target `bxapi` on `8651` instead of `8640`.

## Run the verification gate and unit tests

Before considering any code change complete, run the full check gate from the repository root:

```sh
npm run check
```

`npm run check` runs four checks in sequence:

1. `npm run typecheck` (`tsc --noEmit` across `@bxvtt/shared`, `@bxvtt/server`, and `@bxvtt/web`; run `npm run typecheck:e2e` as well when editing `e2e/`).
2. `npm run lint` (ESLint across all workspaces).
3. `npm run format:check` (Prettier check; run `npm run format` to format).
4. `npm test` (Vitest across all three workspace projects).

To run a single Vitest project while iterating:

```sh
npx vitest run --project shared   # pure TypeScript protocol, SDK, and game-text tests
npx vitest run --project web      # jsdom component, map, and feature tests
npx vitest run --project server   # in-process HTTP + WebSocket tests against live bxapi on :8651
```

In `apps/server/test/helpers.ts`, call `findRefereeData` in any test that delivers game state or events to a player so regressions in role filtering fail immediately.

## Run the Playwright end-to-end suite

The E2E suite in `e2e/` drives a referee and multiple players simultaneously in separate Chromium browser contexts against an isolated bxvtt server and a live `bxapi` on port 8651:

```sh
npx playwright install chromium   # one-time browser install
npm run test:e2e                  # runs against Vite dev client (:8690 / :5190)
npm run test:e2e:prod             # builds bundles and runs against production server + CSP
```

Run a single spec or title pattern during debugging:

```sh
npx playwright test e2e/lobby.spec.ts
npx playwright test -g "invite link"
npx playwright test --project restart --no-deps
```

To run two E2E suites concurrently without port or artifact collisions, override the ports and output folder:

```sh
E2E_SERVER_PORT=8691 E2E_WEB_PORT=5193 E2E_OUTPUT=test-results/second npx playwright test e2e/town.spec.ts
```

Every test using the `crew` fixture (`e2e/support/fixtures.ts`) automatically fails on uncaught page errors, console errors, HTTP 5xx responses, and any feed line containing raw internal IDs (`character-0001`, `chr_...`), snake_case codes, dotted rejection codes, raw map coordinates, or `undefined`. Failed tests write traces, screenshots, and accessibility snapshots under `test-results/` (`npx playwright show-trace test-results/<run>/trace.zip`).

## Regenerate types, text data, adventures, and screenshots

| Task | Command |
| --- | --- |
| Regenerate `bxapi` OpenAPI types in `packages/shared/src/bxapi` | `npm run gen:bxapi` |
| Extract `osrlib` event/rejection codes for `@bxvtt/shared/text` | `uv run --project ~/repos/bxapi python packages/shared/src/text/tools/extract-codes.py && npx prettier --write packages/shared/src/text/data` |
| Rebuild sample adventures in `adventures/*.json` | `node adventures/tools/build.mjs` |
| Verify sample adventures against `bxapi` | `node adventures/tools/check.mjs --no-maps` |
| Regenerate WebP screenshots in `docs/images/` | `npm run build && BXAPI_URL=http://127.0.0.1:8651 node docs/images/capture.mjs` |

## Code and design rules

- **Never implement a B/X game rule in bxvtt.** Derive valid choices from `game.commands`, `PlayerView`, `game.scene`, rules catalogs, and JSON command schemas, and let `bxapi` validate and roll dice.
- **Filter referee data strictly on the server.** Players must never receive `RefereeView`, referee events, adventure JSON, referee notes, referee-only pins, or secret rolls over HTTP or WebSocket.
- **Keep TypeScript strict.** Avoid `any`, `enum` (use string literal unions), `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, and unsafe non-null assertions.
- **Validate at every boundary.** Parse all incoming HTTP bodies, queries, and WebSocket messages with zod schemas from `@bxvtt/shared/protocol`.
- **Keep every screen keyboard-operable and accessible.** Use `@/ui` components and tokens, provide accessible names and visible `:focus-visible` states, locate elements by ARIA role and accessible name in tests, and add an entry to [`docs/credits.md`](../credits.md) whenever you introduce a new font, icon set, media asset, or browser dependency.
