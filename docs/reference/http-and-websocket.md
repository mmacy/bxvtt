---
title: HTTP API, WebSocket, and SDK
sidebar_label: HTTP, WebSocket, and SDK
description: Reference for BxvttClient, TableConnection, all 72 HTTP endpoints, WebSocket messages, problem codes, what players see, monster targets, battle round previews, and rejoin flows.
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
| `DELETE /users/me` | `deleteMe()` | User (except sole referee of a table while others remain) | `204` |
| `POST /users/me/sign-out` | `signOut()` | User | `204` |
| `POST /rejoin/lookup` | `lookupRejoin(code)` | Invite code (rate-limited) | `RejoinLookup` |
| `POST /rejoin` | `requestRejoin(code, userId)` | Invite code (rate-limited) | `RejoinTicket` |
| `POST /rejoin/{request_id}/status` | `rejoinStatus(id, secret)` | Ticket secret | `RejoinStatus` |
| `POST /rejoin/{request_id}/cancel` | `cancelRejoin(id, secret)` | Ticket secret (accepts JSON or `text/plain` beacon) | `204` |
| `GET /tables/{t}/rejoin-requests` | `listRejoinRequests(tableId)` | Referee | `RejoinRequestList` |
| `POST /tables/{t}/rejoin-requests/{id}/approve` | `approveRejoin(tableId, id)` | Referee (other than requested member) | `RejoinRequestList` |
| `POST /tables/{t}/rejoin-requests/{id}/decline` | `declineRejoin(tableId, id)` | Referee (other than requested member) | `RejoinRequestList` |

`POST /users/me/sign-out` makes the server stop accepting the token without issuing a new one, and closes the user's WebSocket connections with `auth_failed`. The user, their memberships, seats, and characters stay. Because bxvtt has no passwords, only an approved rejoin request gives the user a token again. `signOut()` clears the SDK client's token before the request leaves, so later calls on that client send no token.

`DELETE /users/me` deletes the calling user. The server checks every table the user belongs to first, and when the user is the only referee of a table with other members it answers `409 last_referee`, names those tables in `detail`, and changes nothing. The user can make another member a referee or delete the table, then try again. If a leave or the row deletion fails, the server restores the token and answers with the error. Tables the user already left stay left, and the user can try again. Otherwise it does the following:

1. Stops accepting the user's token.
2. Takes the user out of each table exactly as `POST /tables/{t}/leave` does. A table where the user is the last member is deleted with its saves. At every other table, the user's seats become empty (a referee controls those characters), their characters leave the lobby roster, they stop being the caller, a `member_left` notice joins the feed, their connections receive `removed` with reason `left`, and the other members receive `presence`, `table`, and `game` updates.
3. Replaces the user's ID in the rows of every remaining table, including tables the user left earlier, with a new, unassigned user ID (one per table). Chat, whispers, rolls, notices, saves, notes, pins, and declarations stay, and clients show their author as a former member. A table the user created names its first referee as `created_by` instead.
4. Deletes the user's stored characters (also from `bxapi`), ability rolls, retired tokens, and user row. A game in progress keeps its copy of each character.
5. Cancels pending rejoin requests for the user.

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
| `POST /ability-rolls` | `rollAbilities(body?)` | User | `bxapi` `AbilityRoll`, whose `rolls` hold the three six-sided dice behind each score |
| `GET /ability-rolls/{roll_id}` | `getAbilityRoll(rollId)` | Roll owner | `bxapi` `AbilityRoll`, with the same `rolls` |
| `GET /ability-rolls/{roll_id}/starting-rolls` | `getStartingRolls(rollId)` | Roll owner | `StartingRollsStatus` |
| `POST /ability-rolls/{roll_id}/hit-points` | `rollHitPoints(rollId, body)` | Roll owner (rate-limited) | `StartingRolls` |
| `POST /ability-rolls/{roll_id}/gold` | `rollStartingGold(rollId, body)` | Roll owner (rate-limited) | `StartingRolls` |
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
| `GET /tables/{t}/game/rules/spells/{spell_id}` | `getSessionSpell(tableId, spellId)` | Table member | `bxapi` `SpellTemplate` from the session's catalog, with `ETag` |
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

`GET /api/tables/{t}/game/rules/spells/{spell_id}` proxies `bxapi`'s `GET /v1/sessions/{id}/rules/spells/{spell_id}` for the table's game, so it returns a spell that the adventure bundles, which `GET /api/rules/spells/{id}` doesn't have. Any member of the table, player or referee, may read it. It answers for a spell that the player view names in `spell_names`, and answers `404 not_found` for any other spell, for an ID that no catalog has, and for an ID outside letters, digits, `_`, `.`, and `-` (at most 100 characters). A non-member gets the same `404` as for a table that doesn't exist. The response has `Cache-Control: private, no-cache` and an `ETag`, and a matching `If-None-Match` gets `304`.

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
| `4001` | `auth_failed` | Stops reconnecting (invalid, retired, or signed-out token). |
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
- **409:** `last_referee`, `game_active`, `no_game`, `duplicate_character`, `roster_empty`, `revision_conflict` (includes `revision`), `stale_version`, `not_in_battle`, `not_a_declarer`, `declarations_incomplete`, `use_declarations`, `ability_roll_used`, `ability_roll_locked` (includes `class_id` and `hp_reroll_at_first_level`), `hit_points_not_rolled`, `gold_not_rolled`, `version_unsupported`, `session_busy`, `rejoin_member_online`, `rejoin_pending`, `rejoin_not_pending`, `rejoin_no_approver`
- **413:** `content_too_large`
- **415:** `unsupported_media_type`
- **422:** `validation_error` (includes `errors`), `unknown_command`, `content_invalid`, `character_invalid` (includes `rejections` or `field`/`index`/`id`), `party_invalid`
- **429:** `rate_limited` (with `Retry-After`)
- **500:** `internal_error`
- **502:** `bxapi_error`, `save_unreadable` (`bxapi` can't read the save to restore, because its rules engine was updated after the save was made), `invalid_response` (synthesized by SDK when a 2xx body is not JSON)
- **503:** `bxapi_unavailable`, `server_unavailable` (synthesized by SDK when a proxy/tunnel returns non-JSON 502/503/504)
- **507:** `bxapi_storage_full` (includes `used_bytes` and `max_bytes`)

## Key server protocols

### What players see, treasure commands, and monster targets

The player view (`game.view`) states everything the party perceives, and the server sends it to every member as `bxapi` returns it, adding nothing derived from the referee view. A client reads these fields from the view:

- **Areas:** `explored[].areas`, each entered area with its name, description, walked cells, and `trap_state`: `found` or `sprung` for a room trap the party knows, and `null` otherwise, including for a room with no trap. A room never shows `removed`.
- **Features:** `explored[].features`, each visible feature with an opaque `feature:` handle in `id`, its `description`, its `trap_state`, and `emptied`, which is `true` for an authored treasure cache the party has emptied. An emptied cache stays in the list under the same handle.
- **Caches in reach:** `features_here`, the `feature:` handles that `take_treasure`, `inspect_treasure`, and `remove_treasure_trap` accept from where the party stands. It's empty unless the game is exploring.
- **Item names:** `item_names` and `item_names_plural`, the singular and plural name of every item ID that the view shows, such as `vial of holy water` and `vials of holy water`. An unidentified magic item has its masked name, such as `potion`. `PileView.contents` lists each `item_id` and `quantity` in a pile of dropped goods.
- **The rest of the map:** `explored[].transitions`, `explored[].entrance`, `dungeons`, and `can_travel_to_town`. A transition doesn't say where it leads, and a trap doesn't state its trigger.

A player's `take_treasure`, `inspect_treasure`, or `remove_treasure_trap` names a `feature:` handle or `pile` in `feature_id`. For any other `feature_id` from a player, the server answers `accepted: false` with `exploration.feature.unknown` and doesn't call `bxapi`, because raw authored feature IDs still reach players in trap and search events and in `PlayerView.emptied_caches` ([osrlib-python#322](https://github.com/mmacy/osrlib-python/issues/322)). A referee can send either form, and the referee's tools send the handle from `RefereeState.feature_handles`, which maps each raw feature reference (`{dungeon}:{level}:{feature id}`, or a generated cache's ID) to its handle. `osrlib` refuses a hidden or guessed cache with `exploration.feature.unknown`, answers `remove_treasure_trap` with the same code whether the cache has no trap or an unfound one, and refuses to take an emptied cache with `exploration.feature.emptied`.

A player names a monster or NPC adventurer by the ID that the view lists in `view.encounter.groups[].members` (`{ id, status }`), in `targets` of `cast_spell`, `use_item`, and a battle declaration, and in `target_id` of `use_item`.

- **Refusals:** The server doesn't check targets. `bxapi` refuses an ID that the view doesn't list with the same rejection whether the creature exists or not: `magic.cast.unknown_target` for the target of a spell or a scroll, `items.use.unknown_target` for another device's `target_id` outside a battle, and `battle.declaration.unknown_group` for a group ID in a declaration's `target_group_id`. A referee's command gets the same refusal.
- **What players receive:** The server forwards a player's commands as they are. It stores a declaration with whatever target it names, keeping only the fields that `bxapi`'s `BattleDeclaration` defines and dropping any other, and sends every member the same declarations state. Rejections and preview refusals reach a player as `bxapi` returns them, and each one names only what the command or declaration named.
- **Names:** `creatureNames` in `@bxvtt/shared/text` builds names such as `Goblin 2` from the view's groups and numbers them by ID, so a number doesn't change when a group splits. A creature that is alone with its label reads by the label, such as `Ogre`. A feed entry records each monster's name in `names.monsters[id].name` (`EntryLabel.name`), so the entry reads the same after the encounter ends.

### Battle round preview and refusals

The server asks `bxapi` to preview the stored declarations (`POST /v1/sessions/{id}/battle-round/preview`) whenever it builds `DeclarationsState` with at least one stored declaration, once for each revision and set of declarations. A refused declaration stays stored, because another member's declared move can make it legal.

- **`refusals`:** the preview's rejections, each with `member_id` (from `params.character`), `code`, and `params`. The list is empty when the session would accept the declarations.
- **`projection`:** `RoundProjection | null`, with `advance_feet` by member (where each living member would stand, in feet forward of the party line) and `front_rank` by group (the members who would stand in its front rank), after the declared moves, and `can_hide` and `can_back_stab`, the preview's lists of declarers who could declare a `hide` or an `attack` with `back_stab` beside the other stored declarations, in marching order. It is `null` when nobody has declared or the preview failed.
- **A failed preview:** `refusals` is empty, `projection` is `null`, and `preview_unavailable` is `true`, so a client can tell that nothing was checked from a preview that refused nothing. The server asks again after 5 seconds. Auto-resolve then goes ahead and leaves the judgment to `bxapi`. A preview without `can_hide` and `can_back_stab`, from a `bxapi` built on an `osrlib` older than 2.8, counts as a failed preview.
- **Resolving:** the server resolves a round automatically (with `auto_resolve` on) only when every declarer has declared and `refusals` is empty. `POST /api/tables/{t}/game/declarations/resolve` with `fill_with_hold: true` declares `hold` only for members who haven't declared and never replaces a stored declaration, so a round with a refused declaration stays refused until its member declares again.
- **A refused round:** when `bxapi` still refuses `resolve_battle_round`, `accepted` is `false`, the declarations stay, and `declarations.refusals` lists each rejection with the member in `params.character`. A rejection of the whole round, such as `battle.declaration.roster_mismatch`, has `member_id: null`.
- **Hide and back-stab:** `declaration.action` accepts `hide`. A hiding member appears in `view.encounter.hiding`, and the view never says whether a hide worked. Offer a hide or a back-stab to the members in `projection.can_hide` and `projection.can_back_stab` when `projection` isn't `null`, and to the members in `view.encounter.can_hide` and `view.encounter.can_back_stab` otherwise.

### Starting rolls and character checks

The character wizard checks choices at every step and shows the player their hit points and starting gold before the character exists, without using up the user's ability roll. Both rely on `bxapi`'s `POST /v1/ability-rolls/{roll_id}/preview`, which returns the character that creation would store from the roll and the choices, stores nothing, and returns the same dice for the same class and reroll option every time.

- **`POST /api/characters/check`** sends the choices to the preview and returns `{ valid, problem }`, where `problem` is `bxapi`'s `character_invalid` problem with its `rejections` or `field`, `index`, and `id`. The response never contains the previewed character, hit points, or gold.
- **`POST /api/ability-rolls/{roll_id}/hit-points`** takes `class_id`, an optional `hp_reroll_at_first_level`, and an arcane caster's `starting_spell_ids` (because `bxapi` checks the first spell before it rolls hit points). It returns `StartingRolls`: `class_id`, `hp_reroll_at_first_level`, `bxapi`'s `hit_point_roll` (every die in the order thrown, the last one counting, and `hit_points`), and `gold_roll` (`null` until the gold is rolled). The first request fixes the class and the reroll option for the ability roll. A repeat with the same choices returns the same dice, so the wizard sends it again to show the rolls after a reload.
- **`POST /api/ability-rolls/{roll_id}/gold`** takes the same body after the hit points are rolled and returns `StartingRolls` with `bxapi`'s `gold_roll` (`rolls`, `modifier`, `multiplier`, and `total`).
- **`GET /api/ability-rolls/{roll_id}/starting-rolls`** returns `StartingRollsStatus`: `used`, the fixed `class_id` and `hp_reroll_at_first_level` (`null` before the hit points are rolled), and `gold_rolled`. It contains no dice.

The server stores only the fixed class, the reroll option, and whether the gold is rolled, on its row for the ability roll. It refuses any request that would reveal a roll the player hasn't made:

- A check, a roll, or a creation from the ability roll with another class or reroll option than the hit points were rolled with gets `409 ability_roll_locked`, with the fixed `class_id` and `hp_reroll_at_first_level`.
- A check or a creation with `purchases` or `equip_item_ids` before the gold is rolled gets `409 gold_not_rolled`, because a refused purchase leaves the roll unused and reveals the gold.
- Rolling the gold before the hit points gets `409 hit_points_not_rolled`.

Creating a character from an ability roll in one request, with no purchases, needs no starting rolls. Two requests that roll hit points at once fix the choices once: the server asks `bxapi` first and records the choices only when none are recorded, so the second request either matches the first or gets `ability_roll_locked`. Checks and starting rolls share the per-user limit for character checks.
