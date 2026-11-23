# `@bxvtt/server`

`@bxvtt/server` is the Fastify HTTP and WebSocket server between browsers and `bxapi`. It stores table state in SQLite (users, tables, memberships, seats, chat feed, notes, map annotations, monster target handles, retired tokens, and pending battle declarations), checks command permissions against `bxapi` schemas, calls `bxapi` with referee authority, and projects responses per recipient role. Browsers communicate exclusively with this server over `/api` and `/ws`.

Every HTTP payload and WebSocket message uses a zod schema in `@bxvtt/shared/protocol`, wrapped by `BxvttClient` and `TableConnection` in `@bxvtt/shared/client`. See [HTTP API, WebSocket, and SDK](../../docs/reference/http-and-websocket.md) for the full endpoint and message reference.

## Run the server

Start Node.js 24+ and a local `bxapi` server from the repository root:

```sh
npm install
npm run dev:bxapi                 # terminal 1: anonymous bxapi on http://127.0.0.1:8651
npm run dev -w @bxvtt/server      # terminal 2: Fastify watch server on http://127.0.0.1:8660
```

`npm run dev` at the repository root starts both `@bxvtt/server` and `@bxvtt/web` together, defaulting `BXAPI_URL` to `http://127.0.0.1:8651`. Verify connectivity with:

```sh
curl -s http://127.0.0.1:8660/api/health
```

Unauthenticated callers receive `"status": "ok"`, `bxapi.reachable: true`, and `host_key_required`; authenticated callers also receive `bxapi` engine metadata and storage counts from `GET /v1/meta`. When `bxapi` is offline, `/api/health` and `bxapi`-backed routes return HTTP 503 (`bxapi_unavailable`).

To run the production server, build both workspaces first. When `apps/web/dist/index.html` exists, the server pre-compresses text assets (`>= 1024` bytes) in memory with Brotli and gzip, serves hashed files under `assets/` with `Cache-Control: public, max-age=31536000, immutable`, and serves `index.html` with `Cache-Control: no-cache`:

```sh
npm run build
BXAPI_URL=http://127.0.0.1:8651 npm start
```

To share a built server over the internet through a Cloudflare quick tunnel, stop `npm start` and run `npm run share` (see [Play over the internet](../../docs/getting-started/share-online.md) and [Run and maintain a server](../../docs/hosting/running-a-server.md)).

### Settings

Relative paths resolve against the repository root.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BXVTT_PORT` | `8660` | TCP port (`0` selects an ephemeral port). |
| `BXVTT_HOST` | `127.0.0.1` | Bind address. |
| `BXVTT_DATA_DIR` | `.data` | Directory for `bxvtt.db` (mode `0700`, WAL journal). Migrates older schemas at startup and refuses newer schemas. |
| `BXAPI_URL` | `http://127.0.0.1:8640` | Base URL of `bxapi` (`npm run dev` sets `http://127.0.0.1:8651`). |
| `BXAPI_KEY` | unset | `bxapi` bearer key with the `referee` role. Leave unset when `bxapi` runs in anonymous mode. |
| `BXVTT_HOST_KEY` | unset | Secret required in `host_key` on `POST /api/tables`. |
| `BXVTT_PUBLIC_ORIGINS` | unset | Comma-separated origins allowed in WebSocket `Origin` checks. |
| `BXVTT_WEB_DIST` | `apps/web/dist` | Static client bundle directory. |
| `BXVTT_ADVENTURES_DIR` | `adventures` | Directory of `*.json` sample adventures offered to every table. |
| `BXVTT_LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `silent`, and so on). |
| `BXVTT_RELAX_LIMITS` | `false` | Multiplies rate limits (except `failedHostKey`) by `100` for local test suites. Never enable on a public server. |
| `BXVTT_ALLOW_CHARACTER_SEEDS` | `false` | Allows deterministic `seed` fields when rolling abilities or creating characters in tests. |

Each HTTP request logs one JSON line with method, query-stripped path, status, duration, user ID, and client IP, never tokens or request bodies. On `SIGINT` or `SIGTERM`, the server closes WebSockets with `1001`, closes SQLite, and exits.

## Who may do what

| Action | Authorized callers |
| --- | --- |
| Read a table, feed, saves, annotations, party notes, and active game | Any member of that table (non-members receive `404`). |
| Rename a table, update settings, rotate invite code, delete table | Referee. |
| Change a member's role or remove a member | Referee (refuses changes leaving zero referees with `409 last_referee`). |
| Leave a table | Any member except the sole referee while others remain (when the final member leaves, the table is deleted). |
| Add a character to the lobby roster | Character owner (in lobby). |
| Remove a character from the lobby roster | Character owner or referee. |
| Reorder the roster, start or end a game, restore a save, assign seats | Referee. |
| Member command (such as `equip_item` or `cast_spell`) | User holding the acting member's seat, or a referee (referees also control all empty seats). |
| Party command (such as `move_party`, `search`, or `parley`) | Referee, caller, or any seated player when `party_control` is `anyone`. |
| Referee command (such as `place_party` or `end_encounter`) | Referee (`403 referee_command` for players). |
| `resolve_battle_round` | Never accepted directly (`409 use_declarations`). |
| Save or clear a battle declaration | User holding that member's seat, or a referee. |
| Resolve a battle round | Any user authorized for party commands once all declarers submit (referees may pass `fill_with_hold` to resolve early). |
| Create a manual save | Any table member. |
| Rename or delete a save | Save creator or referee. |
| Secret rolls, referee-only pins, referee notes, referee events, adventure JSON, save export, generators | Referee. |
| Read, create, or ping annotations on a dungeon level | Referee on any level; player only on levels present in `PlayerView.explored`. |
| Delete an annotation | Annotation author or referee. |
| Read a stored character | Character owner, or referee of a table whose lobby roster includes the character. |

The server classifies commands from `/v1/rules/commands/{command_type}` JSON schemas (`classify.ts`): commands with `kind: "referee"` are referee commands; `search` and `parley` are party commands; other commands requiring a string `character_id`, `member_id`, or `actor_id` are member commands; and all remaining play commands are party commands.

## Key server subsystems

- **Concurrency and retries (`game/service.ts`):** Serializes commands per table via `KeyedMutex`, checks `expected_revision` before calling `bxapi` (returning `409 revision_conflict` and pushing `notice: table_changed` on mismatch), and sends a UUID `Idempotency-Key` with automatic retries on transient connection or `session_busy` responses. Rules refusals return `200 { accepted: false, rejections }` to the sender alone.
- **Scene and target handles (`game/scene.ts`, `game/targets.ts`):** Derives `game.scene` strictly from `osrlib` party knowledge (`explored`, `found_traps`, `sprung_traps`, `removed_traps`, `found_tricks`, `resolved_encounters`), masking unseen caches and trap state on refused commands. Visible monsters receive persistent 96-bit `tgt_` handles translated across `targets` and `target_id` fields (`422 target_unknown` when stale).
- **Battle refusal attribution (`game/refusals.ts`):** Attributes nameless round rejections (such as `combat.attack.out_of_reach` or `magic.cast.too_many_targets`) by matching rejection params, eliminating plain `hold` declarations, and probing non-moving declarations with `{ action: "hold", back_stab: true }` (which `osrlib` rejects via `battle.declaration.back_stab_not_attack` without mutating state).
- **Wizard checking (`character-check.ts`):** Validates `POST /api/characters/check` with one `bxapi` preview (`POST /v1/ability-rolls/{roll_id}/preview`), which stores nothing and leaves the roll unused, and returns only `valid` and `problem`.
- **Starting rolls (`starting-rolls.ts`):** Rolls hit points and gold through the same preview, records the class and reroll option the hit points fixed on the `ability_rolls` row, and refuses checks, rolls, and creations that would reveal a roll the player hasn't made (`ability_roll_locked`, `gold_not_rolled`, `hit_points_not_rolled`).
- **Rejoin flow (`rejoin.ts`):** Manages 5-minute rejoin tickets (`20s` poll abandonment timeout, `30s` approval claim window), rotating the member's token only when the polling browser claims approval and retaining retired token hashes for 90 days (`401 token_retired`).
- **Storage cleanup (`cleanup.ts`, `health.ts`):** `BxapiJanitor` runs at startup and hourly to delete stale `bxapi` sessions and retry `bxapi_garbage` deletions; `watchStorage` logs warnings every 10 minutes above 80% quota, and quota exhaustion maps to `507 bxapi_storage_full`.

For rate limits (including `40` WebSocket messages per `2` seconds, IPv6 `/64` buckets, and loopback-only proxy header trust), quotas, and security headers, see [Security and trust model](../../docs/hosting/security.md).

## Tests

Integration tests in `test/` boot the server in-process on an ephemeral port with a temporary SQLite directory against a live `bxapi` at `BXAPI_URL` (default `http://127.0.0.1:8651`):

```sh
npm run dev:bxapi                  # in another terminal if not already running
npx vitest run --project server
```

Call `findRefereeData` (`test/helpers.ts`) in any test verifying payloads delivered to a player.
