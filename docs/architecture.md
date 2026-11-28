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
- **The bxvtt server** stores everything about the people at a table and nothing about game mechanics: users, tables, memberships, seats, chat feed entries, notes, map annotations, pending battle declarations, each table's ruleset and creation settings, and the owner of each ability roll. For an ability roll, it also records the table, the creation rules the roll was made under, the class that rolling hit points fixed, and whether the player rolled the gold, but never the dice, which `bxapi` returns again on request. It enforces the table's limit on ability score rerolls, which is table policy and not a game rule, and sends `bxapi` the table's ruleset with each ability roll and the roll's recorded ruleset with every later check and character, so a referee's change to the table's rules doesn't alter a roll in progress. It stores the ruleset without applying any rule in it. It calls `bxapi` as a `referee` (via `BXAPI_KEY` or loopback anonymous mode), verifies whether the requesting user has permission to send a command, and filters every response for each recipient's role.
- **The browser client** renders the table, map, sheets, and compendium, and submits user intent. It never evaluates a B/X rule and never contacts `bxapi`.

In production, the bxvtt server also serves the pre-compressed client bundle (`apps/web/dist`), reducing deployment to one bxvtt process and one `bxapi` process on the same host.

## Network topology and trust boundary

Because `bxapi` runs locally against a SQLite database, the bxvtt server runs alongside it on `127.0.0.1`. To invite remote players without opening router ports, the host publishes bxvtt through a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`npm run share` launches a quick tunnel automatically), while `bxapi` remains private on `127.0.0.1`.

The bxvtt server treats every incoming request as untrusted:

- Every API route except `GET /api/health`, `POST /api/users`, and the unauthenticated rejoin endpoints requires a bearer token, and non-members receive HTTP 404 on table routes.
- Invite codes contain 100 bits of entropy, and IP-based token buckets rate-limit user creation, invite attempts, rejoin requests, and host-key checks.
- Only referees receive a table's invite code. The server builds each table description for the recipient's current role, so a player's responses and WebSocket messages leave out `invite_code`. A player still knows the code they joined with, so this keeps from players only a code that a referee replaced after they joined.
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

1. Each player submits declarations for their seated characters (`PUT /api/tables/{t}/game/declarations/{member_id}`). The server keeps only the fields that `bxapi`'s `BattleDeclaration` defines, drops any other field, and stores the declaration even when `bxapi` would refuse it, because another member's declared move can make it legal. It broadcasts the updated `declarations` to the table so party members can plan together.
2. Whenever the server builds the declarations state with at least one stored declaration, it asks `bxapi` to preview them (`POST /v1/sessions/{id}/battle-round/preview`) and caches the answer for each revision and set of declarations. The preview's rejections become `DeclarationsState.refusals`, each with the `member_id` from `params.character`, and its positions and its hide and back-stab lists become `DeclarationsState.projection`: `advance_feet` by member, `front_rank` by group, and `can_hide` and `can_back_stab`, the declarers who could declare a hide or a back-stab beside the other stored declarations. If the preview fails, `refusals` is empty, `projection` is `null`, and `preview_unavailable` is `true`, and the server asks again after 5 seconds.
   A client can also ask which declarations `bxapi` would accept before anyone saves them (`POST /api/tables/{t}/game/declarations/preview`). The server previews the candidates beside the stored declarations and stores nothing. The battle board offers a member's one-click quick action only when this preview accepts it, so the client never judges reach or range itself.
3. Once every declarer has a declaration and the preview refuses none of them, the server calls `resolve_battle_round` automatically when `auto_resolve` is enabled. Otherwise the caller or a referee triggers resolution (`POST /api/tables/{t}/game/declarations/resolve`). A referee can resolve early with `fill_with_hold: true`, which declares `hold` only for members who haven't declared and never replaces a stored declaration.
4. If `bxapi` still refuses the round, the declarations stay and each rejection names its member in `params.character`. A rejection of the round as a whole has `member_id: null`.
5. Once `bxapi` accepts the round, the server clears stored declarations and broadcasts the updated game state and round events.

Every member of the table, player or referee, receives the same declarations state, because the party plans together.

## Role-based projections and monster targets

After every accepted command, bxvtt fetches the full outcome from `bxapi` and constructs separate projections:

- **Players** receive `bxapi`'s `PlayerView`, player-visibility events, and the legal commands of kind `play`. Their `GameState.referee` is `null`.
- **Referees** also receive dynamic `RefereeState`, referee-visibility events, pending `rejoin_requests`, and HTTP access to the cached full adventure document and full event log.

The `PlayerView` states everything the party perceives, and the server sends it to players as `bxapi` returns it, adding nothing derived from the referee view:

- **The map:** entered `areas` with their names, descriptions, walked cells, and the room trap the party knows (`EnteredAreaView.trap_state`, `found` or `sprung`), visible `features` with opaque `feature:` handles, `trap_state`, and `emptied` for an authored cache the party emptied, known `transitions`, the `entrance`, `dungeons`, and `can_travel_to_town`.
- **What the party can reach:** `features_here` lists the `feature:` handles that the treasure commands accept from where the party stands.
- **Item names:** `item_names` and `item_names_plural` name every item ID the view shows, singular and plural. An unidentified magic item has its masked name.

A feed entry records names for the IDs its events name. Each item event names the items it lists in `item_names`, as the party knew them when it happened, and the player view after the command names the rest. Only the player view names a valuable by its own name, so the server also reads the view from before the command for a valuable that the command sold or gave away. The server never reads item names from the referee view.

A player's `take_treasure`, `inspect_treasure`, or `remove_treasure_trap` must name a `feature:` handle or `pile` for dropped goods. The server answers any other `feature_id` from a player with `exploration.feature.unknown` and doesn't call `bxapi`. The check exists because raw authored feature IDs still reach players in trap and search events and in `PlayerView.emptied_caches` ([osrlib-python#322](https://github.com/mmacy/osrlib-python/issues/322)), and a raw ID must not work as a way to test whether a hidden cache exists. A referee's tools send the same handles, which the referee state maps from each raw feature reference in `RefereeState.feature_handles`. `osrlib` refuses a hidden or guessed cache with `exploration.feature.unknown` and an emptied one with `exploration.feature.emptied`.

A player names a monster or NPC adventurer by the ID that the player view lists in `view.encounter.groups[].members`, in `targets` or `target_id`, and a group by its ID in a declaration's `target_group_id`. The server doesn't check a target itself. `bxapi` refuses an ID that the player view doesn't list with the same rejection whether the creature exists or not (`magic.cast.unknown_target`, `items.use.unknown_target`, or `battle.declaration.unknown_group`), and a rejection names only what the command named. So the server forwards commands and declarations as they are, and sends a player `bxapi`'s rejections and preview refusals unchanged. A referee's command gets the same refusal. Players read names such as `Goblin 2`, which `creatureNames` in `@bxvtt/shared/text` builds from the player view and numbers by ID, so a number doesn't change when a group splits.

On a referee's browser, the **Referee lens** (`Shift+L`) switches rendering to the player projection locally so a referee who also plays a character can avoid spoilers.

## Browser-to-server protocol

`packages/shared/src/protocol` defines every HTTP payload and WebSocket message as a zod schema, and `@bxvtt/shared/client` wraps them in `BxvttClient` and `TableConnection`.

- **HTTP (`/api`)** handles request-response mutations and queries, returning RFC 9457 `application/problem+json` documents with stable `code` strings on errors. Commands include `expected_revision` and an `Idempotency-Key` so concurrent clicks cannot apply against stale state; the losing request receives `409 revision_conflict` and a `table_changed` notice.
- **WebSocket (`/ws`)** delivers live state pushes and lightweight signals. After opening a socket, the client authenticates with an `auth` frame (`token`, `table_id`, and optional `feed_after`) and receives a complete role-filtered `snapshot`. Subsequent state frames (`presence`, `table`, `game`, `declarations`, `annotations`, `notes`, and `rejoin_requests`) replace their respective slice wholesale, `feed` frames append one new `FeedEntry` by `seq`, and signal frames (`ping`, `notice`, `heartbeat`, `error`, and `removed`) report ephemeral events, allowing automatic recovery on reconnect or `resync`.
- **A game the server can't load:** A snapshot of a table in play needs its `bxapi` session. When the server can't build one, it sends an `error` frame and closes the socket. The code says whether the cause ends by itself (`bxapi_unavailable`, `bxapi` is unreachable, and the client reconnects with backoff) or never does (`game_missing`, `bxapi` no longer has the session, and the client stops and offers the member a way to leave, delete, or try again). The server records the second case in the table's game summary (`missing`), so the table list shows it without opening the table, and the leave, delete, and end-game routes work without the session.

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
