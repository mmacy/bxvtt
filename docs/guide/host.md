# Host a table

You host a table when you run the servers that your group plays on. This guide covers running them, keeping the data safe, letting players on other networks join, and fixing the problems that hosts meet. To learn the screens, read the [player guide](play.md) and the [referee guide](referee.md).

## What you run

A bxvtt table needs two programs on one computer:

- **bxapi** applies the B/X rules, rolls the dice, and stores characters, adventures, and games.
- **bxvtt** serves the web page, keeps track of who is at the table, and syncs everyone's screen.

Players need neither. They open a web address in a browser.

## Run the servers

Start bxapi first. In its folder, run:

```sh
BXAPI_ALLOW_ANONYMOUS=true uv run bxapi
```

Anonymous mode lets any program on your computer act as a referee for bxapi. Use it only on a computer that you trust, and keep bxapi on `127.0.0.1`, which is its default. bxapi listens on port 8640.

In a second terminal, in the bxvtt folder, build the client and start the server:

```sh
npm run build
npm start
```

bxvtt listens on <http://127.0.0.1:8660> and finds bxapi at `http://127.0.0.1:8640`. To change either address, set `BXVTT_PORT` or `BXAPI_URL` before `npm start`. [Configuration in the README](../../README.md#configuration) lists the settings.

Check that bxvtt reaches bxapi:

```sh
curl -s http://127.0.0.1:8660/api/health
```

The answer starts with `{"status":"ok"`. Stop either program with Ctrl+C in its terminal. Stop bxvtt first, then bxapi. A restart loses nothing except who is connected.

## Where your data lives

Each program keeps one SQLite database:

| Program | File | What it holds |
| --- | --- | --- |
| bxvtt | `.data/bxvtt.db` in the bxvtt folder. Set `BXVTT_DATA_DIR` to move it. | People, tables, seats, chat, notes, map marks, and pending battle declarations. |
| bxapi | `bxapi.db` in the folder where you start bxapi. Set `BXAPI_DATABASE` to move it. | Characters, adventures, games in progress, and saves. |

A table in bxvtt points at games and characters in bxapi, so back up both files together.

### Back up

SQLite can copy a database while the servers run. With bxapi in a folder next to bxvtt, run this in the bxvtt folder:

```sh
mkdir -p ~/bxvtt-backup
sqlite3 .data/bxvtt.db ".backup $HOME/bxvtt-backup/bxvtt.db"
sqlite3 ../bxapi/bxapi.db ".backup $HOME/bxvtt-backup/bxapi.db"
```

The `sqlite3` program comes with macOS and most Linux systems. If you don't have it, stop both servers and copy `bxvtt.db` and `bxapi.db`, along with any `-wal` and `-shm` files next to them.

A backup contains every chat message and note, so keep it where only you can read it.

### Restore

1. Stop bxvtt, then bxapi.
2. Copy the two backup files over `.data/bxvtt.db` and `bxapi.db`.
3. Delete the `bxvtt.db-wal`, `bxvtt.db-shm`, `bxapi.db-wal`, and `bxapi.db-shm` files if they exist.
4. Start bxapi, then bxvtt.

## Share a table over the internet

`npm run share` publishes your server at a public address through a Cloudflare quick tunnel. You need no account, no open port on your router, and no separate download. Read [Security](../security.md) first to learn what a public address exposes and what bxvtt protects.

1. Start bxapi, and run `npm run build` if you haven't built the current code.
2. Stop `npm start` if it runs. `npm run share` starts the server itself.
3. Run the command:

   ```sh
   npm run share
   ```

   The command checks that the build exists and that bxapi answers. If either check fails, it tells you what to do and exits before it publishes anything.

4. Wait for the banner. The command prints which `cloudflared` it uses, the server's log lines, and then the address and the key:

   ```text
   Starting a tunnel with the cloudflared that npm installed with bxvtt...
   {"level":30,...,"msg":"Server listening at http://127.0.0.1:8660"}
   {"level":30,...,"bxapi":"http://127.0.0.1:8640","engine":"2.5.0","msg":"bxapi is reachable"}

     bxvtt is shared at https://example-words-here.trycloudflare.com
     Host key (needed to create a table): 3f9Xk2LmQ0aVb7TnR4sYw8Hd
     Run your own table at http://127.0.0.1:8660, so your sign-in survives the next session.
     Players open the shared address and paste your invite link into "Join a table". They need no key.
     Press Ctrl+C to stop sharing.
   ```

   If `cloudflared` is already on your PATH, the first line says `the cloudflared that you installed` and names its location. If neither copy exists, the command downloads Cloudflare's official program once, or explains how to install it.

5. In your browser, open `http://127.0.0.1:8660`, not the public address. Your sign-in lives in your browser and belongs to the address you opened. The public address changes every time, so a table that you create there is out of your reach the next time.
6. Type a table name and select **Create table**. The page then asks for a **Host key**. Type the key from the terminal and select **Create table** again.
7. In the lobby, select **Copy** in the **Invite players** panel. Send your players the public address and that link. The link starts with `http://127.0.0.1`, which only your computer understands, but players don't open it. A player opens the public address, types a name, selects **Continue**, pastes the link into **Join a table**, and selects **Join**.
8. When the session ends, press Ctrl+C in the terminal. The tunnel closes at once, and the old address stops working.

The host key lets a person create tables on your server. It doesn't affect who joins your table or what they do there. A new key appears with each run. To use the same key every time, set it before you run the command:

```sh
BXVTT_HOST_KEY="$(openssl rand -base64 24)" npm run share
```

The command prints the key that it uses. Keep the key to yourself. Wrong guesses are rate limited, and the [security guide](../security.md) lists the limits.

If you changed `BXVTT_PORT` or `BXAPI_URL`, set the same values before `npm run share`. The tunnel follows `BXVTT_PORT`.

## What your players need

Players need a current desktop browser with a window at least 820 pixels wide, the public address, and the invite link or code. They install nothing and create no account. The browser stores each player's sign-in, so a player who clears site data or opens the address in another browser becomes a new person at your table.

Tell your players to use the same browser and the same device in every session.

## Start another session

The public address changes each time you run `npm run share`, and a browser keeps its sign-in for one address only. Your players therefore appear as new members when they join through the new address, even if they type the same name. You keep your own sign-in because you use `http://127.0.0.1:8660` every time.

1. Start bxapi, then run `npm run share`. Note the new address.
2. Open your table at `http://127.0.0.1:8660`. Your table list shows it.
3. Send your players the new address and the invite link. Each player pastes the link into **Join a table**. The invite code is the same as before unless you made a new link.
4. After each player joins, open the table menu and select **Seats and caller**. For each character, choose the new member who plays it. Choose the caller too.
5. Members from earlier sessions stay on the member list. They do no harm. The **People at the table** panel in the lobby removes a member, but the lobby is available only between games, and returning to it ends the current game. Clean up the list when you finish an adventure, not in the middle of one.

If this routine bothers you, put the server behind a fixed address. [Security](../security.md#hardening-checklist) describes a named Cloudflare tunnel on a domain you own. The `npm run share` command doesn't set one up.

## Update

Update bxapi and bxvtt separately, and back up both databases first:

1. Stop bxvtt, then bxapi.
2. In the bxapi folder, run `git pull`. The next `uv run bxapi` installs any new dependencies.
3. In the bxvtt folder, run:

   ```sh
   git pull
   npm install
   npm run build
   ```

4. Start bxapi, then bxvtt.

bxvtt upgrades an older database when it starts, and it refuses a database from a newer version. Keep your backups from before the update until your next session works.

## Troubleshoot

### The page says "The rules engine isn't running"

bxvtt is up but can't reach bxapi. The server log says `bxapi is unreachable`. Start bxapi, or set `BXAPI_URL` to the address where it runs, and restart bxvtt. On the page, select **Check again**. If you use `npm run share`, the command refuses to start until bxapi answers.

### The server says the address is already in use

A message such as `listen EADDRINUSE: address already in use 127.0.0.1:8660` means another program uses the port. The other program is often an earlier bxvtt that you didn't stop. Find it:

```sh
lsof -iTCP:8660 -sTCP:LISTEN
```

Stop that program, or start bxvtt on another port with `BXVTT_PORT=8661 npm start`. On Windows, run `netstat -ano | findstr :8660` instead.

### A player can't connect

Work through these causes in order:

1. **The player opened your `127.0.0.1` link.** That address reaches only your computer. Send the public address, and have the player paste the invite link into **Join a table**.
2. **The tunnel stopped.** A page from Cloudflare with an error code means that `npm run share` isn't running, or that it stopped. Run it again and send the new address.
3. **The invite code is wrong.** The page says `That invite code doesn't match a table`. Check the code, or select **Make a new link** in the lobby and send the new one. The server limits each address to 20 invite attempts every 10 minutes.
4. **The page loads but a banner says "Connection lost. Reconnecting to the table."** The player's network blocks the live connection, or the server isn't reachable. The player should reload the page. If you made the tunnel yourself instead of using `npm run share`, set `BXVTT_PUBLIC_ORIGINS` to its address.

### The host key is rejected

The page says `That host key isn't right`. Type the key from the terminal where `npm run share` runs, with no spaces. The key changes each time you run the command unless you set `BXVTT_HOST_KEY`. After ten wrong keys from one address, the server refuses further attempts for ten minutes.

### The tunnel address changes each time

That is how quick tunnels work. Follow [Start another session](#start-another-session) to bring your group back to the same table.

### The command can't find cloudflared

`npm install` downloads Cloudflare's program into `node_modules`. If you installed with `npm install --ignore-scripts`, or you were offline, `npm run share` downloads the program itself on first use. If that fails, the command prints the reason and a link to Cloudflare's downloads. On macOS, `brew install cloudflared` also works.

### A table loses its players after a restart

It doesn't. Restarting bxvtt keeps tables, seats, chat, and notes. Players reconnect by themselves when the server returns. If players seem missing, check that they opened the same address in the same browser as before.
