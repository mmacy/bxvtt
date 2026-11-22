---
title: Play over the internet
description: Publish your local bxvtt server through a Cloudflare quick tunnel and bring players back across sessions.
sidebar_position: 2
---

# Play over the internet

`npm run share` publishes your local bxvtt server at a public HTTPS URL using a free [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/). You do not need a Cloudflare account, a domain name, or port forwarding on your router. `bxapi` stays bound to `127.0.0.1` and is never exposed to the internet.

Before exposing a server publicly, review the protections and limits in [Security and trust model](../hosting/security.md).

## Start a shared session

1. Make sure `bxapi` is running (see [Quickstart](quickstart.md#3-start-bxapi)) and that you have built bxvtt with `npm run build`.
2. If `npm start` is running in your bxvtt terminal, press `Ctrl+C` to stop it. `npm run share` launches the bxvtt server process for you.
3. Start the tunnel and server from the `bxvtt` directory:

   ```sh
   npm run share
   ```

   Wait a few seconds for the startup banner:

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

4. Open [http://127.0.0.1:8660](http://127.0.0.1:8660) in your browser. Always use `http://127.0.0.1:8660` as the host rather than the `trycloudflare.com` URL: your browser ties your sign-in token to the exact web address (origin) you open, and a quick tunnel generates a different `trycloudflare.com` URL each time you run `npm run share`. Using `127.0.0.1` preserves your referee identity across every session.
5. Under **Create a table**, enter a **Table name** and paste the **Host key** printed in your terminal, then select **Create table**. Only table creation requires the host key; players never need it.
6. In the lobby's **Invite players** panel, select **Copy**. Because you opened `http://127.0.0.1:8660`, the copied link starts with `http://127.0.0.1:8660/join/...`. Replace `http://127.0.0.1:8660` with your `https://*.trycloudflare.com` URL (for example, `https://example-words-here.trycloudflare.com/join/ABCD1-EFGH2-JKLM3-NPQR4`) and send that direct join link to your players. (New first-time players can also open the root `https://*.trycloudflare.com` URL, pick a name, and paste the invite code into **Join a table**.)
7. When your session ends, press `Ctrl+C` in the terminal to close the tunnel and stop the server.

To reuse the same host key across runs instead of generating a fresh one each time, set `BXVTT_HOST_KEY` before running `npm run share`:

```sh
BXVTT_HOST_KEY="$(openssl rand -base64 24)" npm run share
```

## Bring players back for the next session

Each run of `npm run share` produces a new `https://*.trycloudflare.com` URL. Because browsers store tokens per web address (origin), returning players arrive at the new URL without their previous sign-in token. bxvtt includes a built-in rejoin handshake so returning players reclaim their existing member identity, characters, and seats without creating duplicate profiles:

1. Start `bxapi`, then run `npm run share` and note the new `https://*.trycloudflare.com` URL.
2. Open [http://127.0.0.1:8660](http://127.0.0.1:8660) in your browser and select your table under **Your tables**.
3. Send your players the full join link on the new tunnel URL: `https://<new-tunnel>.trycloudflare.com/join/<code>` (replacing `http://127.0.0.1:8660` in the copied invite link). Tell returning players to open that `/join/<code>` link directly rather than picking a new name on the root page.
4. When a returning player opens that `/join/<code>` page, they see **I've played at this table before** listing the table's offline members. The player selects their name and keeps the waiting screen open.
5. At the top of your lobby or play screen, a banner appears: **Someone is asking to come back in as** followed by the player's name. Confirm with the player over voice or chat that the request is theirs, then select **Let them in**.

As soon as the player's browser claims your approval, the server issues them a fresh token, retires their old token, and opens the table with all of their characters, seats, and permissions intact.

If you host regular campaigns and want a permanent URL that never changes between sessions, configure a named Cloudflare tunnel on your own domain as described in [Run and maintain a server](../hosting/running-a-server.md#use-a-permanent-address-with-a-named-tunnel).
