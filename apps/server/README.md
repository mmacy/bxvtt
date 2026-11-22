# bxvtt server

The bxvtt server sits between the browser and bxapi. It stores the people at each table (users, tables, seats, chat, map annotations, notes, and pending battle declarations), checks whether a user may send each command, calls bxapi as a referee, and sends each user only what their role may see. The browser talks only to this server: HTTP under `/api` for requests, and a WebSocket at `/ws` for what the server pushes.

Every request body, response, and WebSocket message is a zod schema with an inferred type in `@bxvtt/shared/protocol`. The typed client SDK in `@bxvtt/shared/client` wraps all of them, so a web client never builds a URL or parses a message by hand.

## Run it

You need Node 24 and a running bxapi. From the repository root:

```sh
npm install
npm run dev:bxapi                 # terminal 1: bxapi on http://127.0.0.1:8651
npm run dev -w @bxvtt/server      # terminal 2: the server on http://127.0.0.1:8660
```

`npm run dev` at the root starts the server and the Vite client together. The `dev` script points the server at the development bxapi on port 8651 unless you set `BXAPI_URL` yourself, and it restarts the server when a file changes.

Check that the server reaches bxapi:

```sh
curl -s http://127.0.0.1:8660/api/health
```

The response should have `"status": "ok"` and the facts from bxapi's `GET /v1/meta`. When bxapi is down, the health check answers 503 and every route that needs bxapi answers 503 `bxapi_unavailable`.

To run the production build, which also serves the built web client from `apps/web/dist`:

```sh
npm run build
BXAPI_URL=http://127.0.0.1:8651 npm start
```

To let players on other networks join through a Cloudflare quick tunnel, install `cloudflared`, run `npm run build`, and then run `npm run share`. It prints the public address and a host key. Players join with an invite link and need no key. You need the key to create a table.

### Settings

The server reads its settings from environment variables. A relative path resolves against the repository root.

| Variable | Default | Meaning |
| --- | --- | --- |
| `BXVTT_PORT` | `8660` | Port to listen on. |
| `BXVTT_HOST` | `127.0.0.1` | Address to listen on. |
| `BXVTT_DATA_DIR` | `.data` | Directory for `bxvtt.db`, the SQLite database. A restart loses nothing except who is connected. |
| `BXAPI_URL` | `http://127.0.0.1:8640` | Base URL of bxapi. The `dev` script sets `http://127.0.0.1:8651`. |
| `BXAPI_KEY` | none | A bxapi key with the `referee` role. Leave it unset for a bxapi in anonymous mode. |
| `BXVTT_HOST_KEY` | none | When set, creating a table needs this key in `host_key`. |
| `BXVTT_PUBLIC_ORIGINS` | none | Extra origins, separated by commas, that may open the WebSocket, such as `https://table.example`. |
| `BXVTT_WEB_DIST` | `apps/web/dist` | The built web client. The server serves it only when `index.html` exists there. |
| `BXVTT_ADVENTURES_DIR` | `adventures` | The sample adventure documents the server offers every table. |
| `BXVTT_LOG_LEVEL` | `info` | pino log level, such as `debug` or `silent`. |
| `BXVTT_ALLOW_CHARACTER_SEEDS` | `false` | Set `true` to let users pass `seed` when they roll abilities or create a character. Tests set it. |

The server logs one JSON line per request with the method, the path without its query string, the status, the time in milliseconds, the user ID, and the client's IP address. It never logs a token. On SIGINT or SIGTERM it closes the WebSockets and the database and exits.

## A full flow with the SDK

```ts
import { BxvttClient, TableConnection } from '@bxvtt/shared/client';

// In a browser that loads the client from the server, leave baseUrl out.
const referee = new BxvttClient({ baseUrl: 'http://127.0.0.1:8660' });
const { token } = await referee.createUser('Rhea'); // the client keeps the token for later requests
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

// Live updates for the referee's view of the table.
const connection = new TableConnection({ url: 'ws://127.0.0.1:8660/ws', token, tableId: table.id });
connection.on('game', ({ game }) => console.log('revision', game?.revision, 'mode', game?.mode));
connection.on('feed', ({ entry }) => console.log(entry.kind));
connection.connect();

let game = await referee.startGame(table.id, { adventure_id: 'builtin-barrow' });

// Alice owns the first seat, so she is the caller and moves the party.
const result = await player.sendCommand(
  table.id,
  { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
  game.revision,
);
if (!result.accepted) console.log(result.rejections); // a refused command reaches the sender alone
game = result.game;

// In a battle, each player declares for their own seats.
await player.declare(table.id, 'character-0001', { action: 'attack', target_group_id: 'group-0001' });
```

Each SDK method throws a `BxvttProblemError` on an error status. Test it with `isProblem(error, 'revision_conflict')`, and read the problem document in `error.problem`.

## How the state reaches a client

A client keeps four pieces of state, and each WebSocket state message replaces one of them:

- The **table** (`TableDetail`): members, roles, settings, the lobby roster, the invite code, and a short game summary. It arrives in `table` messages.
- The **game** (`GameState`): bxapi's player view, the scene, the legal commands, the seats, the caller, and for a referee the dynamic referee state. It arrives in `game` messages, after every accepted command and every seat or caller change.
- The **declarations** (`DeclarationsState`) of the current battle round. They arrive in `declarations` messages.
- The **feed**: entries arrive one at a time in `feed` messages, each with an increasing `seq`.

After the socket opens, the client sends `{"type": "auth", "token": ..., "table_id": ..., "feed_after": ...}` as its first message. The token never goes in the URL, so no log or `Referer` header records it. The server answers with a `snapshot` that contains all four pieces, the presence list, the annotations of the party's level, and the notes. `TableConnection` reconnects with backoff after a drop and sends `feed_after` with the last `seq` it delivered, so the new snapshot's feed page catches up from there. If `feed.has_more` is `true` in a snapshot, page the rest with `getFeed(tableId, { after })`.

### The scene

bxapi's player view draws the map's cells and edges, but it names no areas, shows no treasure caches, stairs, or found traps, and its messages name things by ID ("enters area guard_room"). The server acts as the referee who describes what the party sees, and adds `game.scene`:

- `scene.here` is what the party perceives on its cell: the area with its name and description, the caches of the area (with `reachable` for the ones `take_treasure` can take from this cell), custom features and found construction tricks, the transitions on the cell (send `use_stairs` there), the known traps of the area, and whether a dropped pile lies there (`take_treasure` with `feature_id: "pile"`).
- `scene.levels` lists, for each level on the party's map, the entered areas, the transitions on known cells, the known traps, the caches, the features, and the piles, so the map can draw them.
- `scene.names` maps item, magic item, and valuable IDs from player events and the inventory to display names. An unidentified magic item keeps its masked name, such as `a potion`.

The server reveals only what osrlib marks as known to the party. An area appears after the party walks into it. A cache never shows its contents or its authored description, and no cache appears while an encounter or battle is open. A cache on a cell appears only once the cell is on the party's map, and a lair hoard appears only after its monsters were slain or routed. A player's `take_treasure`, `inspect_treasure`, or `remove_treasure_trap` that names a cache missing from `scene.here.caches` is refused with `exploration.feature.unknown`, and a refused `remove_treasure_trap` on a visible cache reads `exploration.trap.not_found` whether or not the cache is trapped. A trap appears only after the party found it, it sprang, or a thief removed it. A construction trick appears only after a search found it. A transition shows which way it leads (`up`, `down`, `same_level`, or `elsewhere`) and never where it lands. The scene has no edges, so a secret door stays a wall until the player view shows it as a door.

## Who may do what

| Action | Who may do it |
| --- | --- |
| Read a table, its feed, saves, annotations, party notes, and game | Any member. A non-member gets 404, so a table's existence stays private. |
| Rename a table, change settings, regenerate the invite code, delete the table | A referee. |
| Change a member's role, remove a member | A referee. The server refuses a change that leaves no referee (`last_referee`). |
| Leave a table | Any member, except the last referee while others remain. The last member to leave deletes the table. |
| Put a character on the roster | The character's owner, while the table is in its lobby. |
| Take a character off the roster | Its owner or a referee. |
| Reorder the roster, start or end the game, restore a save, assign seats | A referee. |
| Member command, such as `equip_item` or `cast_spell` | The user in the acting member's seat, or a referee. A referee controls every empty seat. |
| Party command, such as `move_party` or `search` | A referee or the caller. With `party_control: "anyone"`, any member with a seat. |
| Referee command, such as `place_party` or `end_encounter` | A referee. A player gets 403 `referee_command`. |
| `resolve_battle_round` | Nobody sends it directly (409 `use_declarations`). |
| Save or clear a battle declaration | The user in the member's seat, or a referee. |
| Resolve a round | Whoever may send party commands, once every declarer has declared. A referee can pass `fill_with_hold` to declare `hold` for the rest. |
| Create a save | Any member. |
| Relabel or delete a save | The member who made it, or a referee. |
| Secret dice roll, referees-only pin, referee notes, referee events, the adventure, save export, generators | A referee. |
| Read, receive, or make annotations and pings on a level | A referee on any level. A player only on a level on the party's map, so a referee's plans for other levels stay private. A player gets an empty list for any other level, and 403 `forbidden` for a new mark there. |
| Erase an annotation | Its author, or a referee. |
| Character data | Its owner, and a referee of a table whose roster has the character. |

The server classifies each command from the JSON schema that bxapi serves at `/v1/rules/commands/{command_type}`. A command whose schema requires a string `character_id` is a member command. `search` and `parley` name a member, but the party does them together, so they count as party commands. Each entry of `game.commands` states its `class` and its `member_field`, so the client can offer each user only the actions they may take. A player's list holds only `play` commands.

When the game starts, the server seats each party member with the owner of the roster entry in the same place, after it checks the names against the player view. If the table has no caller, the owner of the first seat becomes the caller.

## Commands, conflicts, and retries

Send the `revision` of the state the user acted on as `expected_revision`. The server runs one command at a time per table. When the game moved on in between, the server sends nothing to bxapi, answers 409 `revision_conflict` with the current `revision`, pushes the new state, and sends the sender a `notice` with the code `table_changed`. Show the new state and let the user decide again.

The server sends each command to bxapi with `include=view`, `visibility=referee`, `expected_revision`, and an `Idempotency-Key`. It retries a dropped connection with the same key, waits out a busy session while its revision is unchanged, and reloads the game when bxapi reports that someone else changed the session.

A refused command isn't an error. The response has status 200, `accepted: false`, and bxapi's `rejections`, and nobody else hears about it. An accepted command updates everyone: a `game` message, a `feed` entry, and a `declarations` message when a battle is on.

### Battle rounds

1. Each player saves a declaration for each of their members with `PUT /api/tables/{table_id}/game/declarations/{member_id}`, in the form of bxapi's `BattleDeclaration` without `character_id`.
2. Everyone receives a `declarations` message with `declared` and the declarations themselves, because the party plans together.
3. When every declarer has declared and `auto_resolve` is on (the default), the server resolves the round. Otherwise the caller or a referee calls `resolveRound`.
4. If bxapi refuses the round, the declarations stay, and `declarations.refusals` lists each rejection with the `member_id` it concerns. The player fixes that declaration, and the round resolves again.

### Saves and autosaves

Restoring a save creates a new bxapi session, moves the table to it, keeps each seat with the same member ID, and sends everyone a `notice` with the code `game_restored`, a `table` message, and a `game` message. When the `autosave` setting is on (the default), the server saves after the party enters a dungeon, reaches another level, meets monsters while exploring, or returns to town. Autosave labels start with `Autosave:`, and the server keeps the newest 10.

## The feed

Every table has one feed. Each entry has a `kind`:

- `chat`: a message. With `to`, it's a whisper that only the sender and the named members can read.
- `roll`: a message that starts with `/roll` or `/r`, such as `/roll 2d6+1 for damage`. bxapi rolls it. A referee can roll in secret with `/roll secret 1d20` or `secret: true`, and only referees see that roll.
- `game`: the result of an accepted command, with the sender's `user_id`, the `command_type`, and the events and messages. A player's copy holds only player events, and it has `command_type: null` for a referee command. A referee command with no player events isn't in a player's feed at all.
- `system`: a notice such as `member_joined`, `save_created`, or `save_restored`, with IDs in `params`.

A message is at most 2,000 characters. `getFeed(tableId, { limit })` returns the newest page, `{ before: seq }` scrolls back, and `{ after: seq }` catches up. Every page is in order, oldest first.

## Routes

Every route under `/api` needs `Authorization: Bearer <token>`, except `GET /api/health` and `POST /api/users`. Paths below omit the `/api` prefix, and `{t}` stands for a table ID.

| Method and path | SDK method | Who | Returns |
| --- | --- | --- | --- |
| `GET /health` | `health` | anyone | `Health` |
| `POST /users` | `createUser` | anyone (rate limited) | `CreateUserResponse` with the token |
| `GET /users/me` | `me` | user | `User` |
| `PATCH /users/me` | `updateMe` | user | `User` |
| `GET /tables` | `listTables` | user | `TableList` |
| `POST /tables` | `createTable` | user, with `host_key` when set | `TableDetail` |
| `GET /tables/{t}` | `getTable` | member | `TableDetail` |
| `PATCH /tables/{t}` | `updateTable` | referee | `TableDetail` |
| `DELETE /tables/{t}` | `deleteTable` | referee | 204 |
| `POST /tables/{t}/invite-code` | `regenerateInviteCode` | referee | `TableDetail` |
| `POST /join` | `joinTable` | user (rate limited) | `TableDetail` |
| `POST /tables/{t}/leave` | `leaveTable` | member | 204 |
| `PATCH /tables/{t}/members/{user_id}` | `setMemberRole` | referee | `TableDetail` |
| `DELETE /tables/{t}/members/{user_id}` | `removeMember` | referee | `TableDetail` |
| `POST /tables/{t}/roster` | `addToRoster` | owner | `TableDetail` |
| `PUT /tables/{t}/roster` | `reorderRoster` | referee | `TableDetail` |
| `DELETE /tables/{t}/roster/{entry_id}` | `removeFromRoster` | owner or referee | `TableDetail` |
| `POST /ability-rolls` | `rollAbilities` | user | bxapi `AbilityRoll` |
| `GET /ability-rolls/{roll_id}` | `getAbilityRoll` | its owner | bxapi `AbilityRoll` |
| `POST /characters/preview` | `previewCharacter` | user | bxapi generated character |
| `POST /characters` | `createCharacter` | user | bxapi `StoredCharacter` |
| `GET /characters` | `listCharacters` | user | the user's characters |
| `GET /characters/{id}` | `getCharacter` | owner, or roster referee | bxapi `StoredCharacter` |
| `DELETE /characters/{id}` | `deleteCharacter` | owner | 204 |
| `GET /rules/{path}` | `rules` | user | bxapi's `/v1/rules/{path}` |
| `POST /dice/roll` | `rollDice` | user | bxapi `DiceRollResponse` |
| `POST /tables/{t}/generate/{kind}` | `generate` | referee | bxapi's generator response |
| `GET /tables/{t}/adventures` | `listAdventures` | member | `AdventureList` |
| `POST /tables/{t}/adventures/validate` | `validateAdventure` | referee | `AdventureValidation` |
| `POST /tables/{t}/adventures` | `uploadAdventure` | referee | `AdventureListing` |
| `DELETE /tables/{t}/adventures/{id}` | `deleteAdventure` | referee | 204 |
| `POST /tables/{t}/game` | `startGame` | referee | `GameState` |
| `GET /tables/{t}/game` | `getGame` | member | `GameState` |
| `DELETE /tables/{t}/game` | `endGame` | referee | 204 |
| `POST /tables/{t}/game/commands` | `sendCommand` | by command class | `CommandResult` |
| `GET /tables/{t}/game/events` | `listEvents` | member (`referee` visibility for referees) | bxapi `EventPage` |
| `GET /tables/{t}/game/referee` | `getRefereeState` | referee | `RefereeState` |
| `GET /tables/{t}/game/adventure` | `getAdventureDocument` | referee | the adventure, with an `ETag` |
| `PUT /tables/{t}/game/seats/{member_id}` | `setSeat` | referee | `SeatList` |
| `GET /tables/{t}/game/declarations` | `getDeclarations` | member | `DeclarationsState` or `null` |
| `PUT /tables/{t}/game/declarations/{member_id}` | `declare` | seat owner or referee | `DeclarationsState` |
| `DELETE /tables/{t}/game/declarations/{member_id}` | `clearDeclaration` | seat owner or referee | `DeclarationsState` |
| `POST /tables/{t}/game/declarations/resolve` | `resolveRound` | caller or referee | `ResolveRoundResult` |
| `GET /tables/{t}/saves` | `listSaves` | member | `SaveList` |
| `POST /tables/{t}/saves` | `createSave` | member | `SaveEntry` |
| `PATCH /tables/{t}/saves/{save_id}` | `renameSave` | its creator or referee | `SaveEntry` |
| `DELETE /tables/{t}/saves/{save_id}` | `deleteSave` | its creator or referee | 204 |
| `POST /tables/{t}/saves/{save_id}/restore` | `restoreSave` | referee | `GameState` |
| `GET /tables/{t}/saves/{save_id}/document` | `exportSave` | referee | bxapi save document |
| `GET /tables/{t}/feed` | `getFeed` | member | `FeedPage` |
| `POST /tables/{t}/feed` | `postFeed` | member | `FeedEntry` |
| `GET /tables/{t}/annotations?dungeon_id=&level_number=` | `getAnnotations` | member | `LevelAnnotations` |
| `POST /tables/{t}/annotations` | `createAnnotation` | member | `Annotation` |
| `DELETE /tables/{t}/annotations/{id}` | `deleteAnnotation` | author or referee | 204 |
| `POST /tables/{t}/annotations/clear` | `clearAnnotations` | referee | 204 |
| `GET /tables/{t}/notes/{party or referee}` | `getNotes` | member (referee notes: referee) | `Notes` |
| `PUT /tables/{t}/notes/{party or referee}` | `updateNotes` | member (referee notes: referee) | `Notes` |

The rules proxy serves `classes`, `monsters`, `spells`, `equipment`, `magic-items`, `languages`, `tables`, `commands`, and `license`, each with an optional `/{id}`, and passes the query parameters `q`, `class_id`, `level`, `item_type`, `category`, `kind`, `mode`, `limit`, and `offset`. Responses have bxapi's `ETag` and `Cache-Control: private, max-age=3600`, and the server answers `If-None-Match` with 304. The server caches each response and revalidates it with bxapi every five minutes.

An adventure's `id` in the list is a bxapi ID for a built-in or uploaded adventure, and `sample:<file name>` for a sample from `adventures/`. The server uploads a sample to bxapi the first time a table plays it and skips a sample file that bxapi refuses, with a warning in the log.

A request body is at most 64 KiB, except an adventure document, which is at most 8 MiB. A JSON body may nest at most 64 levels.

## WebSocket messages

| Direction | `type` | Contents |
| --- | --- | --- |
| client to server | `auth` | `token`, `table_id`, and optionally `feed_after`. It must be the first message, within 10 seconds. |
| client to server | `heartbeat` | Nothing. Send one every 20 seconds. `TableConnection` does. |
| client to server | `ping` | `dungeon_id`, `level_number`, `x`, `y`: a map ping in cell coordinates. |
| client to server | `resync` | Optionally `feed_after`. Asks for a new snapshot. |
| server to client | `snapshot` | `user`, `role`, `table`, `presence`, `game`, `declarations`, `feed`, `annotations`, `notes`, `server_time`. |
| server to client | `presence` | `presence.online`: the IDs of the connected users. |
| server to client | `table` | `table`: the whole `TableDetail`. |
| server to client | `game` | `game`: the whole `GameState` for the recipient's role, or `null` in the lobby. |
| server to client | `feed` | `entry`: one new `FeedEntry` the recipient may read. |
| server to client | `declarations` | `declarations`: the whole `DeclarationsState`, or `null` outside a battle. |
| server to client | `annotations` | `annotations`: every annotation of one level that the recipient may see. |
| server to client | `ping` | A member's map ping, with `user_id` and `at`. Show it for a few seconds. |
| server to client | `notes` | `notes`: the whole notes document after an edit. |
| server to client | `notice` | `code` (`table_changed`, `game_restored`, `game_started`, `game_ended`) and `detail`. |
| server to client | `heartbeat` | `server_time`. |
| server to client | `error` | `code` and `detail` for a client message the server couldn't use. |
| server to client | `removed` | `reason` (`left`, `kicked`, `table_deleted`). The server then closes the socket. |

A client message is at most 16 KiB, and a connection may send about 20 messages a second, 5 pings in 2 seconds, and 3 `resync` requests in 10 seconds. A player receives a `ping` only on a level on the party's map. The server drops a connection that has 8 MiB of messages it hasn't read. The close codes are in `WS_CLOSE_CODES`. `TableConnection` stops reconnecting after `auth_failed` (4001) and `removed` (4003), and reconnects at once after `resync` (4010), which the server sends when a member's role changes.

## Errors

Every error is an RFC 9457 problem document with the media type `application/problem+json`, a stable `code`, a `detail` for a person, and the `request_id` that the `X-Request-Id` header also states. `PROBLEM_CODES` in `@bxvtt/shared/protocol` lists every code with its status and its extra members. bxapi's `character_invalid` problem passes through with `rejections`, or with `field`, `index`, and `id`, so the character wizard can point at the wrong choice. `validation_error` has `errors`, each with a `path` and a `message`.

## Security

`docs/security.md` states the trust model, what the server guarantees and which tests check it, and a checklist for hosts. In short:

- The server limits each IP address (an IPv6 address by its /64 prefix): 10 new users, 20 invite code attempts, 30 unknown tokens, and 10 wrong host keys every 10 minutes. After that, the request gets 429 `rate_limited` with `Retry-After`. A valid token always works, but a blocked address can't create a table even with the right host key.
- Each user may send 100 requests that change something every 20 seconds, and 30 feed posts and new annotations every 30 seconds.
- Quotas cap what one user or table stores: 50 tables per user, 200 characters per user, 100 saves per table (autosaves aside), 20 uploaded adventures per table, and 20,000 annotations per table. A request over a quota gets 403 `forbidden`, or 413 `content_too_large` for annotations.
- The server trusts `CF-Connecting-IP` and then the last `X-Forwarded-For` entry only from a peer on the same machine, such as `cloudflared` or the Vite proxy.
- An invite code has 100 random bits, and removing a member replaces it. The server stores only a SHA-256 hash of each token.
- The WebSocket handshake must come from the server's own origin, a `localhost` or loopback origin, or an origin in `BXVTT_PUBLIC_ORIGINS`. A handshake with no `Origin` (a program rather than a page) is allowed and still has to authenticate. A user may hold 10 connections to a table, and one address may hold 20 sockets that haven't authenticated yet. A further socket is closed with `rate_limited` (4008).
- The web client gets a Content Security Policy that allows scripts, styles, fonts, and connections only to the server itself, plus `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. A request through an HTTPS tunnel also gets `Strict-Transport-Security`. API responses have `Cache-Control: no-store` unless they set their own caching.
- A JSON body may nest at most 64 levels. A display name, table name, or save label can't contain a control character or a bidirectional override.

## Tests

The tests in `test/` start the server in-process on a free port with a temporary data directory, and drive it through the SDK against the bxapi at `BXAPI_URL` (default `http://127.0.0.1:8651`). Start that bxapi with `npm run dev:bxapi` first.

```sh
npx vitest run --project server
```

`test/helpers.ts` contains `findRefereeData`, which scans everything a player received for referee-only data. Use it in any new test that sends a player something.
