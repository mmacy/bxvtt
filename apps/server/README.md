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

The response should have `"status": "ok"`, `bxapi.reachable: true`, and `host_key_required`, which says whether creating a table needs the host key. Without a token, the response stops there: bxapi's versions and storage from `GET /v1/meta` go only to a request with a user's token. When bxapi is down, the health check answers 503 and every route that needs bxapi answers 503 `bxapi_unavailable`.

To run the production build, which also serves the built web client from `apps/web/dist`. The server compresses the client's scripts, styles, and other text files with brotli and gzip once, in memory, and sends the encoding that `Accept-Encoding` allows, with `Vary: Accept-Encoding`. Hashed files under `assets/` are cached for a year as immutable, and `index.html` revalidates on every visit:

```sh
npm run build
BXAPI_URL=http://127.0.0.1:8651 npm start
```

To let players on other networks join through a Cloudflare quick tunnel, run `npm run build`, and then run `npm run share`. You don't install anything else: `cloudflared` comes with bxvtt as an npm dependency, and the command uses a `cloudflared` on your `PATH` instead when you have one. The command starts the server itself, so stop `npm start` first. It prints the public address and a host key, which you need to create a table.

Run your own table at `http://127.0.0.1:8660` (or your `BXVTT_PORT`), not at the public address. Your browser keeps your sign-in for the address you open, and a quick tunnel's address changes every run, while the local address stays the same. In the lobby, copy the invite link, and send your players the public address with it. A player opens the public address and pastes the link into **Join a table**, and needs no key. `docs/guide/host.md` walks through it.

When the address changes, a returning player's browser has no sign-in for the new one. The player asks to rejoin as the member they were, and you approve it in the lobby or at the table. See "Rejoining after the address changes".

### Settings

The server reads its settings from environment variables. A relative path resolves against the repository root.

| Variable | Default | Meaning |
| --- | --- | --- |
| `BXVTT_PORT` | `8660` | Port to listen on. |
| `BXVTT_HOST` | `127.0.0.1` | Address to listen on. |
| `BXVTT_DATA_DIR` | `.data` | Directory for `bxvtt.db`, the SQLite database. A restart loses nothing except who is connected. The server upgrades a database from an older server at startup, and refuses one from a newer server. |
| `BXAPI_URL` | `http://127.0.0.1:8640` | Base URL of bxapi. The `dev` script sets `http://127.0.0.1:8651`. |
| `BXAPI_KEY` | none | A bxapi key with the `referee` role. Leave it unset for a bxapi in anonymous mode. |
| `BXVTT_HOST_KEY` | none | When set, creating a table needs this key in `host_key`. |
| `BXVTT_PUBLIC_ORIGINS` | none | Extra origins, separated by commas, that may open the WebSocket, such as `https://table.example`. |
| `BXVTT_WEB_DIST` | `apps/web/dist` | The built web client. The server serves it only when `index.html` exists there. |
| `BXVTT_ADVENTURES_DIR` | `adventures` | The sample adventure documents the server offers every table. |
| `BXVTT_LOG_LEVEL` | `info` | pino log level, such as `debug` or `silent`. |
| `BXVTT_RELAX_LIMITS` | `false` | Set `true` to multiply the rate limits by 100 for automated tests on your own machine. Never set it on a server that other people can reach. |
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
- `scene.can_travel_to_town` is `true` when `travel_to_town` would take the party back to town: the party is exploring and stands on its level's entrance cell, which is the condition osrlib checks. Offer "Return to town" from it, also after a reload. `scene.here.at_entrance` says whether the party's cell is the entrance in any mode, and each level's `entrance` gives the entrance cell once it's on the party's map, or `null`.
- `scene.dungeon_names` gives the name of each dungeon the party has entered, such as `The priory on Corvane's Holm`, so a player's text names it as the town and the referee do. Pass the scene to `extendContextWithScene`.
- `scene.targets` lists the monsters of an open encounter that a party member can single out, each with an opaque handle and a label such as `Goblin 2`. See "Monster targets".

The server reveals only what osrlib marks as known to the party. An area appears after the party walks into it. A cache never shows its contents or its authored description, and no cache appears while an encounter or battle is open. A cache on a cell appears only once the cell is on the party's map, and a lair hoard appears only after its monsters were slain or routed. osrlib then marks the area's encounter resolved, and the monsters never come back, but after the party evades them the hoard stays hidden even though bxapi would hand it over. osrlib rolls a lair hoard when its monsters first appear, on the area's first cell, and lists the area in the referee state's `generated_lair_hoards` even when the roll gives nothing. An empty roll makes no cache, so the scene shows none. What slain monsters carried drops into a pile on the party's cell (`scene.here.pile`), not into the hoard. A player's `take_treasure`, `inspect_treasure`, or `remove_treasure_trap` that names a cache missing from `scene.here.caches` is refused with `exploration.feature.unknown`, and a refused `remove_treasure_trap` on a visible cache reads `exploration.trap.not_found` whether or not the cache is trapped. A trap appears only after the party found it, it sprang, or a thief removed it. A construction trick appears only after a search found it. A transition shows which way it leads (`up`, `down`, `same_level`, or `elsewhere`) and never where it lands. The scene has no edges, so a secret door stays a wall until the player view shows it as a door.

### Monster targets

bxapi's player view counts the monsters of each group but hides their IDs. A spell with `single` or `up_to_n` targeting, such as *magic missile*, *charm person*, or *hold person*, needs a monster ID in `targets`, so a player couldn't aim it at one goblin of a group. At a table, a player says "the second goblin" and the referee knows which one. The server does the same with target handles.

Each entry of `scene.targets` describes one monster:

| Field | Meaning |
| --- | --- |
| `handle` | An opaque ID such as `tgt_q3Jx0b9KfL2mWv8a`. Put it where a command or declaration takes a monster target. |
| `group_id` | The group the monster stands in now, as in `view.encounter.groups[i].id`. |
| `label`, `number` | What to call the monster. `number` counts the monsters of its label in this encounter. `label` is the group's label alone for the only monster of that label, such as `Mag Corrie` or `Ogre`, and the label with the number otherwise, such as `Goblin 2`. When a second monster of the label joins, the first one's label becomes `Ogre 1`, and its handle stays the same. |
| `defeated` | Whether the monster was slain. A slain monster keeps its handle, so the other labels don't change. |
| `fled` | Whether the monster's group fled the battle. |

To aim a spell at the second goblin in a battle, declare with its handle:

```ts
const goblin = game.scene.targets?.find((target) => target.label === 'Goblin 2');
if (goblin) await player.declare(tableId, 'character-0002', {
  action: 'cast',
  spell_id: 'magic_missile',
  spell_mode: 'missiles',
  targets: [goblin.handle],
});
```

The rules for handles:

- **Where handles go:** The server replaces a handle with the monster's ID in every field that the command schemas use for a monster target: `targets` and `target_id` of `cast_spell` and `use_item`, and `targets` of a battle declaration. The classifier finds these fields by name in each command's schema, so a command that bxapi adds later with a `targets` field works too. Member IDs, monster IDs, and cell references in the same lists pass through unchanged.
- **Unknown handles:** A handle that `scene.targets` doesn't list now, such as one from an encounter that ended, gets 422 `target_unknown` with `field` and `id`, and the server sends nothing to bxapi. A declaration with an unknown handle is refused when you save it.
- **Stability:** The server stores a handle and its number in its database the first time the party can see the monster. A handle stays the same for the rest of the encounter, across a server restart, and when its monster moves to another group, such as turned undead that split off. An invisible monster gets no handle until it shows itself, so the numbers never reveal a hidden monster.
- **What players see:** A handle reveals nothing about its monster. The scene never states a monster's ID, hit points, or the conditions of one monster, because the player view shows conditions only per group. The server stores declarations with handles, so everyone reads them that way, and a player's copy of a declaration or a refusal names no monster by ID. A rejection that a player receives names a monster by its handle. bxapi's own player events name monsters by ID, such as `target_id` in `damage_dealt`, and the server passes those events unchanged.
- **Referees:** A referee can send handles or monster IDs. The referee state still lists each group's `monster_ids`.

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

osrlib returns every rejection of a round without saying whose declaration each one is about, and some rejections, such as `combat.attack.out_of_reach` and `magic.cast.target_count`, name nobody. The server attributes each one in this order:

1. A rejection whose params name a declarer, such as `character`, is that declarer's.
2. A `hold` is refused only with a rejection that names its member, so when one declaration that isn't a `hold` remains, the rest are its.
3. Otherwise the server sends bxapi the round again with one member's declaration swapped for a `hold` that sets `back_stab`, which osrlib always refuses first, with `battle.declaration.back_stab_not_attack`. The probe can't resolve the round, adds nothing to the revision or the feed, and uses a fresh `Idempotency-Key`. The rejections the probe lacks were that member's. When two members got the same rejection, the order of the declarations decides. The server never swaps out a declaration that moves its member, because the moves decide how the others are judged.

A refusal the server still can't attribute has `member_id: null` and `candidates`, the members whose declarations could have caused it. That happens when the members in question all declared moves, such as two members who both close and attack.

### Saves and autosaves

Restoring a save creates a new bxapi session, moves the table to it, keeps each seat with the same member ID, and sends everyone a `notice` with the code `game_restored`, a `table` message, and a `game` message. When the `autosave` setting is on (the default), the server saves after the party enters a dungeon, reaches another level, meets monsters while exploring (labelled by what it met, such as `Autosave: Met 4 bandits in Crookback Bridge, level 1`), starts a battle from exploring, or returns to town. Autosave labels start with `Autosave:`, such as `Autosave: Entered the priory on Corvane's Holm`, and the server keeps the newest 10. A name with a leading "The" reads "the" inside a label or a notice, by the rule of `nameInSentence` in `@bxvtt/shared/text`.

## The feed

Every table has one feed. Each entry has a `kind`:

- `chat`: a message. With `to`, it's a whisper that only the sender and the named members can read.
- `roll`: a message that starts with `/roll` or `/r`, such as `/roll 2d6+1 for damage`. bxapi rolls it. A referee can roll in secret with `/roll secret 1d20` or `secret: true`, and only referees see that roll.
- `game`: the result of an accepted command, with the sender's `user_id`, the `command_type`, the events and messages, and `clock_rounds`, the game clock after the command (format it with `formatGameClock` from `@bxvtt/shared/text`). A player's copy holds only player events, and it has `command_type: null` for a referee command. A referee command with no player events isn't in a player's feed at all. An entry written before the server recorded clocks has `clock_rounds: null`, except the entry at the game's current revision, whose clock the server knows.

  A game entry also has `actor_id`, the party member who acted (the member a member command names, or the speaker of a `parley`), and `names`, the display names for the IDs its events name, as the reader could see them when the command ran: `members` (member names, the actor's included), `groups` (also every group of the encounter open when the command ran, with its `count`), `monsters` (each monster has its group's label from the player view, such as `robed corpse`, never its template's true name), `items`, and `dungeons`. Narrate the entry with `describeGameEntry` from `@bxvtt/shared/text`. A client passes it to `extendContextWithEntryNames` from `@bxvtt/shared/text`, so a battle from the history reads as it did live. For an entry written before the server recorded names, the server fills in `names` from what it knows of the entry's session when it serves the entry.
- `system`: a notice such as `member_joined`, `save_created`, or `save_restored`, with IDs in `params`.

A message is at most 2,000 characters. `getFeed(tableId, { limit })` returns the newest page, `{ before: seq }` scrolls back, and `{ after: seq }` catches up. Every page is in order, oldest first.

## Routes

Every route under `/api` needs `Authorization: Bearer <token>`, except `GET /api/health`, `POST /api/users`, and a visitor's rejoin routes (`POST /api/rejoin/lookup`, `POST /api/rejoin`, `POST /api/rejoin/{request_id}/status`, and `POST /api/rejoin/{request_id}/cancel`). Paths below omit the `/api` prefix, and `{t}` stands for a table ID.

| Method and path | SDK method | Who | Returns |
| --- | --- | --- | --- |
| `GET /health` | `health` | anyone (bxapi's details: user) | `Health` |
| `POST /rejoin/lookup` | `lookupRejoin` | anyone with the invite code (rate limited) | `RejoinLookup` |
| `POST /rejoin` | `requestRejoin` | anyone with the invite code (rate limited) | `RejoinTicket` |
| `POST /rejoin/{request_id}/status` | `rejoinStatus` | the holder of the ticket's secret | `RejoinStatus` |
| `POST /rejoin/{request_id}/cancel` | `cancelRejoin` | the holder of the ticket's secret | 204 |
| `GET /tables/{t}/rejoin-requests` | `listRejoinRequests` | referee | `RejoinRequestList` |
| `POST /tables/{t}/rejoin-requests/{id}/approve` | `approveRejoin` | referee, not the member asked for | `RejoinRequestList` |
| `POST /tables/{t}/rejoin-requests/{id}/decline` | `declineRejoin` | referee, not the member asked for | `RejoinRequestList` |
| `POST /users` | `createUser` | anyone (rate limited) | `CreateUserResponse` with the token |
| `GET /users/me` | `me` | user | `User` |
| `PATCH /users/me` | `updateMe` | user | `User` |
| `GET /tables` | `listTables` | user | `TableList`, with `online_count` for each table: how many members have a WebSocket open to it |
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
| `POST /characters/check` | `checkCharacter` | owner of the roll (rate limited) | `CharacterCheck` |
| `POST /characters` | `createCharacter` | user | bxapi `StoredCharacter` |
| `GET /characters` | `listCharacters` | user | the user's characters |
| `GET /characters/{id}` | `getCharacter` | owner, or roster referee | bxapi `StoredCharacter` |
| `DELETE /characters/{id}` | `deleteCharacter` | owner | 204 |
| `GET /rules/{path}` | `rules` | user | bxapi's `/v1/rules/{path}` |
| `GET /catalogs/{catalog}` | `fullCatalog` | user | `FullCatalog`: every full entry of `classes`, `equipment`, `monsters`, `spells`, or `magic-items` |
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

`GET /catalogs/{catalog}` returns `{ catalog, total, items }`, where each item is exactly what `GET /rules/{catalog}/{id}` returns, in the order of bxapi's list. Use it instead of one request per entry, for example to show every item's weight and damage or every monster's categories. The server builds each catalog from bxapi's list and entry routes the first time someone asks for it, keeps it in memory, and checks bxapi's list for a change every five minutes. The response has an `ETag`, `Cache-Control: private, max-age=3600`, and `Vary: Accept-Encoding`. The server answers `If-None-Match` with 304, and gzips the body when `Accept-Encoding` allows it.

```ts
const { items } = await client.fullCatalog('monsters');
const undead = items.filter((monster) => monster.categories.includes('undead'));
```

An adventure's `id` in the list is a bxapi ID for a built-in or uploaded adventure, and `sample:` followed by the file name without `.json` for a sample from `adventures/`, such as `sample:the-drowned-bell` for `adventures/the-drowned-bell.json`. The server uploads a sample to bxapi the first time a table plays it and skips a sample file that bxapi refuses, with a warning in the log.

A request body is at most 64 KiB, except an adventure document, which is at most 8 MiB. A JSON body may nest at most 64 levels.

## Checking a new character

`POST /api/characters/check` checks a character wizard's choices against one of the user's ability rolls, and reports the roll's starting gold. It stores nothing and leaves the roll unused, so the wizard can call it at every step. The body is the body of `POST /api/characters`, with a required `ability_roll_id`.

```ts
const check = await client.checkCharacter({
  name: 'Brenna',
  class_id: 'fighter',
  alignment: 'lawful',
  ability_roll_id: roll.id,
  purchases: [{ item_id: 'leather' }, { item_id: 'sword' }],
  equip_item_ids: ['leather', 'sword'],
});
// { valid: true, problem: null, gold_gp: 110 }
```

The response, `CharacterCheck`, has three fields:

- `valid`: whether every choice passed. `POST /api/characters` with the same body then creates the character.
- `problem`: bxapi's `character_invalid` problem document when a choice breaks a rule, with its `rejections`, or `field`, `index`, and `id`, unchanged. Otherwise `null`.
- `gold_gp`: the gold the roll gives this class, before any purchase. The hit point roll comes before the gold roll, so the gold depends on the roll, the class's hit die, and `hp_reroll_at_first_level`. It's `null` when the class or the starting spells break a rule, because bxapi stops before it rolls the gold.

An unknown roll, or another user's, gets 404 `not_found`, and a used roll gets 409 `ability_roll_used`.

The server sends bxapi's `POST /v1/characters` with the choices and one more entry at the end of `equip_item_ids`, `bxvtt-character-check`, which isn't an equipment ID. bxapi checks the choices in a fixed order (class, adjustment, starting spells, hit points, extra languages, gold, purchases, then equipping) and stores the character, marking the roll used, only after the last step passes. Its spec states that a `character_invalid` failure stores nothing and leaves the roll unused. The extra entry always fails the equipping step after every real choice has passed. The first time it checks a character, the server also confirms that the equipment catalog has no item with that ID.

To count the gold, the server sends a few more such requests, each with purchases of known prices. The item where the gold runs out narrows the gold, and about three requests find the exact amount. The server keeps the gold for each roll, class, and reroll option, so a later check costs one bxapi request.

Each check counts as a change against the per-user write limit, and against its own limit of 60 checks a minute per user, because one check can cost bxapi several requests.

## Rejoining after the address changes

A browser keeps a user's token for one address. A quick tunnel gets a new address every run, so a returning player arrives with no token and would become a new user, with the old member's seats and characters out of reach. Instead, the player rejoins as the member they were, and a referee who knows who is at the table approves:

1. With the invite code and no token, the player's browser calls `lookupRejoin(inviteCode)`. It gets the table's name and the members who are offline now (`user_id`, `name`, `color`), and nothing else. The call counts as an invite code attempt.
2. The player picks their name, and the browser calls `requestRejoin(inviteCode, userId)`. The server keeps a pending request for five minutes, and sends the table's referees a `rejoin_requests` message. A referee's snapshot has `rejoin_requests` too. The browser keeps the ticket's `request_id` and `secret`.
3. The browser polls `rejoinStatus(requestId, secret)` every few seconds while the status is `pending`. A request that goes 20 seconds without a poll counts as abandoned: the server ends it as `cancelled` and drops it from the referees' list. When the visitor presses "Stop waiting", the browser calls `cancelRejoin(requestId, secret)`, which ends the request at once. A closing page sends the same body with `navigator.sendBeacon`, which the cancel route accepts as `text/plain`.
4. A referee calls `approveRejoin(tableId, requestId)` or `declineRejoin(tableId, requestId)`. Approval changes nothing yet: the member's old token keeps working.
5. The browser's next poll claims the approval. Only then does the server give the existing user a new token and retire the old one, close the user's other connections with `auth_failed`, and post a `member_rejoined` notice. That answer is `approved`, with the token and the user, once, and the SDK stores the token. Later polls read `claimed`. An approval that nobody claims within 30 seconds lapses as `expired`, and the old token keeps working.

A request ends as `declined`, `expired`, or `cancelled`, the last when the visitor cancels or stops polling, or when the member comes online or leaves the table first. The rules:

- A member who is online can't be asked for (409 `rejoin_member_online`).
- One request at a time per member (409 `rejoin_pending`). Asking again from the same address replaces that address's earlier request for the member, so a reload can ask again. One address may have 3 requests waiting at once, so a household can ask for several members. Each address may make 5 requests every 10 minutes and poll or cancel 120 times a minute.
- The server remembers a retired token for 90 days, and answers a request or a WebSocket `auth` that presents one with 401 `token_retired` (an `error` message with that code on the WebSocket), so the browser can explain that the member signed in elsewhere. A retired token never authenticates.
- A referee never approves or declines a request to rejoin as themselves (403 `forbidden`), so reclaiming a referee needs another referee. A table whose only referee is asked for refuses the request (409 `rejoin_no_approver`).
- A decided or ended request can't be decided again (409 `rejoin_not_pending`). A wrong secret or an unknown request gets 404 `not_found`.

The last referee is never the one who needs this, because the host runs their own table at `http://127.0.0.1:<port>`, an address that doesn't change, so their browser keeps its token. A host who signed in through the public address instead should promote a second referee before the address changes.

## WebSocket messages

| Direction | `type` | Contents |
| --- | --- | --- |
| client to server | `auth` | `token`, `table_id`, and optionally `feed_after`. It must be the first message, within 10 seconds. |
| client to server | `heartbeat` | Nothing. Send one every 20 seconds. `TableConnection` does. |
| client to server | `ping` | `dungeon_id`, `level_number`, `x`, `y`: a map ping in cell coordinates. |
| client to server | `resync` | Optionally `feed_after`. Asks for a new snapshot. |
| server to client | `snapshot` | `user`, `role`, `table`, `presence`, `game`, `declarations`, `feed`, `annotations`, `notes`, `server_time`, and for a referee `rejoin_requests`. |
| server to client | `presence` | `presence.online`: the IDs of the connected users. |
| server to client | `table` | `table`: the whole `TableDetail`. |
| server to client | `game` | `game`: the whole `GameState` for the recipient's role, or `null` in the lobby. |
| server to client | `feed` | `entry`: one new `FeedEntry` the recipient may read. |
| server to client | `declarations` | `declarations`: the whole `DeclarationsState`, or `null` outside a battle. |
| server to client | `annotations` | `annotations`: every annotation of one level that the recipient may see. |
| server to client | `ping` | A member's map ping, with `user_id` and `at`. Show it for a few seconds. |
| server to client | `notes` | `notes`: the whole notes document after an edit. |
| server to client | `rejoin_requests` | `requests`: every pending rejoin request of the table. Referees only. |
| server to client | `notice` | `code` (`table_changed`, `game_restored`, `game_started`, `game_ended`) and `detail`. |
| server to client | `heartbeat` | `server_time`. |
| server to client | `error` | `code` and `detail` for a client message the server couldn't use. |
| server to client | `removed` | `reason` (`left`, `kicked`, `table_deleted`). The server then closes the socket. |

A client message is at most 16 KiB, and a connection may send about 20 messages a second, 5 pings in 2 seconds, and 3 `resync` requests in 10 seconds. A player receives a `ping` only on a level on the party's map. The server drops a connection that has 8 MiB of messages it hasn't read. The close codes are in `WS_CLOSE_CODES`. `TableConnection` stops reconnecting after `auth_failed` (4001) and `removed` (4003), and reconnects at once after `resync` (4010), which the server sends when a member's role changes.

## Errors

Every error is an RFC 9457 problem document with the media type `application/problem+json`, a stable `code`, a `detail` for a person, and the `request_id` that the `X-Request-Id` header also states. `PROBLEM_CODES` in `@bxvtt/shared/protocol` lists every code with its status and its extra members. bxapi's `character_invalid` problem passes through with `rejections`, or with `field`, `index`, and `id`, so the character wizard can point at the wrong choice. `validation_error` has `errors`, each with a `path` and a `message`. `target_unknown` has `field` and `id`.

The SDK also makes two codes of its own. When a response that should be a problem document isn't JSON, such as the HTML error page the Vite proxy or a tunnel sends while the bxvtt server is down, the SDK throws a `BxvttProblemError` instead of a `SyntaxError`: `server_unavailable` for status 502, 503, or 504, and the code that matches the status otherwise, such as `content_too_large` for 413. A successful response whose body isn't JSON throws `invalid_response`. A request that never reaches a server still rejects with the `TypeError` that `fetch` throws.

## When bxapi's storage fills up

bxapi limits how much each client stores, 1 GiB by default (`BXAPI_MAX_CLIENT_BYTES`). bxvtt stores everything as one bxapi client, so every table on the server shares that space. When it's full, bxapi refuses anything that stores something new, and bxvtt answers 507 `bxapi_storage_full` with `used_bytes` and `max_bytes`: nobody can create a character, start or restore a game, send a command, or save. Waiting doesn't help.

What uses the space:

- **Games:** bxapi keeps each game as a save document that it rewrites after every accepted command, and a long game's document grows with its event log.
- **Saves:** each save, autosaves included, is a full copy of the game. The server keeps the newest 10 autosaves of each table.
- **Characters and uploaded adventures:** each one is a document of its own.
- **Command responses:** bxvtt sends every command with an `Idempotency-Key`, so bxapi keeps each command's response, with the views it returns, for 24 hours, so that a retry gets the same answer.

bxvtt deletes what nobody can reach any more:

- **Deleted tables:** their sessions, saves, and uploaded adventures.
- **Replaced and ended games:** the session a restore replaced, and the session of a game a referee ended. A save outlives its session, so every save still restores.
- **Deleted characters:** a character its owner deleted.
- **Failed deletions:** a deletion that fails while bxapi is down is retried at startup and every hour.

To see the usage, call `GET /api/health` with a user's token and read `bxapi.meta.storage`. The server logs a warning at startup and every 10 minutes while the usage is over 80 percent.

To free space, delete tables you no longer play, and old saves you won't restore, in bxvtt. Deleting a table deletes its games and saves in bxapi. To raise the limit, restart bxapi with a larger `BXAPI_MAX_CLIENT_BYTES`, or set it to `0` to remove the limit.

## Security

`docs/security.md` states the trust model, what the server guarantees and which tests check it, and a checklist for hosts. In short:

- The server limits each IP address (an IPv6 address by its /64 prefix): 10 new users, 20 invite code attempts, 30 unknown tokens, and 10 wrong host keys every 10 minutes. After that, the request gets 429 `rate_limited` with `Retry-After`. A valid token always works, but a blocked address can't create a table even with the right host key.
- Each user may send 100 requests that change something every 20 seconds, 30 feed posts and new annotations every 30 seconds, and 60 character checks a minute.
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
