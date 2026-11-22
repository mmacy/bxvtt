# bxvtt

bxvtt is a browser-based virtual tabletop for the 1981 B/X (Basic and Expert) fantasy adventure rules. A referee and players connect in their browsers to share one dungeon map, marching order, chat feed, and party. The [bxapi](https://github.com/mmacy/bxapi) rules engine enforces the B/X rules, rolls every die, and stores characters, adventures, sessions, and saves, while bxvtt provides the multiplayer table around it.

![A party of four exploring the first level of The Drowned Bell beside the marching order panel](docs/images/explore.webp)

- **Invited to play at someone's table?** You do not install anything. Open your referee's link in a desktop browser and read [Join a table and make a character](docs/playing/getting-started.md).
- **Running a game or playing solo?** Follow [Quickstart](#quickstart) below to launch `bxapi` and `bxvtt` locally, then [Play over the internet](#play-over-the-internet) to invite friends.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or later (includes `npm`).
- [git](https://git-scm.com/).
- [uv](https://docs.astral.sh/uv/) to run `bxapi`. If Python 3.14 is not installed, `uv` downloads an isolated copy the first time you start `bxapi`.
- A current desktop browser with a window at least 820 pixels wide for each person at the table.

## Quickstart

1. Choose a parent folder and clone both `bxapi` and `bxvtt` side by side:

   ```sh
   git clone https://github.com/mmacy/bxapi.git
   git clone https://github.com/mmacy/bxvtt.git
   ```

2. Enter `bxvtt`, install dependencies, and build the client and server:

   ```sh
   cd bxvtt
   npm install
   npm run build
   ```

3. Open a second terminal in that same parent folder and start `bxapi` in anonymous local mode:

   ```sh
   cd bxapi
   BXAPI_ALLOW_ANONYMOUS=true uv run bxapi
   ```

   Wait until `bxapi` prints `Uvicorn running on http://127.0.0.1:8640`.

4. Return to the first terminal (inside `bxvtt`) and start the bxvtt server:

   ```sh
   npm start
   ```

   Wait for the log lines reporting `Server listening at http://127.0.0.1:8660` and `bxapi is reachable`. To connect to `bxapi` on another port, set `BXAPI_URL` before `npm start`.

5. Open [http://127.0.0.1:8660](http://127.0.0.1:8660) in your browser, enter your display name, and select **Continue**.
6. Enter a table name under **Create a table** and select **Create table** to open the lobby as the referee.

`127.0.0.1` is reachable only from your own machine. To invite players over the internet, follow the next section.

## Play over the internet

`npm run share` publishes your local bxvtt server through a free [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) with no account and no router configuration. `bxapi` stays private on `127.0.0.1`.

1. Ensure `bxapi` is running and `npm run build` has completed. Stop `npm start` if it is running, because `npm run share` starts the server itself.
2. Start the tunnel:

   ```sh
   npm run share
   ```

   After a few seconds, the command prints your public `https://*.trycloudflare.com` URL and a **Host key**.

3. Open [http://127.0.0.1:8660](http://127.0.0.1:8660) in your browser (not the `trycloudflare.com` URL, so your referee sign-in persists across tunnel restarts). Under **Create a table**, enter a table name and the **Host key**, then select **Create table**.
4. In **Invite players**, select **Copy** and replace `http://127.0.0.1:8660` in the copied link with your `https://*.trycloudflare.com` URL (for example, `https://example-words-here.trycloudflare.com/join/ABCD1-EFGH2-JKLM3-NPQR4`). Send that link to your players; they open it, enter a name, and join without needing the host key.

Press `Ctrl+C` to close the tunnel when the session ends. When the tunnel URL changes on your next session, send returning players the updated `https://<new-tunnel>.trycloudflare.com/join/<code>` link: they select **I've played at this table before** on that page, and a referee selects **Let them in** to restore their seats and characters. See [Play over the internet](docs/getting-started/share-online.md).

## Documentation

See [`docs/`](docs/index.md) for the full documentation set:

- **Getting started:** [Quickstart](docs/getting-started/quickstart.md) and [Play over the internet](docs/getting-started/share-online.md).
- **Player guide:** [Join and make a character](docs/playing/getting-started.md), [Table screen and town](docs/playing/table-and-town.md), [Explore the dungeon](docs/playing/dungeon-exploration.md), [Encounters and battle](docs/playing/encounters-and-battle.md), [Feed, journal, and rules reference](docs/playing/chat-journal-compendium.md), and [Keyboard shortcuts](docs/playing/keyboard-shortcuts.md).
- **Referee guide:** [Set up a table and lobby](docs/refereeing/lobby-and-setup.md) and [Run the game behind the screen](docs/refereeing/running-the-game.md).
- **Adventures:** [Included and custom adventures](docs/adventures/included-adventures.md) and [Author and validate adventures](docs/adventures/authoring-and-checking.md).
- **Hosting and operations:** [Run and maintain a server](docs/hosting/running-a-server.md) and [Security and trust model](docs/hosting/security.md).
- **Architecture and API:** [Architecture](docs/architecture.md), [HTTP API, WebSocket, and SDK](docs/reference/http-and-websocket.md), and [Environment variables and limits](docs/reference/environment-variables.md).
- **Contributing:** [Local development and testing](docs/contributing/development.md), [Web client, UI kit, and map](docs/contributing/web-client.md), and [Credits and licenses](docs/credits.md).

## Configuration

Set environment variables before starting the server, such as `BXVTT_PORT=9000 npm start`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BXVTT_PORT` | `8660` | Port the bxvtt server listens on. |
| `BXVTT_HOST` | `127.0.0.1` | Bind address for the bxvtt server. Keep `127.0.0.1` and publish externally with `npm run share` or a local tunnel. |
| `BXVTT_DATA_DIR` | `.data` | Directory where bxvtt stores `bxvtt.db`. |
| `BXAPI_URL` | `http://127.0.0.1:8640` | Base URL of `bxapi` (`npm run dev` defaults to `http://127.0.0.1:8651`). |
| `BXAPI_KEY` | unset | `bxapi` bearer key with the `referee` role. Leave unset when `bxapi` runs in anonymous mode. |
| `BXVTT_HOST_KEY` | unset | Secret required to create new tables (`npm run share` generates one automatically). |
| `BXVTT_PUBLIC_ORIGINS` | unset | Comma-separated public origins permitted to open WebSocket connections (`npm run share` sets this automatically). |

See [Environment variables and limits](docs/reference/environment-variables.md) for every server, client, and test variable.

## Development

Run both commands from the `bxvtt` root directory in two terminals (`scripts/dev-bxapi.sh` reads `~/repos/bxapi` by default, or `BXAPI_DIR`):

```sh
BXAPI_DIR=../bxapi npm run dev:bxapi    # terminal 1 (in bxvtt): bxapi on http://127.0.0.1:8651
npm run dev                             # terminal 2 (in bxvtt): server on :8660, Vite client on http://localhost:5180
```

Open [http://localhost:5180](http://localhost:5180) (or `/kit` for the UI component gallery).

| Command | Description |
| --- | --- |
| `npm run check` | Runs TypeScript type-checking, ESLint, Prettier, and unit/integration tests. Run this before opening a pull request. |
| `npm test` | Runs Vitest across `shared`, `server`, and `web` (requires `bxapi` on port 8651 or `BXAPI_URL`). |
| `npm run test:e2e` | Runs Playwright end-to-end tests in Chromium (run `npx playwright install chromium` once first). |
| `npm run test:e2e:prod` | Builds the production bundles and runs Playwright against the production server. |
| `npm run build` | Builds `@bxvtt/web` and `@bxvtt/server`. |
| `npm run gen:bxapi` | Regenerates OpenAPI TypeScript definitions in `packages/shared/src/bxapi`. |
| `node docs/images/capture.mjs` | Regenerates documentation screenshots in `docs/images/` (requires a running `bxapi` and `npm run build`). |

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/server` | Fastify HTTP/WebSocket server and SQLite table store (`@bxvtt/server`). |
| `apps/web` | React, Vite, design system kit, and canvas dungeon map (`@bxvtt/web`). |
| `packages/shared` | Shared `bxapi` types, zod protocol schemas, typed client SDK, and game-event prose (`@bxvtt/shared`). |
| `adventures` | Bundled sample adventures and dungeon authoring/verification scripts. |
| `e2e` | Multi-browser Playwright end-to-end test suite. |
| `docs` | User, referee, host, architecture, and contributor documentation. |
| `scripts` | Development helper scripts. |

Read [AGENTS.md](AGENTS.md) and [docs/architecture.md](docs/architecture.md) before modifying code.

## License

The bxvtt source code is licensed under the [MIT License](LICENSE).

Rules content served by `bxapi` derives from `osrlib` and is Open Game Content under the Open Game License 1.0a. Select **Open Game License** in the rules compendium to read the license text and Section 15 copyright notice. Bundled fonts, icons, and third-party libraries remain under their respective licenses, listed in [docs/credits.md](docs/credits.md).

bxvtt is an independent project and is not affiliated with or endorsed by Necrotic Gnome. "Old-School Essentials" is a trademark of Necrotic Gnome, used only to identify the source of Open Game Content. bxvtt makes no claim of compatibility.
