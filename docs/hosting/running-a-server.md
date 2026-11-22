---
title: Run and maintain a server
sidebar_label: Run and maintain
description: Run bxapi and bxvtt in production, back up and restore SQLite databases, configure named Cloudflare tunnels, manage storage, and troubleshoot issues.
sidebar_position: 1
---

# Run and maintain a server

A hosted bxvtt deployment runs two processes on the same machine:

- **`bxapi`** enforces the B/X rules, rolls dice, and stores characters, adventures, sessions, and saves in its local SQLite database (`127.0.0.1:8640` by default).
- **`bxvtt`** serves the pre-compressed web client (Brotli and gzip), authenticates browser tokens, stores table state in its SQLite database, and coordinates real-time WebSocket updates (`127.0.0.1:8660` by default).

Players install nothing and connect solely to bxvtt in a desktop browser.

## Start and stop the servers

1. Start `bxapi` first from its checkout directory:

   ```sh
   BXAPI_ALLOW_ANONYMOUS=true uv run bxapi
   ```

   Keep `bxapi` bound to `127.0.0.1`. If you configure API keys on `bxapi` instead of anonymous mode, issue a `referee` key and pass it to bxvtt via `BXAPI_KEY`.

2. In a second terminal, inside your `bxvtt` directory, build and start the server:

   ```sh
   npm run build
   npm start
   ```

3. Verify that bxvtt can reach `bxapi`:

   ```sh
   curl -s http://127.0.0.1:8660/api/health
   ```

   A healthy server returns HTTP 200 with `"status":"ok"` and `"reachable":true`. If `bxapi` is offline, `/api/health` returns HTTP 503.

To shut down cleanly, press `Ctrl+C` (`SIGINT`) or send `SIGTERM` to bxvtt first, and then stop `bxapi`. On shutdown, bxvtt closes active WebSockets with code `1001`, flushes its SQLite WAL journal, and exits within 10 seconds. Restarting loses nothing except active socket connections, which browsers re-establish automatically.

See [Environment variables and limits](../reference/environment-variables.md) for every server configuration variable.

## Database files, backups, and restores

Each server maintains a separate SQLite database:

| Process | Default file path | Environment variable | Stored data |
| --- | --- | --- | --- |
| `bxvtt` | `.data/bxvtt.db` (created with mode `0700`) | `BXVTT_DATA_DIR` | Users, token hashes, tables, roles, seats, chat feed, notes, map annotations, target handles, and pending battle declarations. |
| `bxapi` | `bxapi.db` (in the directory where `bxapi` starts) | `BXAPI_DATABASE` | Characters, uploaded adventures, active sessions, and saved games. |

Because rows in `bxvtt.db` reference session, save, character, and adventure IDs in `bxapi.db`, always back up and restore both databases as a matched pair.

### Back up while running

Use `sqlite3`'s `.backup` command to take consistent snapshots without stopping either server (assuming `bxapi` is cloned alongside `bxvtt`):

```sh
mkdir -p ~/bxvtt-backup && chmod 700 ~/bxvtt-backup
sqlite3 .data/bxvtt.db ".backup $HOME/bxvtt-backup/bxvtt.db"
sqlite3 ../bxapi/bxapi.db ".backup $HOME/bxvtt-backup/bxapi.db"
```

If `sqlite3` is not installed, stop `bxvtt` and `bxapi` first, then copy `bxvtt.db` and `bxapi.db` (along with any `-wal` and `-shm` files beside them). Store backups in a private directory because `bxvtt.db` contains all chat messages, whispers, and notes in plain text.

### Restore from backup

1. Stop `bxvtt`, then stop `bxapi`.
2. Copy your backed-up `bxvtt.db` over `.data/bxvtt.db` and `bxapi.db` over `../bxapi/bxapi.db`.
3. Delete any leftover `bxvtt.db-wal`, `bxvtt.db-shm`, `bxapi.db-wal`, and `bxapi.db-shm` files so SQLite does not replay stale journal frames.
4. Start `bxapi`, then start `bxvtt`.

## Use a permanent address with a named tunnel

`npm run share` creates a quick tunnel whose `https://*.trycloudflare.com` URL changes every run (see [Play over the internet](../getting-started/share-online.md)). If you own a domain on Cloudflare, you can configure a [named Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) so your URL stays constant and players never have to use the rejoin flow between sessions:

1. Create a named tunnel in Cloudflare pointing a hostname such as `https://table.example.com` to `http://127.0.0.1:8660`, and enable **Always Use HTTPS** (plus Cloudflare Access if you want pre-authentication at the edge).
2. Generate a permanent host key with `openssl rand -base64 24`.
3. Start bxvtt on `127.0.0.1` with `BXVTT_HOST_KEY` and `BXVTT_PUBLIC_ORIGINS` set to your HTTPS origin:

   ```sh
   BXVTT_HOST_KEY="your-secret-host-key" BXVTT_PUBLIC_ORIGINS="https://table.example.com" npm start
   ```

4. Run your `cloudflared tunnel run <tunnel-name>` process alongside `bxapi` and `bxvtt`.

With a fixed hostname, both you and your players can sign in directly at `https://table.example.com` and retain your browser tokens across every session.

## Manage bxapi storage quotas

By default, `bxapi` limits each API client to 1 GiB of stored documents (`BXAPI_MAX_CLIENT_BYTES=1073741824`). Because bxvtt connects to `bxapi` as a single client, all tables on your server share that quota across active sessions, manual saves, the 10 autosaves per table, characters, uploaded adventures, and 24-hour idempotency records.

bxvtt runs an automatic cleanup job at startup and every hour to delete `bxapi` sessions from ended games or replaced saves, plus resources from deleted tables and deleted characters. When storage passes 80% of `max_bytes`, bxvtt logs a warning every 10 minutes (authenticated callers can also inspect `bxapi.meta.storage` via `GET /api/health`).

If storage reaches 100%, `bxapi` rejects writes and bxvtt returns HTTP 507 `bxapi_storage_full`. Free space by deleting finished tables or unneeded manual saves inside bxvtt, or restart `bxapi` with a higher `BXAPI_MAX_CLIENT_BYTES` (or `BXAPI_MAX_CLIENT_BYTES=0` to disable the cap).

## Update bxapi and bxvtt

1. Back up `bxvtt.db` and `bxapi.db`.
2. Stop `bxvtt`, then stop `bxapi`.
3. From your `bxvtt` directory, update `bxapi`:

   ```sh
   cd ../bxapi
   git pull
   ```

   The next `uv run bxapi` synchronizes any updated Python dependencies.

4. Update and rebuild `bxvtt`:

   ```sh
   cd ../bxvtt
   git pull
   npm install
   npm run build
   ```

5. Start `bxapi`, then start `bxvtt`.

On startup, bxvtt migrates older SQLite schemas forward automatically and refuses to open a database created by a newer schema version. Keep your pre-update backup until you verify your next session.

## Troubleshoot common issues

### "The rules engine isn't running"

bxvtt is running, but it cannot reach `bxapi` at `BXAPI_URL` (`http://127.0.0.1:8640` by default). Start `bxapi` (or pass the matching `BXAPI_URL` to bxvtt) and select **Check again** in the browser.

### `EADDRINUSE: address already in use 127.0.0.1:8660`

Another process (usually a previous bxvtt instance) is already listening on port 8660. Find its process ID:

```sh
lsof -iTCP:8660 -sTCP:LISTEN
```

On Windows, run `netstat -ano | findstr :8660` instead. Stop that process, or choose another port with `BXVTT_PORT=8661 npm start`.

### A player cannot connect or stays stuck reconnecting

Check these causes in order:

1. **The player clicked a `127.0.0.1` link directly:** Loopback URLs work only on the host computer. Have the player open your public `https://...` URL and paste the invite link or code into **Join a table** (or send them a link starting with your public URL).
2. **The tunnel stopped:** If Cloudflare returns a tunnel error page, restart `npm run share` and share the new URL.
3. **Invalid or rate-limited invite code:** Confirm the code, or select **Make a new link** in the lobby. Each IP address is limited to 20 invite attempts every 10 minutes.
4. **"Connection lost. Reconnecting to the table." on a custom tunnel:** WebSocket handshakes verify the `Origin` header. When running your own tunnel instead of `npm run share`, set `BXVTT_PUBLIC_ORIGINS` to your public `https://...` origin and restart bxvtt.

### Host key rejected (`That host key isn't right`)

Copy the exact key printed by `npm run share` (or your `BXVTT_HOST_KEY` value) without leading or trailing spaces. After 10 failed host-key attempts from one IP address within 10 minutes, the server blocks table creation from that address for 10 minutes even if you enter the valid key.

### `npm run share` cannot find `cloudflared`

`npm install` downloads `cloudflared` automatically unless you passed `--ignore-scripts` or installed offline. If missing, `npm run share` attempts a one-time download on startup; if your network blocks that download, install `cloudflared` on your `PATH` (for example, `brew install cloudflared` on macOS).
