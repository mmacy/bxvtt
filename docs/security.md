# Security

Read this page before you publish a bxvtt server to the internet. It states who bxvtt trusts, what the server guarantees and which tests check each guarantee, what it doesn't protect against, and the steps to take before you share the address.

## Trust model

bxvtt is built for a group of people who trust each other enough to play a game together. It has no passwords, email addresses, or accounts beyond a display name.

- **A token is your identity.** When you pick a display name, the server creates a user and returns a token: `bxt_` and 32 random bytes. The browser stores the token and sends it with every request. Anyone who has your token is you, on every table you belong to. The server stores only a SHA-256 hash of each token, so a copy of the database doesn't contain usable tokens. A token never appears in a URL, because the WebSocket sends it in its first message.
- **An invite code lets anyone join a table as a player.** It has 100 random bits, so nobody guesses one. Every member of the table can see the code, so treat it as shared with the whole group. When a referee removes a member, the server replaces the code, so the removed member can't use the old one to join again.
- **A referee sees everything at the table**, including the adventure, the referee view, referee notes, and secret rolls. A referee can promote any member to referee, remove members, and delete the table. Trust your referees.
- **The host key protects table creation, and nothing else.** When `BXVTT_HOST_KEY` is set, a user needs the key to create a table. Without it, anyone who learns the server's address can create users and tables, up to the quotas below. The host key doesn't control who joins a table or what members do at it.
- **bxapi is trusted and private.** The bxvtt server calls bxapi with the referee key, so bxapi permits every command. The bxvtt server decides who may send each command before it calls bxapi. The bxapi key never leaves the server, and the browser never calls bxapi.

## What the server guarantees

Each guarantee below has an integration test in `apps/server/test/` that runs the server in-process against a real bxapi. `npx vitest run --project server` runs them.

| Guarantee | How the server enforces it | Tests |
| --- | --- | --- |
| A table's data goes only to its members. A non-member gets 404, so a table's existence stays private. | Every table route checks membership before it reads anything, and every save, annotation, roster entry, and adventure lookup also matches the table ID. | `security.test.ts` (every route that takes a table ID, and IDs from another table), `tables.test.ts` |
| A player never receives referee data: the referee view, referee events, the adventure document, referee notes, referees-only pins, secret rolls, and the referee copy of game feed entries. | The server builds each WebSocket message for the recipient's current role, and every HTTP route projects its response for the caller's role. `findRefereeData` in `test/helpers.ts` scans everything a test player received. | `privacy.test.ts`, `game.test.ts`, `annotations.test.ts`, `feed.test.ts` |
| A member whose role changes from referee to player hears nothing more for a referee. A removed member hears nothing more at all. | The server looks up the role for every message it sends, and it closes the member's sockets when the role changes or the member leaves. | `security.test.ts` ("membership changes") |
| The scene shows only what the party perceives. | The scene follows osrlib's record of what the party knows: entered areas, found traps, found construction tricks, and cells on the party's map. It never shows a cache's contents or description, a transition's destination, a lair hoard while its monsters are unbeaten, or a cache on a cell off the map. | `scene.test.ts`, `security.test.ts` ("treasure the party has not found") |
| A refused command doesn't reveal hidden state. | A player's `take_treasure`, `inspect_treasure`, or `remove_treasure_trap` that names a cache the scene doesn't show is refused with `exploration.feature.unknown`, without calling bxapi. A refused `remove_treasure_trap` on a visible cache reads `exploration.trap.not_found` whether or not the cache is trapped. osrlib already refuses a door command at an unfound secret door exactly as at a wall. | `security.test.ts` |
| A player's map marks and pings appear only on levels the party has mapped. | A player can't read or receive annotations or pings for any other level, so a referee's planning marks stay private. A player can't mark such a level either. | `security.test.ts` ("map annotations and pings") |
| A user acts only for the party members in their seats. | The server classifies each command from bxapi's command schema. A member command needs the seat of the member it names in `character_id`. A party command needs the caller or a referee. A referee command needs a referee. An unknown command type is refused. A player can't set `source`, read `referee` events, or send `resolve_battle_round`. A declaration that names a member other than the one in the path is refused. | `game.test.ts`, `security.test.ts` |
| Only a referee changes roles, seats, settings, the caller, and saves of others. A table always keeps a referee. | Each route checks the role, and the last referee can't leave or step down while other members remain. | `tables.test.ts`, `security.test.ts` |
| Request bodies match a schema. | Every body, query, and WebSocket message is parsed with a zod schema with length, count, and range bounds. Extra fields are refused, except in a command, a declaration, character choices, and an adventure document, which the server passes to bxapi for bxapi to check. A JSON body is at most 64 KiB (8 MiB for an adventure document), nests at most 64 levels, and can't contain `__proto__` or `constructor.prototype` keys. A WebSocket message is at most 16 KiB. | `auth.test.ts`, `security.test.ts` ("request handling") |
| A display name can't impersonate another by reordering text. | Names, table names, and save labels refuse control characters and bidirectional override characters. | `security.test.ts` |
| Per-address and per-user rate limits apply. | See the table below. An IPv6 address counts by its /64 prefix. | `ratelimit.test.ts`, `security.test.ts` |
| The browser gets strict security headers. | The web client gets a Content Security Policy that allows scripts, styles, fonts, images, and connections only from the server itself, with no inline script and no `eval`. A forged `Host` header can't add a directive. Every response has `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. A request that arrives through an HTTPS tunnel also gets `Strict-Transport-Security`. API responses have `Cache-Control: no-store` unless they set their own caching, and the adventure and save exports are `private`. | `web.test.ts`, `security.test.ts` |
| Only pages from known origins open the WebSocket. | The handshake must come from the server's own origin, a loopback origin, or `BXVTT_PUBLIC_ORIGINS`. Every socket must authenticate within 10 seconds. bxvtt has no cookies, so a page on another origin can't act as a user it has no token for. | `auth.test.ts` |
| A failed game start leaves nothing behind. | If bxapi fails while the server reads the session it just created for a start or a restore, the server deletes that session and the table stays where it was. Deleting a table holds the table's lock until bxapi's sessions, saves, and uploads and the table's rows are gone. | `security.test.ts` ("a game that fails to start halfway") |

The server also sends every SQL statement with bound parameters, serves static files only from the built client's directory, reads sample adventures only from the file names it lists, and passes only fixed rules paths to bxapi. No route takes a URL from a user.

### Rate limits and quotas

| Limit | Default |
| --- | --- |
| New users from one address | 10 every 10 minutes |
| Invite code attempts from one address | 20 every 10 minutes |
| Unknown tokens from one address | 30 every 10 minutes, then 429 |
| Wrong host keys from one address | 10 every 10 minutes, then 429 even for the right key |
| Requests that change something, per user | 100 every 20 seconds |
| Feed posts and new annotations, per user | 30 every 30 seconds |
| Tables one user creates | 50 |
| Stored characters per user | 200 |
| Saves per table, not counting autosaves | 100 (the server keeps the newest 10 autosaves) |
| Uploaded adventures per table | 20 |
| Annotations per table | 20,000, and 2,000 per level |
| WebSocket connections per user and table | 10 |
| WebSockets from one address waiting to authenticate | 20 |
| WebSocket messages, pings, and resyncs per connection | 20 a second, 5 pings in 2 seconds, 3 resyncs in 10 seconds |
| Messages queued for a client that stops reading | 8 MiB, then the server drops the connection |

## What the server doesn't protect against

- **A stolen token.** Anyone who copies a token from a browser, a backup, or a shared computer acts as that user. bxvtt has no route to sign out or replace a token. To lock someone out, a referee removes the user from the table.
- **A dishonest referee.** A referee sees everything, can change the game with referee commands, and can remove anyone.
- **A member who plays badly within the rules.** The caller moves the whole party and chooses who receives treasure. Any member can give items to another member's character, edit the party notes, and set `hidden` on a rest, which osrlib leaves for the referee to judge. The rate limits slow a member who floods the feed, but they don't stop one.
- **Knowing that something hidden happened.** A player can see that the game's `revision` went up after a referee command that showed them nothing, and that feed entry numbers skip a value when a whisper between others or a secret roll was posted. The player can't learn what the entry or command was.
- **Facts osrlib puts in player events.** An attack roll event states the target's armour class and the number needed to hit, and a defeat event names the monster's template and its experience points. bxvtt passes player events unchanged.
- **Cache IDs that the author made descriptive.** The scene sends an authored cache's ID, because commands need it. An ID such as `hidden_bundle` gives away what an adventure's author meant to hide, so authors should use neutral IDs.
- **Unsafe rendering in a client.** The server stores names, chat, notes, pins, and labels as plain text, exactly as sent. A client must render them as text and never as HTML. The bxvtt web client is a React app, which escapes text, and its Content Security Policy blocks inline scripts.
- **The host machine and its operators.** Anyone with access to the host can read the data directory, which contains every chat, whisper, and note in plain text. Cloudflare terminates TLS for a tunnel, so Cloudflare can read the traffic.
- **A server bound to a public address.** The protections assume the server listens on `127.0.0.1` and the tunnel is the only way in. Per-address limits trust `CF-Connecting-IP` and `X-Forwarded-For` only from a peer on the same machine.

## Hardening checklist

1. Build the client and the server with `npm run build`.
2. Set a host key with at least 128 random bits, or let `npm run share` generate one. To make one yourself:

   ```sh
   export BXVTT_HOST_KEY="$(openssl rand -base64 24)"
   ```

3. Keep `BXVTT_HOST` at its default, `127.0.0.1`. Publish the server only through the tunnel. Don't forward the port on your router.
4. Keep bxapi on `127.0.0.1` and never publish it. If your bxapi requires keys, give bxvtt a `referee` key in `BXAPI_KEY` and keep that key out of shared files.
5. Set `BXVTT_PUBLIC_ORIGINS` to the tunnel's public address, such as `https://table.example`. `npm run share` sets it for a quick tunnel.
6. For a named tunnel on your own domain, turn on "Always Use HTTPS" in Cloudflare. To limit who can reach the server at all, put it behind Cloudflare Access.
7. Send invite links only to your players. If a link leaks, regenerate the invite code from the table settings. Remove members who shouldn't be at the table, which also replaces the code.
8. Back up the data directory and bxapi's database together, because bxvtt's tables refer to bxapi's sessions and saves. Stop both servers first, or copy each SQLite database with `sqlite3 <file> ".backup <copy>"`. A backup contains every chat and note and the token hashes, so store it where only you can read it. The server creates the data directory with mode `0700`.
9. Run `npm audit` and update dependencies before each session you host.
10. Read the server log if something looks wrong. Each request line contains the method, the path without its query string, the status, the user ID, and the client's IP address. The log never contains a token, an invite code, or a request body.
