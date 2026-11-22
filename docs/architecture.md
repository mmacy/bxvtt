---
title: Architecture
description: How the browser client, bxvtt server, and bxapi divide state, permissions, projections, and real-time sync.
sidebar_position: 7
---

# Architecture

bxvtt runs across three components. Browsers communicate exclusively with the bxvtt server over HTTP and WebSocket, and the bxvtt server communicates with `bxapi` over loopback HTTP.

```text
browser (apps/web)  <--HTTP /api, WebSocket /ws-->  bxvtt server (apps/server)  <--HTTP /v1-->  bxapi
     React + canvas                                   Fastify + SQLite                          osrlib rules + SQLite
```

- **`bxapi`** enforces the 1981 B/X rules, rolls dice, and stores characters, adventures, sessions (active games), and saves. It has no user accounts, no WebSocket interface, and scopes data per API client rather than per person.
- **The bxvtt server** stores everything about the people at a table and nothing about game mechanics: users, tables, memberships, seats, chat feed entries, notes, map annotations, monster target handles, and pending battle declarations. It calls `bxapi` as a `referee` (via `BXAPI_KEY` or loopback anonymous mode), verifies whether the requesting user has permission to send a command, and filters every response for each recipient's role.
- **The browser client** renders the table, map, sheets, and compendium, and submits user intent. It never evaluates a B/X rule and never contacts `bxapi`.

In production, the bxvtt server also serves the pre-compressed client bundle (`apps/web/dist`), reducing deployment to one bxvtt process and one `bxapi` process on the same host.

## Network topology and trust boundary

Because `bxapi` runs locally against a SQLite database, the bxvtt server runs alongside it on `127.0.0.1`. To invite remote players without opening router ports, the host publishes bxvtt through a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`npm run share` launches a quick tunnel automatically), while `bxapi` remains private on `127.0.0.1`.

The bxvtt server treats every incoming request as untrusted:

- Every API route except `GET /api/health`, `POST /api/users`, and the unauthenticated rejoin endpoints requires a bearer token, and non-members receive HTTP 404 on table routes.
- Invite codes contain 100 bits of entropy, and IP-based token buckets rate-limit user creation, invite attempts, rejoin requests, and host-key checks.
- Setting `BXVTT_HOST_KEY` restricts `POST /api/tables` to callers who supply that key (`npm run share` sets one automatically), while players join existing tables with an invite code alone.
- WebSocket handshakes validate `Origin`, enforce a 10-second authentication window, cap frame sizes, and pair with a strict Content Security Policy on client pages.

See [Security and trust model](hosting/security.md) for the complete guarantee matrix and [Environment variables and limits](reference/environment-variables.md) for server settings.

## Domain terms

- **User:** A person at one or more tables, represented by a display name, color, and 256-bit bearer token stored in browser `localStorage` (hashed with SHA-256 on the server).
- **Table:** One group's shared space, with a name, invite code, member list, lobby roster, saved games, and at most one active `bxapi` session.
- **Referee and player:** A member's role at a table. Creating a table makes you its referee; referees can promote other members and can also control characters, enabling solo play.
- **Roster:** In the lobby before a game starts, the ordered list of stored `bxapi` characters (`chr_` IDs) and their owners that will form the party.
- **Seat:** During an active game, the assignment linking a session party member (`character-0001`) to the user who controls them. Referees can reassign seats at any time and control every character in an empty seat.
- **Caller:** The player designated to speak for the party, issuing party-wide movement, door, search, rest, and encounter commands.
- **Feed:** A table's single ordered stream of chat messages, whispers, dice rolls, narrated game events, and system notices, filtered per recipient.

## Command authorization

Before forwarding a command to `bxapi`, the server classifies it from `bxapi`'s JSON command schemas (`/v1/rules/commands/{command_type}`) and checks the sender's role and seat:

| Command class | Examples | Authorized senders |
| --- | --- | --- |
| Member command | `equip_item`, `cast_spell`, `give_items`, `use_item`, `purchase_equipment`, `force_door`, `pick_lock` | The user holding the acting character's seat, or a referee. |
| Party command | `move_party`, `turn_party`, `open_door`, `search`, `rest`, `enter_dungeon`, `engage_battle`, `evade`, `parley`, `wait`, `take_treasure`, `reorder_party` | A referee, the caller, or any seated player when `party_control` is `anyone`. |
| Referee command | All 23 commands with `kind: "referee"` | A referee. |
| Battle resolution | `resolve_battle_round` | Never accepted directly (`409 use_declarations`); assembled by the server from saved battle declarations. |

Because the server identifies member commands by inspecting required string fields (`character_id`, `member_id`, or `actor_id`) in `bxapi`'s command schema (with `search` and `parley` overridden as party commands), newly added `bxapi` commands classify automatically without server code changes.

Rules refusals from `bxapi` return HTTP 200 with `accepted: false` and structured `rejections` to the sender alone, without advancing the session revision or broadcasting to other members.

## Battle round coordination

`bxapi` resolves an entire B/X battle round in one atomic `resolve_battle_round` command containing one declaration per eligible member in `view.encounter.declarers`. bxvtt coordinates multi-player input around that single call:

1. Each player submits declarations for their seated characters (`PUT /api/tables/{t}/game/declarations/{member_id}`). The server stores them and broadcasts updated `declarations` to the table so party members can plan together.
2. Once every declarer has submitted, the server calls `resolve_battle_round` automatically when `auto_resolve` is enabled; otherwise the caller or a referee triggers resolution (`POST /api/tables/{t}/game/declarations/resolve`), and referees can resolve early with `fill_with_hold: true`.
3. If `bxapi` refuses the round, declarations remain intact while the server attributes each rejection to its offending `member_id` (matching rejection parameters first, eliminating plain `hold` declarations second, and probing non-moving declarations with an intentionally invalid `hold` + `back_stab: true` sentinel that can never resolve the round).
4. Once `bxapi` accepts the round, the server clears stored declarations and broadcasts the updated game state and round events.

## Role-based projections, the scene, and target handles

After every accepted command, bxvtt fetches the full outcome from `bxapi` and constructs separate projections:

- **Players** receive `bxapi`'s `PlayerView`, player-visibility events, a server-derived `scene`, and opaque monster target handles (`tgt_` IDs).
- **Referees** also receive dynamic `RefereeState`, referee-visibility events, pending `rejoin_requests`, and HTTP access to the cached full adventure document and full event log.

Because `bxapi`'s `PlayerView` provides explored cell geometry without room names, descriptions, visible treasure caches, stairs, or discovered traps, bxvtt derives `game.scene` from `osrlib`'s recorded party knowledge (`explored` cells, `found_traps`, `sprung_traps`, `removed_traps`, `found_tricks`, and `resolved_encounters`). Anything not confirmed as perceived by the party stays omitted. Similarly, because `PlayerView` hides individual monster IDs while single-target spells need them, bxvtt mints stable 96-bit `tgt_` handles (labeled `Goblin 1`, `Goblin 2`, and so on) for visible monsters and translates handles to monster IDs inside commands and declarations.

On a referee's browser, the **Referee lens** (`Shift+L`) switches rendering to the player projection locally so a referee who also plays a character can avoid spoilers.

## Browser-to-server protocol

`packages/shared/src/protocol` defines every HTTP payload and WebSocket message as a zod schema, and `@bxvtt/shared/client` wraps them in `BxvttClient` and `TableConnection`.

- **HTTP (`/api`)** handles request-response mutations and queries, returning RFC 9457 `application/problem+json` documents with stable `code` strings on errors. Commands include `expected_revision` and an `Idempotency-Key` so concurrent clicks cannot apply against stale state; the losing request receives `409 revision_conflict` and a `table_changed` notice.
- **WebSocket (`/ws`)** delivers live state pushes and lightweight signals. After opening a socket, the client authenticates with an `auth` frame (`token`, `table_id`, and optional `feed_after`) and receives a complete role-filtered `snapshot`. Subsequent state frames (`presence`, `table`, `game`, `declarations`, `annotations`, `notes`, and `rejoin_requests`) replace their respective slice wholesale, `feed` frames append one new `FeedEntry` by `seq`, and signal frames (`ping`, `notice`, `heartbeat`, `error`, and `removed`) report ephemeral events, allowing automatic recovery on reconnect or `resync`.

See [HTTP API, WebSocket, and SDK](reference/http-and-websocket.md) for the complete endpoint and message tables.

## Game lifecycle

1. **Home (`/` and `/join/:code`):** Users create a browser identity, create or join tables, or request to rejoin an existing table seat after a tunnel URL or browser change.
2. **Lobby:** Players roll or attach stored characters; the referee picks or uploads an adventure, adjusts optional B/X rules, orders the roster, and starts a new `bxapi` session (or restores an existing save).
3. **Active session:** The play shell adapts to `game.mode`: `town`, `exploring`, `encounter`, `battle`, `game_over`, and `victory`.
4. **Saves and lobby return:** Manual saves and automatic milestone saves (`autosave`) persist in `bxapi`. Restoring a save creates a fresh `bxapi` session from that snapshot and remaps table seats by member ID; ending a game returns the table to its lobby while retaining all saves.

## Web client layout

```text
apps/web/src/
  ui/         design system: CSS tokens, typography, icons, accessible component kit, /kit gallery
  map/        HTML canvas dungeon renderer: tile cache, themes, lighting, annotations, ruler, keyboard cursor
  app/        router, API client, WebSocket store sync, permission hooks, command queue, shortcuts
  features/   screen modules: home, lobby, table, wizard, sheet, town, explore,
              combat, feed, journal, compendium, referee
```

Feature modules read state through hooks in `@/app` and build interfaces from `@/ui`; they never instantiate WebSockets, call `fetch` directly, or compute B/X rules.
