# Architecture

bxvtt runs as three processes. The browser client talks only to the bxvtt server. The bxvtt server talks to bxapi.

```text
browser (apps/web)  <--HTTP /api, WebSocket /ws-->  bxvtt server (apps/server)  <--HTTP /v1-->  bxapi
     React + canvas                                   Fastify + SQLite                          osrlib rules + SQLite
```

- **bxapi** applies the B/X rules. It stores characters, adventures, sessions (games in progress), and saves. It has no user accounts, no WebSocket, and one key per client application.
- **The bxvtt server** stores everything about the people at a table and nothing about the rules: users, tables, memberships, seats, chat, map annotations, and pending battle declarations. It calls bxapi with a `referee` key (or with no key when bxapi runs in anonymous mode on the same machine), checks whether a user may send a command, and decides which parts of a response each user sees.
- **The browser client** renders the table and sends the user's intent. It never computes a rule.

In production the bxvtt server also serves the built client, so a deployment is one bxvtt process and one bxapi process.

## Playing over the internet

The bxvtt server runs on the same machine as bxapi, because bxapi is a Python process with a local SQLite database. To let players on other networks join, the host publishes the bxvtt server through a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), which is free and needs no open port on the host's router. `npm run share` starts a quick tunnel and prints the public HTTPS address. bxapi stays on `127.0.0.1` and is never published.

Because a tunnel makes the bxvtt server reachable by anyone who learns its address, the server treats every request as untrusted:

- Every route except the health check, user creation, and the static client needs a user token. A table's data goes only to its members.
- An invite code is long enough to resist guessing, and the server limits how fast one address can try codes and create users.
- When `BXVTT_HOST_KEY` is set, a user needs that key to create a table. Joining a table with an invite code needs no key. `npm run share` sets a host key, so a stranger who finds the address can't create tables.
- The server checks the `Origin` of a WebSocket handshake, limits body and message sizes, and sends a Content Security Policy with the client.

## Ports and settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `BXVTT_PORT` | `8660` | Port the bxvtt server listens on. |
| `BXVTT_HOST` | `127.0.0.1` | Address the bxvtt server listens on. |
| `BXVTT_DATA_DIR` | `.data` | Directory for the bxvtt SQLite database. |
| `BXAPI_URL` | `http://127.0.0.1:8640` | Base URL of bxapi. Development scripts set it to `http://127.0.0.1:8651`. |
| `BXAPI_KEY` | none | A bxapi key with the `referee` role. Leave it unset when bxapi runs in anonymous mode. |
| `BXVTT_HOST_KEY` | none | When set, a user must present this key to create a table. |
| `BXVTT_PUBLIC_ORIGINS` | none | Extra origins, separated by commas, that may open the WebSocket, such as a tunnel's public address. |
| `BXVTT_WEB_PORT` | `5180` | Port of the Vite development server, which proxies `/api` and `/ws` to the bxvtt server. |

## Terms

- **User**: a person. A user has a display name, a color, and a secret token that the browser stores. bxvtt has no passwords. It is built for a group of people who trust each other.
- **Table**: one group's game. A table has a name, an invite code, members, a lobby roster, and at most one active bxapi session.
- **Referee** and **player**: a member's role at a table. The user who creates a table is its referee. A referee can promote another member to referee. A referee can also control characters, so one person can play alone.
- **Roster**: before play starts, the list of stored bxapi characters (`chr_` IDs) that will form the party, in marching order, each with the user who owns it.
- **Seat**: after play starts, the link between a party member in the session (`character-0001`) and the user who controls that member. A referee can reassign a seat. A referee controls every member whose seat is empty.
- **Caller**: the player who speaks for the party, as in B/X. The caller sends the commands that move the whole party.
- **Feed**: the table's one chronological log. It contains chat messages, dice rolls, game events from bxapi, and system notices. Each entry has a visibility: everyone, referees only, or a whisper to named users.

## Who may send what

The server classifies each bxapi command and checks the sender before it calls bxapi.

| Class | Examples | Who may send it |
| --- | --- | --- |
| Member command | `equip_item`, `cast_spell`, `give_items`, `use_item`, `purchase_equipment`, `force_door`, `pick_lock` | The user in the acting member's seat, or a referee. |
| Party command | `move_party`, `turn_party`, `open_door`, `search`, `rest`, `enter_dungeon`, `engage_battle`, `evade`, `parley`, `wait`, `take_treasure`, `reorder_party` | A referee, or the caller. When the table setting `party_control` is `anyone`, any member with a seat. |
| Referee command | every command whose `kind` is `referee` | A referee. |
| `resolve_battle_round` | | Nobody sends it directly. See "Battle rounds". |

The server finds the acting member of a member command from the command's schema, so a command that bxapi adds later is classified without a code change wherever possible. A command that names no member is a party command.

A refused command isn't an error. bxapi returns `accepted: false` with rejections, and the server returns them to the sender alone. The other members see nothing.

## Battle rounds

bxapi resolves a battle round from one declaration for each member in `view.encounter.declarers`. At a shared table, each player declares for the members in their seats:

1. A player saves a declaration for one member. The server stores it and tells every member who has declared, without revealing a player's choice to anyone who shouldn't see it. Party members see each other's declarations, because the party plans together.
2. When every declarer has a declaration and the table setting `auto_resolve` is on, the server sends `resolve_battle_round`. Otherwise the caller or a referee asks the server to resolve the round, or any member with a seat when `party_control` is `anyone`. A referee can resolve a round early, and the server then fills each missing declaration with `hold`.
3. If bxapi refuses the round, the server keeps the declarations, tells the table which declaration bxapi refused and why, and the player fixes it.
4. If bxapi accepts the round, the server clears the declarations and broadcasts the result.

## What each role receives

After every accepted command the server holds the command outcome with every event, and it builds two projections:

- **Players** receive the bxapi player view, the scene, the events whose `visibility` is `player`, and the matching messages.
- **Referees** receive everything a player receives, and also the referee view, the referee-only events, and the adventure's full map and key. The WebSocket carries only the dynamic part of the referee view. A referee's client reads the adventure from a cached HTTP route and the event log from the events route, because both grow too large to push after every command.

The player view draws the map but names no areas and shows no treasure caches, stairs, or found traps. So the server acts as the referee who describes what the party sees: it derives a *scene* from the referee view and sends it to every member with the player view. The scene lists the areas the party has entered with their names and descriptions, the caches, features, and transitions the party can perceive with the IDs that commands need, the traps the party has found, and display names for item IDs. It follows osrlib's record of what the party knows, and when that record doesn't settle a question, it hides the thing and leaves it to the referee. `apps/server/README.md` lists the rules.

A referee's client has a "referee lens" switch. With the lens off, the client shows only what players see, so a referee who also plays can avoid spoilers. The switch is a display preference. The server still sends referee data to a referee.

## Protocol between the browser and the server

`packages/shared/src/protocol` defines every request, response, and WebSocket message as a zod schema with an inferred TypeScript type. The server validates with the schemas and the client imports the types.

- **HTTP under `/api`** is for anything that has a result the caller waits for: creating a user or a table, joining, changing the roster, starting a session, sending a command, saving a declaration, posting to the feed, changing an annotation, and every referee tool. Errors are JSON problem documents with a stable `code`, as in bxapi.
- **The WebSocket at `/ws`** is for what the server pushes and for short-lived signals. The client authenticates with its first message, `auth`, so the token never appears in a URL. The server then sends a `snapshot` with the full table state for that user's role, and then a message for each change: `presence`, `table`, `game`, `feed`, `declarations`, `annotations`, `notes`, and `ping`, plus a `notice` for an event a user should hear about, such as a restored save. The client sends short-lived signals: a map `ping`, a `heartbeat`, and a `resync` request for a new snapshot. Each state message has enough data to replace the client's copy of that part of the state, so a client that misses a message recovers from the next one or from a new snapshot after it reconnects.

The server sends a command to bxapi with `expected_revision` and an `Idempotency-Key`, so two members who act at the same moment can't both apply a stale move. The member whose command loses the race receives the new state and a notice that the table changed.

## Game flow

1. **Home.** A user picks a display name, then creates a table or joins one with an invite link.
2. **Lobby.** Members create characters with the character wizard, or pick characters they made before. The referee chooses the adventure (one that comes with bxapi, a sample from `adventures/`, or an uploaded adventure document), orders the roster, and starts the game. The server creates the bxapi session and turns the roster into seats.
3. **Play.** The interface follows the session's `mode`:
   - `town`: buy equipment, buy healing at the temple, sell treasure, rest, prepare spells, and leave for a dungeon.
   - `exploring`: the map is the main surface. The party token moves cell by cell. Doors, searches, stairs, treasure, light, and spells are actions in context.
   - `encounter`: the table sees the monsters, their distance, and their bearing, and chooses to talk, flee, wait, or fight.
   - `battle`: each player declares, the round resolves, and the client plays the result back event by event.
   - `game_over` and `victory`: a summary, with the option to restore a save.
4. **Saves.** Any member can save, and the server saves by itself at moments such as entering a dungeon when the table setting `autosave` is on. Restoring a save creates a new bxapi session, and the server moves the table to it and remaps the seats by member ID. A referee can also end a game, which returns the table to its lobby and keeps its saves.

## Client structure

```text
apps/web/src/
  ui/         design system: tokens, fonts, icons, component kit
  map/        canvas dungeon renderer: pan, zoom, fog, tokens, pings, drawings, ruler
  app/        routing, API client, WebSocket sync, stores
  features/   one directory per feature: home, lobby, wizard, sheet, town, explore,
              encounter, battle, feed, compendium, referee, journal
```

A feature reads state from the stores in `app/` and renders with the kit in `ui/`. A feature never opens its own WebSocket or calls `fetch` directly.
