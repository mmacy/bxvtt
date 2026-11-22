---
title: Quickstart
description: Install bxapi and bxvtt, start both servers locally, and open your first table.
sidebar_position: 1
---

# Quickstart

Run a complete bxvtt table on your own computer in a few minutes. You will start two local processes: `bxapi` (the B/X rules engine) and `bxvtt` (the web server and browser client). Only the person hosting the table installs these programs; players connect with a web browser.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or later (includes `npm`).
- [git](https://git-scm.com/).
- [uv](https://docs.astral.sh/uv/) to run `bxapi`. If Python 3.14 is not on your system, `uv` downloads an isolated copy automatically on the first run.
- A current desktop browser (such as Chrome, Edge, Firefox, or Safari) with a window at least 820 pixels wide.

## 1. Clone both repositories

Create or choose a parent directory for your repositories, then clone `bxapi` and `bxvtt` side by side:

```sh
git clone https://github.com/mmacy/bxapi.git
git clone https://github.com/mmacy/bxvtt.git
```

## 2. Install and build bxvtt

Enter the `bxvtt` directory, install its dependencies, and build the client and server bundles:

```sh
cd bxvtt
npm install
npm run build
```

`npm install` also fetches the `cloudflared` binary used later if you share your table over the internet.

## 3. Start bxapi

Open a second terminal in the parent directory where you cloned both repositories, enter `bxapi`, and start `bxapi` in anonymous local mode:

```sh
cd bxapi
BXAPI_ALLOW_ANONYMOUS=true uv run bxapi
```

Anonymous mode accepts referee commands without an API key, but only from loopback requests (`localhost`, `127.0.0.1`, or `[::1]`). The first launch takes longer while `uv` downloads Python and installs packages. Keep this terminal open once `bxapi` prints its startup line:

```text
INFO:     Uvicorn running on http://127.0.0.1:8640 (Press CTRL+C to quit)
```

## 4. Start bxvtt

Return to your first terminal (in the `bxvtt` directory) and start the bxvtt server:

```sh
npm start
```

By default, bxvtt listens on `http://127.0.0.1:8660` and connects to `bxapi` at `http://127.0.0.1:8640`. Wait for these two JSON log entries:

```text
{"level":30,...,"msg":"Server listening at http://127.0.0.1:8660"}
{"level":30,...,"bxapi":"http://127.0.0.1:8640","engine":"2.5.0","msg":"bxapi is reachable"}
```

If the log reports `bxapi is unreachable` instead, verify that `bxapi` is running on port 8640 (or set `BXAPI_URL` before running `npm start`, such as `BXAPI_URL=http://127.0.0.1:8651 npm start`). You can also verify server health from another shell:

```sh
curl -s http://127.0.0.1:8660/api/health
```

A healthy server returns JSON beginning with `{"status":"ok"`.

## 5. Create your first table

1. Open [http://127.0.0.1:8660](http://127.0.0.1:8660) in your browser.
2. Under **Pick your name**, enter the display name others at the table should see and select **Continue**. Your browser saves a sign-in token locally, with no password required.
3. Under **Create a table**, enter a name such as `Thursday at the Drowned Bell` and select **Create table**.

You enter the lobby as the table's referee, with *The Drowned Bell* selected by default.

## Next steps

- **Invite friends over the internet:** A server on `127.0.0.1` is reachable only from your own machine. Follow [Play over the internet](share-online.md) to publish your table with `npm run share`.
- **Play solo right now:** Select **Create a character** under **Your characters** to build a party, then select **Start the game**. Press `Shift+L` during play to turn off the **Referee lens** so you explore without map spoilers. See [Join a table and make a character](../playing/getting-started.md) and [Run the game behind the screen](../refereeing/running-the-game.md#play-solo).
