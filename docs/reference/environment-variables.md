---
title: Environment variables and limits
sidebar_label: Environment and limits
description: Complete reference for server, web client, helper script, and E2E environment variables alongside server payload limits and storage quotas.
sidebar_position: 2
---

# Environment variables and limits

Relative filesystem paths configured through environment variables resolve against the bxvtt repository root.

## bxvtt server (`@bxvtt/server`)

| Variable | Default | Description |
| --- | --- | --- |
| `BXVTT_PORT` | `8660` | TCP port (`0`-`65535`; `0` binds an ephemeral port). |
| `BXVTT_HOST` | `127.0.0.1` | Bind address. Keep `127.0.0.1` and expose externally via a local tunnel. |
| `BXVTT_DATA_DIR` | `.data` | Directory storing `bxvtt.db` (created with mode `0700`). |
| `BXAPI_URL` | `http://127.0.0.1:8640` | Base URL of `bxapi` (`npm run dev` sets `http://127.0.0.1:8651` when unset). |
| `BXAPI_KEY` | unset | `bxapi` bearer API key with the `referee` role. Leave unset when `bxapi` runs with `BXAPI_ALLOW_ANONYMOUS=true`. |
| `BXVTT_HOST_KEY` | unset | Secret required in `host_key` on `POST /api/tables` (`npm run share` generates a 24-character base64url key when unset). |
| `BXVTT_PUBLIC_ORIGINS` | unset | Comma-separated origins (such as `https://table.example.com`) permitted in WebSocket `Origin` headers (`npm run share` appends the quick-tunnel URL). |
| `BXVTT_WEB_DIST` | `apps/web/dist` | Directory of the built web client; static serving activates when `index.html` exists there. |
| `BXVTT_ADVENTURES_DIR` | `adventures` | Directory scanned for `*.json` sample adventures offered to every table. |
| `BXVTT_LOG_LEVEL` | `info` | Pino logger level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent`). |
| `BXVTT_RELAX_LIMITS` | `false` | When `true`, multiplies rate-limit buckets by `100` (except `failedHostKey`) for local automated test suites. Never enable on a shared server. |
| `BXVTT_ALLOW_CHARACTER_SEEDS` | `false` | When `true`, permits deterministic `seed` values on ability-roll and character endpoints for automated tests and screenshot scripts. |

## Web development server and helper scripts

| Variable | Read by | Default | Description |
| --- | --- | --- | --- |
| `BXVTT_WEB_PORT` | `apps/web/vite.config.ts` | `5180` | Port for the Vite development server (`strictPort: true`). |
| `BXVTT_SERVER_URL` | `apps/web/vite.config.ts` | `http://127.0.0.1:8660` | Target bxvtt server URL for Vite's `/api` and `/ws` proxy. |
| `BXAPI_DIR` | `scripts/dev-bxapi.sh`, `scripts/gen-bxapi-types.mjs` | `$HOME/repos/bxapi` | Path to the local `bxapi` checkout. |
| `BXAPI_URL` | `scripts/gen-bxapi-types.mjs`, `adventures/tools/check.mjs`, `docs/images/capture.mjs` | unset / `:8651` / `:8640` | Live `bxapi` URL (fetches `/openapi.json` over HTTP in `gen-bxapi-types.mjs`, targets `:8651` in `check.mjs`, and targets `:8640` in `capture.mjs`). |
| `BXAPI_PORT` | `scripts/dev-bxapi.sh` | `8651` | Port for the local development `bxapi` server. |
| `BXAPI_DATABASE` | `scripts/dev-bxapi.sh` | `.data/bxapi-dev-<port>.db` | SQLite file path passed to `bxapi`. |
| `BXAPI_MAX_CLIENT_BYTES` | `bxapi`, `scripts/dev-bxapi.sh` | `1073741824` (`0` in `dev-bxapi.sh`) | Maximum storage bytes per `bxapi` client (`0` disables the cap). |
| `BXVTT_CAPTURE_PORT` | `docs/images/capture.mjs` | `8670` | Temporary server port used while capturing documentation screenshots. |
| `CAPTURE_ONLY` | `docs/images/capture.mjs` | unset | Comma-separated screenshot basenames (such as `explore,battle`) to write selectively. |

## End-to-end test suite (`e2e/`)

| Variable | Default | Description |
| --- | --- | --- |
| `E2E_SERVER_PORT` | `8690` | Port of the isolated bxvtt server spawned by Playwright global setup. |
| `E2E_WEB_PORT` | `5190` | Port of the isolated Vite server in development-mode E2E runs. |
| `E2E_PROD` | unset | Set `1` (or `CI=true`) to test against the built server and client bundles instead of Vite. |
| `E2E_WEB_DIST` | `apps/web/dist` | Built client directory used in production-mode E2E runs (`host-key.spec.ts` runs in dev mode only when `E2E_WEB_DIST` is explicitly set). |
| `E2E_SERVER_ENTRY` | `apps/server/dist/main.js` | Built server entrypoint used in production-mode E2E runs. |
| `E2E_WORKERS` | `3` | Number of concurrent Playwright workers. |
| `E2E_OUTPUT` | `./test-results` | Output directory for Playwright traces, screenshots, and failure artifacts. |
| `E2E_HOST_KEY_PORT` | `8689` | Port of the secondary server spawned by `e2e/host-key.spec.ts`. |
| `E2E_KEEP_DATA` | unset | Set `1` to keep the server's temporary data directory, and the games it stored in `bxapi`, after an E2E run finishes. |
| `E2E_SERVER_LOG_LEVEL` | `warn` | Pino log level for the E2E bxvtt server. |

## Payload, string, and storage limits

Defined in `packages/shared/src/protocol/common.ts` (`LIMITS`) and `apps/server/src/config.ts` (`DEFAULT_QUOTAS`):

| Constraint | Value |
| --- | --- |
| Display name (`userName`) | 1-40 characters |
| Table name (`tableName`) | 1-80 characters |
| Save label (`saveLabel`) | Up to 100 characters |
| Map pin text (`pinText`) | Up to 280 characters |
| Feed chat message (`feedText`) | Up to 2,000 characters, max 20 whisper recipients |
| Party or referee notes (`notesText`) | Up to 50,000 characters |
| Map freehand stroke (`strokePoints`) | Up to 1,000 points |
| JSON HTTP body (`jsonBodyBytes`) | 64 KiB (`65,536` bytes), max nesting depth 64 |
| Adventure JSON body (`adventureBodyBytes`) | 8 MiB (`8,388,608` bytes) |
| WebSocket client frame (`wsMessageBytes`) | 16 KiB (`16,384` bytes) |
| WebSocket outbound buffer (`MAX_BUFFERED_BYTES`) | 8 MiB (`8,388,608` bytes) |
| Tables per user (created and still refereed by that user) / characters per user | 50 tables / 200 characters |
| Roster entries / uploaded adventures per table | 20 roster entries / 20 uploaded adventures |
| Saves per table | 100 manual saves + 10 newest autosaves |
| Annotations | 20,000 per table / 2,000 per dungeon level |
| Rules proxy memory cache | 32 MiB (up to 2,000 entries, revalidated every 5 minutes) |
