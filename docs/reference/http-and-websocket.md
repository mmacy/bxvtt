---
title: HTTP API, WebSocket, and SDK
sidebar_label: HTTP, WebSocket, and SDK
description: Reference for BxvttClient, TableConnection, all 66 HTTP endpoints, WebSocket messages, problem codes, scene projection, target handles, and rejoin flows.
sidebar_position: 1
---

# HTTP API, WebSocket, and SDK

Every request body, response payload, and WebSocket message between the browser and the bxvtt server is validated with a zod schema in `@bxvtt/shared/protocol` and exposed through the typed client SDK in `@bxvtt/shared/client`.

## End-to-end TypeScript SDK example

```ts
import { BxvttClient, TableConnection, isProblem } from '@bxvtt/shared/client';

// Omit baseUrl inside a browser served by the bxvtt server itself.
const referee = new BxvttClient({ baseUrl: 'http://127.0.0.1:8660' });
const { token } = await referee.createUser('Rhea');
const table = await referee.createTable({ name: 'Thursday barrow' });

const player = new BxvttClient({ baseUrl: 'http://127.0.0.1:8660' });
await player.createUser('Alice');
await player.joinTable(table.invite_code);

const brenna = await player.createCharacter({
  name: 'Brenna',
  class_id: 'fighter',
  alignment: 'lawful',
  purchases: [{ item_id: 'leather' }, { item_id: 'sword' }],
  equip_item_ids: ['leather', 'sword'],
});
await player.addToRoster(table.id, brenna.id);

const connection = new TableConnection({
  url: 'ws://127.0.0.1:8660/ws',
  token,
  tableId: table.id,
});
connection.on('game', ({ game }) => console.log('revision', game?.revision, 'mode', game?.mode));
connection.on('feed', ({ entry }) => console.log(entry.kind));
connection.connect();

let game = await referee.startGame(table.id, { adventure_id: 'builtin-barrow' });

try {
  const result = await player.sendCommand(
    table.id,
    { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
    game.revision,
  );
  if (!result.accepted) console.log(result.rejections);
  game = result.game;
} catch (error) {
  if (isProblem(error, 'revision_conflict')) {
    console.log('Current revision:', error.problem.revision);
  }
}
```

## HTTP endpoints

All paths below sit under `/api` (for example, `GET /api/health`), and `{t}` denotes a table ID. Every route requires `Authorization: Bearer <token>` except `GET /api/health`, `POST /api/users`, and the four visitor rejoin endpoints (`POST /api/rejoin/lookup`, `POST /api/rejoin`, `POST /api/rejoin/{request_id}/status`, and `POST /api/rejoin/{request_id}/cancel`).

### Health, users, and rejoin

| Method and path | `BxvttClient` method | Authorization | Response |
| --- | --- | --- | --- |
| `GET /health` | `health()` | Public (`bxapi` details require a user token) | `Health` |
| `POST /users` | `createUser(name)` | Public (rate-limited) | `CreateUserResponse` (includes `token`) |
| `GET /users/me` | `me()` | User | `User` |
| `PATCH /users/me` | `updateMe(body)` | User | `User` |
| `POST /rejoin/lookup` | `lookupRejoin(code)` | Invite code (rate-limited) | `RejoinLookup` |
| `POST /rejoin` | `requestRejoin(code, userId)` | Invite code (rate-limited) | `RejoinTicket` |
| `POST /rejoin/{request_id}/status` | `rejoinStatus(id, secret)` | Ticket secret | `RejoinStatus` |
| `POST /rejoin/{request_id}/cancel` | `cancelRejoin(id, secret)` | Ticket secret (accepts JSON or `text/plain` beacon) | `204` |
| `GET /tables/{t}/rejoin-requests` | `listRejoinRequests(tableId)` | Referee | `RejoinRequestList` |
| `POST /tables/{t}/rejoin-requests/{id}/approve` | `approveRejoin(tableId, id)` | Referee (other than requested member) | `RejoinRequestList` |
| `POST /tables/{t}/rejoin-requests/{id}/decline` | `declineRejoin(tableId, id)` | Referee (other than requested member) | `RejoinRequestList` |

### Tables, members, roster, and characters

| Method and path | `BxvttClient` method | Authorization | Response |
| --- | --- | --- | --- |
| `GET /tables` | `listTables()` | User | `TableList` (includes `online_count`) |
| `POST /tables` | `createTable(body)` | User (`host_key` required when configured) | `TableDetail` |
| `GET /tables/{t}` | `getTable(tableId)` | Table member | `TableDetail` |
| `PATCH /tables/{t}` | `updateTable(tableId, body)` | Referee | `TableDetail` |
| `DELETE /tables/{t}` | `deleteTable(tableId)` | Referee | `204` |
| `POST /tables/{t}/invite-code` | `regenerateInviteCode(tableId)` | Referee | `TableDetail` |
| `POST /join` | `joinTable(code)` | User (rate-limited) | `TableDetail` |
| `POST /tables/{t}/leave` | `leaveTable(tableId)` | Table member (except sole referee while others remain) | `204` |
| `PATCH /tables/{t}/members/{user_id}` | `setMemberRole(tableId, userId, role)` | Referee | `TableDetail` |
| `DELETE /tables/{t}/members/{user_id}` | `removeMember(tableId, userId)` | Referee | `TableDetail` |
| `POST /tables/{t}/roster` | `addToRoster(tableId, characterId)` | Character owner (in lobby) | `TableDetail` |
| `PUT /tables/{t}/roster` | `reorderRoster(tableId, entryIds)` | Referee (in lobby) | `TableDetail` |
| `DELETE /tables/{t}/roster/{entry_id}` | `removeFromRoster(tableId, entryId)` | Character owner or referee | `TableDetail` |
| `POST /ability-rolls` | `rollAbilities(body?)` | User | `bxapi` `AbilityRoll` |
| `GET /ability-rolls/{roll_id}` | `getAbilityRoll(rollId)` | Roll owner | `bxapi` `AbilityRoll` |
| `POST /characters/preview` | `previewCharacter(body)` | User | `bxapi` generated character |
| `POST /characters/check` | `checkCharacter(body)` | Roll owner (rate-limited) | `CharacterCheck` |
| `POST /characters` | `createCharacter(body)` | User | `bxapi` `StoredCharacter` |
| `GET /characters` | `listCharacters()` | User | Stored character list |
| `GET /characters/{id}` | `getCharacter(id)` | Owner, or referee of a table rostering the character | `bxapi` `StoredCharacter` |
| `DELETE /characters/{id}` | `deleteCharacter(id)` | Owner | `204` |

### Rules, adventures, sessions, saves, feed, and annotations

| Method and path | `BxvttClient` method | Authorization | Response |
| --- | --- | --- | --- |
| `GET /rules/{path}` | `rules(path, query?)` | User | Proxied `bxapi` `/v1/rules/{path}` with `ETag` |
| `GET /catalogs/{catalog}` | `fullCatalog(catalog)` | User | `FullCatalog` (`classes`, `equipment`, `monsters`, `spells`, `magic-items`) |
| `POST /dice/roll` | `rollDice(body)` | User | `bxapi` `DiceRollResponse` |
| `POST /tables/{t}/generate/{kind}` | `generate(tableId, kind, body)` | Referee | `bxapi` generator output |
| `GET /tables/{t}/adventures` | `listAdventures(tableId)` | Table member | `AdventureList` |
| `POST /tables/{t}/adventures/validate` | `validateAdventure(tableId, doc)` | Referee | `AdventureValidation` |
| `POST /tables/{t}/adventures` | `uploadAdventure(tableId, doc)` | Referee | `AdventureListing` |
| `DELETE /tables/{t}/adventures/{id}` | `deleteAdventure(tableId, id)` | Referee | `204` |
| `POST /tables/{t}/game` | `startGame(tableId, body)` | Referee | `GameState` |
| `GET /tables/{t}/game` | `getGame(tableId)` | Table member | `GameState` |
| `DELETE /tables/{t}/game` | `endGame(tableId)` | Referee | `204` |
| `POST /tables/{t}/game/commands` | `sendCommand(tableId, cmd, expectedRevision?)` | Command permission class | `CommandResult` |
| `GET /tables/{t}/game/events` | `listEvents(tableId, query?)` | Table member (`referee` visibility requires referee) | `bxapi` `EventPage` |
| `GET /tables/{t}/game/referee` | `getRefereeState(tableId)` | Referee | `RefereeState` |
| `GET /tables/{t}/game/adventure` | `getAdventureDocument(tableId)` | Referee | Adventure JSON with `ETag` |
| `PUT /tables/{t}/game/seats/{member_id}` | `setSeat(tableId, memberId, userId)` | Referee | `SeatList` |
| `GET /tables/{t}/game/declarations` | `getDeclarations(tableId)` | Table member | `DeclarationsState` or `null` |
| `PUT /tables/{t}/game/declarations/{member_id}` | `declare(tableId, memberId, decl)` | Seat holder or referee | `DeclarationsState` |
| `DELETE /tables/{t}/game/declarations/{member_id}` | `clearDeclaration(tableId, memberId)` | Seat holder or referee | `DeclarationsState` |
| `POST /tables/{t}/game/declarations/resolve` | `resolveRound(tableId, fillWithHold?)` | Party-command sender (early fill requires referee) | `ResolveRoundResult` |
| `GET /tables/{t}/saves` | `listSaves(tableId)` | Table member | `SaveList` |
| `POST /tables/{t}/saves` | `createSave(tableId, label?)` | Table member | `SaveEntry` |
| `PATCH /tables/{t}/saves/{save_id}` | `renameSave(tableId, saveId, label)` | Save creator or referee | `SaveEntry` |
| `DELETE /tables/{t}/saves/{save_id}` | `deleteSave(tableId, saveId)` | Save creator or referee | `204` |
| `POST /tables/{t}/saves/{save_id}/restore` | `restoreSave(tableId, saveId)` | Referee | `GameState` |
| `GET /tables/{t}/saves/{save_id}/document` | `exportSave(tableId, saveId)` | Referee | `bxapi` save JSON document |
| `GET /tables/{t}/feed` | `getFeed(tableId, query?)` | Table member | `FeedPage` |
| `POST /tables/{t}/feed` | `postFeed(tableId, body)` | Table member | `FeedEntry` |
| `GET /tables/{t}/annotations` | `getAnnotations(tableId, level)` | Table member (mapped levels only for players) | `LevelAnnotations` |
| `POST /tables/{t}/annotations` | `createAnnotation(tableId, body)` | Table member (mapped levels only for players) | `Annotation` |
| `DELETE /tables/{t}/annotations/{id}` | `deleteAnnotation(tableId, id)` | Annotation author or referee | `204` |
| `POST /tables/{t}/annotations/clear` | `clearAnnotations(tableId, level)` | Referee | `204` |
| `GET /tables/{t}/notes/{kind}` | `getNotes(tableId, kind)` | Table member (`referee` kind requires referee) | `Notes` |
| `PUT /tables/{t}/notes/{kind}` | `updateNotes(tableId, kind, text, version)` | Table member (`referee` kind requires referee) | `Notes` |

`GET /api/rules/{path}` proxies `classes`, `monsters`, `spells`, `equipment`, `magic-items`, `languages`, `tables`, `commands`, and `license` (plus optional `/{id}` and query filters), caching entries in memory and revalidating with `bxapi` every 5 minutes. `GET /api/catalogs/{catalog}` bundles every full entry of `classes`, `equipment`, `monsters`, `spells`, or `magic-items` into a single gzip-compressed, `ETag`-cached response so the client never issues N+1 entry fetches.

## WebSocket protocol (`/ws`)

Clients send `auth` as their first frame within 10 seconds of connecting. `TableConnection` handles heartbeats, exponential-backoff reconnection, and `feed_after` catch-up automatically.

| Direction | `type` | Payload fields |
| --- | --- | --- |
| Client to server | `auth` | `token`, `table_id`, optional `feed_after` (`seq` cursor). |
| Client to server | `heartbeat` | Empty keepalive frame (sent every 20 seconds by `TableConnection`). |
| Client to server | `ping` | `dungeon_id`, `level_number`, `x`, `y` cell coordinates. |
| Client to server | `resync` | Optional `feed_after`; requests a fresh `snapshot`. |
| Server to client | `snapshot` | `user`, `role`, `table`, `presence`, `game`, `declarations`, `feed`, `annotations`, `notes`, `server_time`, and `rejoin_requests` (referees only). |
| Server to client | `presence` | `presence.online` list of connected user IDs. |
| Server to client | `table` | Complete updated `TableDetail`. |
| Server to client | `game` | Complete role-projected `GameState`, or `null` in the lobby. |
| Server to client | `feed` | Single new `FeedEntry` visible to the recipient. |
| Server to client | `declarations` | Complete `DeclarationsState`, or `null` outside battle. |
| Server to client | `annotations` | Full annotation list for one dungeon level visible to the recipient. |
| Server to client | `ping` | Map ping with `user_id` and `at` timestamp (delivered to players only on mapped levels). |
| Server to client | `notes` | Updated `Notes` document (`party` or `referee`). |
| Server to client | `rejoin_requests` | Pending rejoin requests for the table (referees only). |
| Server to client | `notice` | `code` (`table_changed`, `game_restored`, `game_started`, or `game_ended`) and `detail`. |
| Server to client | `heartbeat` | `server_time`. |
| Server to client | `error` | `code` and `detail` when a client frame fails validation or rate limits. |
| Server to client | `removed` | `reason` (`left`, `kicked`, or `table_deleted`), followed by socket closure. |

### WebSocket close codes (`WS_CLOSE_CODES`)

| Code | Name | Client behavior in `TableConnection` |
| --- | --- | --- |
| `1001` | `server_shutdown` | Reconnects with backoff. |
| `1009` | `message_too_large` | Frame exceeded 16 KiB or used binary encoding. |
| `1013` | `try_again_later` | Reconnects with backoff. |
| `4001` | `auth_failed` | Stops reconnecting (invalid or retired token). |
| `4003` | `removed` | Stops reconnecting (user left, was removed, or table was deleted). |
| `4008` | `rate_limited` | Exceeded connection quota or 40 frames per 2 seconds. |
| `4010` | `resync` | Reconnects immediately (sent when a member's role changes). |

## Problem responses (`PROBLEM_CODES`)

Every HTTP error returns an RFC 9457 `application/problem+json` object containing `status`, `title`, `detail`, `code`, and `request_id` (matching the `X-Request-Id` response header), wrapped as `BxvttProblemError` in the SDK:

- **400:** `bad_request`
- **401:** `unauthorized`, `token_retired`
- **403:** `forbidden`, `referee_required`, `host_key_required`, `referee_command`, `adventure_read_only`
- **404:** `not_found`, `invite_invalid`
- **405:** `method_not_allowed`
- **409:** `last_referee`, `game_active`, `no_game`, `duplicate_character`, `roster_empty`, `revision_conflict` (includes `revision`), `stale_version`, `not_in_battle`, `not_a_declarer`, `declarations_incomplete`, `use_declarations`, `ability_roll_used`, `version_unsupported`, `session_busy`, `rejoin_member_online`, `rejoin_pending`, `rejoin_not_pending`, `rejoin_no_approver`
- **413:** `content_too_large`
- **415:** `unsupported_media_type`
- **422:** `validation_error` (includes `errors`), `unknown_command`, `content_invalid`, `character_invalid` (includes `rejections` or `field`/`index`/`id`), `party_invalid`, `target_unknown` (includes `field` and `id`)
- **429:** `rate_limited` (with `Retry-After`)
- **500:** `internal_error`
- **502:** `bxapi_error`, `invalid_response` (synthesized by SDK when a 2xx body is not JSON)
- **503:** `bxapi_unavailable`, `server_unavailable` (synthesized by SDK when a proxy/tunnel returns non-JSON 502/503/504)
- **507:** `bxapi_storage_full` (includes `used_bytes` and `max_bytes`)

## Key server protocols

### `game.scene` and `tgt_` monster target handles

- **`game.scene`** supplements `PlayerView` with `here` (current area name/description, reachable caches, custom features, found tricks, cell transitions, known traps, and dropped `pile` presence), `levels` (mapped areas, stairs, traps, caches, and entrance coordinates), `names` (display names for item IDs, preserving masked names such as `a potion` for unidentified items), `dungeon_names`, `can_travel_to_town`, and `targets`.
- **`scene.targets`** assigns each visible monster a persistent 96-bit handle (`tgt_` + 16 base64url characters), `group_id`, `label` (such as `Ogre` or `Goblin 2`), `number`, `defeated`, and `fled`. Invisible monsters receive no handle until revealed. When a player submits `targets` or `target_id` in `cast_spell`, `use_item`, or a battle declaration, the server swaps valid handles for `bxapi` monster IDs (or rejects stale handles with `422 target_unknown`) and rewrites outbound player rejections and declarations back to handles.

### Battle refusal attribution

When `bxapi` rejects `resolve_battle_round`, `osrlib` returns a flat list of rejections, some of which (such as `combat.attack.out_of_reach` or `magic.cast.too_many_targets`) omit the acting character's ID. The server attributes nameless rejections in three steps:

1. Match any rejection parameter naming a declarer (`character`, `caster`, `attacker`, or `member`).
2. Eliminate plain `hold` declarations; if only one non-hold suspect remains, assign remaining rejections to that member.
3. Probe each remaining non-moving declaration by re-submitting the round with that member's declaration replaced by `{ action: "hold", back_stab: true }`, which `osrlib` unconditionally rejects with `battle.declaration.back_stab_not_attack` without advancing the session. Any rejection that disappears in the probe belongs to that member. Unresolved movement ties return `member_id: null` with `candidates`.

### Non-destructive character checking (`POST /api/characters/check`)

The character wizard validates choices at every step without consuming the user's `ability_roll_id`. The server calls `bxapi`'s `POST /v1/characters` with a synthetic sentinel `'bxvtt-character-check'` appended to `equip_item_ids`. Because `osrlib` validates equipping last and aborts without storing the character or consuming the roll on `character_invalid`, failing specifically on `'bxvtt-character-check'` proves all real choices succeeded. To determine rolled starting gold (`gold_gp`), the server runs ~3 probe calls with calibrated equipment lots to locate the `items.purchase.insufficient_funds` threshold and caches `[ability_roll_id, class_id, hp_reroll_at_first_level]` in memory.
