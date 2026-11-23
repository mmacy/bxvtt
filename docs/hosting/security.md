---
title: Security and trust model
sidebar_label: Security
description: Understand who bxvtt trusts, what the server enforces and tests, rate limits and quotas, non-goals, and host hardening steps.
sidebar_position: 2
---

# Security and trust model

Publishing a bxvtt server through a tunnel makes its HTTP and WebSocket endpoints reachable by anyone who learns the public URL. Because of that, the server treats every incoming connection as untrusted and enforces authentication, role-based projection, schema validation, and rate limits on the server side.

## Trust model

bxvtt is designed for groups of friends playing together without passwords, email verification, or external OAuth providers.

- **Bearer tokens identify users:** Choosing a display name creates a user and returns a 256-bit token (`bxt_` followed by 32 random base64url-encoded bytes). Your browser stores the token in `localStorage` and sends it in the `Authorization: Bearer` header for HTTP requests and in the initial `auth` WebSocket message, so tokens never appear in URLs, server logs, or `Referer` headers. The server stores only the SHA-256 digest of each token in SQLite. Anyone holding your raw token can act as you across your tables.
- **Invite codes grant player membership:** Each invite code contains 100 bits of entropy (20 Crockford Base32 characters formatted as `XXXXX-XXXXX-XXXXX-XXXXX`). All members of a table can view its invite code. Whenever a referee removes a member or selects **Make a new link**, the server rotates the invite code so the old link stops working.
- **Rejoin requests require referee confirmation:** When a returning player lacks their previous browser token (such as after a quick tunnel URL changes), they present the invite code to view only the table's name and offline members' names and colors, then request to rejoin as a specific offline member. The browser polls with a one-time 256-bit secret. Approval by a referee does nothing until the requesting browser's next poll claims it within 30 seconds; only then does the server issue a fresh token and retire the old one (retained as `token_retired` for 90 days). Referees cannot approve rejoin requests for their personal account.
- **Referees hold full table authority:** A referee receives the complete adventure document, referee state, secret rolls, and referee notes, and can promote or remove members, reassign seats, run any referee command, or delete the table. Promote only people you trust.
- **`BXVTT_HOST_KEY` gates table creation only:** When set, creating a table requires matching `host_key` in constant time (`npm run share` generates a 144-bit random host key automatically). Joining an existing table with an invite code requires no host key.
- **`bxapi` stays private on loopback:** The browser never communicates with `bxapi`. Only the bxvtt server calls `bxapi`, authorizing every command against the user's table role and seat before forwarding it.

## Server guarantees and verification tests

Every guarantee below is verified against a live `bxapi` instance by integration suites in `apps/server/test/` (run `npx vitest run --project server`).

| Guarantee | Server enforcement | Test coverage |
| --- | --- | --- |
| Non-members cannot discover or read a table. | Every table-scoped route verifies membership first and returns HTTP 404 to non-members; saves, annotations, roster entries, and uploads also verify `table_id` ownership. | `security.test.ts`, `tables.test.ts` |
| Players never receive referee data. | Every HTTP response and WebSocket broadcast builds a role-specific projection omitting the referee view, referee events, adventure JSON, referee notes, referee-only pins, and secret rolls. `findRefereeData` scans player payloads across tests. | `privacy.test.ts`, `game.test.ts`, `annotations.test.ts`, `feed.test.ts` |
| Demoted or removed members lose access immediately. | Role lookups run per message, and role changes or member removals close affected WebSockets immediately (`4010 resync` or `4003 removed`). | `security.test.ts` |
| Players never receive internal monster IDs from bxvtt state. | Visible monsters receive opaque `tgt_` handles (96 random bits) mapped in SQLite; commands, declarations, and rejections translate between handles and monster IDs on the server. | `targets.test.ts` |
| `game.scene` exposes only what the party perceives. | Derives entered areas, known cells, discovered traps and tricks, and relative stair directions from `osrlib` state; hides cache contents, unfound secret doors, lair hoards of unbeaten monsters, and caches during active encounters. | `scene.test.ts`, `security.test.ts` |
| Refused commands do not leak hidden traps or caches. | Player treasure commands naming a cache absent from `scene.here.caches` return `exploration.feature.unknown` without calling `bxapi`, and `remove_treasure_trap` on a visible cache returns `exploration.trap.not_found` whether or not a trap exists. | `security.test.ts` |
| Players can read, place, or ping annotations only on mapped levels. | Annotation reads/writes and map pings verify that the level appears in the player's explored map, keeping referee prep marks on unvisited levels private. | `security.test.ts` |
| Users act only within their seat, caller, or referee permissions. | The server classifies commands against `bxapi` JSON schemas (`member`, `party`, `referee`, and `battle`); players cannot supply `source`, request `referee` events, or call `resolve_battle_round` directly. | `game.test.ts`, `security.test.ts` |
| Every table retains at least one referee. | Only referees modify roles, seats, settings, caller, or others' saves, and the sole remaining referee cannot step down or leave while other members remain (`last_referee`). | `tables.test.ts`, `security.test.ts` |
| All inputs pass strict schema, size, and prototype checks. | Zod schemas enforce bounds and reject unexpected keys (except passthrough `bxapi` payloads validated by `bxapi`). JSON bodies cap at 64 KiB (8 MiB for adventures), max nesting depth is 64, `__proto__` and `constructor.prototype` keys fail parsing, and WebSocket frames cap at 16 KiB. | `auth.test.ts`, `security.test.ts` |
| Display strings reject spoofing characters. | User names, table names, and save labels reject ASCII/Unicode control characters and bidirectional text overrides. | `security.test.ts` |
| Per-address and per-user rate limits throttle abuse. | Token buckets track IPv4 addresses and IPv6 `/64` prefixes alongside per-user write, post, and wizard budgets. | `ratelimit.test.ts`, `security.test.ts` |
| Responses send strict browser security headers. | Client pages send a strict `Content-Security-Policy` (`script-src 'self'`, no `eval` or inline scripts, validated `Host`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy`, and `Strict-Transport-Security` behind loopback HTTPS proxies. | `web.test.ts`, `security.test.ts` |
| WebSocket handshakes enforce origin and auth timeouts. | Handshakes must match the server origin, loopback, or `BXVTT_PUBLIC_ORIGINS`, and must send a valid `auth` message within 10 seconds. | `auth.test.ts` |
| Failed starts roll back cleanly. | If session initialization fails mid-flight, bxvtt deletes the orphaned `bxapi` session; deleting a table locks that table until `bxapi` resources and SQLite rows are cleaned up. | `security.test.ts` |
| `/api/health` minimizes unauthenticated disclosure. | Unauthenticated callers see only `status`, bxvtt `version`, `host_key_required`, and boolean `bxapi.reachable`; engine versions and storage byte counts require a valid user token. | `rejoin.test.ts` |

All SQLite queries use bound parameters, static serving is confined to `apps/web/dist`, sample adventures load only enumerated filenames in `adventures/`, and no server route fetches user-supplied URLs.

## Rate limits and quotas

The server groups IPv6 addresses by `/64` prefix and trusts forwarding headers (`CF-Connecting-IP`, then the final `X-Forwarded-For` entry) only when the direct TCP peer is loopback (`127.0.0.1` or `::1`).

| Limit or quota | Default |
| --- | --- |
| New users per IP address | 10 per 10 minutes |
| Invite code lookups/joins per IP address | 20 per 10 minutes |
| Unknown bearer tokens per IP address | 30 per 10 minutes |
| Failed `host_key` attempts per IP address | 10 per 10 minutes (blocks even valid keys until tokens refill) |
| Rejoin requests per IP address | 5 per 10 minutes, max 3 pending simultaneously |
| Rejoin status/cancel calls per IP address | 120 per minute |
| Authenticated state-changing requests per user | 100 per 20 seconds |
| Feed posts and new annotations per user | 30 per 30 seconds |
| Character wizard checks and hit point and gold rolls per user | 60 per minute |
| Tables per user (tables they created and still referee) | 50 |
| Stored characters per user | 200 |
| Lobby roster entries per table | 20 |
| Manual saves per table | 100 (plus the newest 10 autosaves) |
| Uploaded adventures per table | 20 |
| Annotations per table / per dungeon level | 20,000 per table, 2,000 per level |
| Concurrent WebSockets per user and table | 10 |
| Unauthenticated WebSockets per IP address | 20 |
| WebSocket client frames | 40 messages per 2 seconds, 5 pings per 2 seconds, 3 resyncs per 10 seconds |
| Queued outbound WebSocket buffer | 8 MiB per socket before disconnect |

## What bxvtt does not protect against

- **Compromised browser tokens:** Anyone who copies `bxvtt.identity` from a shared computer or unencrypted backup can act as that user. Signing out from the profile menu makes the server stop accepting the token, so sign out before you leave a shared computer. Remove compromised members from the table (or rotate their token through an approved rejoin request).
- **Malicious or careless referees:** Referees see all hidden state, can alter the session, and verify returning players during rejoin approval.
- **Uncooperative play within legal permissions:** The caller moves the party and distributes treasure; any member can edit shared party notes or pass items to another character.
- **Metadata side channels:** Players can observe `game.revision` incrementing after a silent referee command or gaps in `feed.seq` when others exchange whispers or secret rolls, though never the contents.
- **Details included in `osrlib` player events:** `osrlib` attack events report target AC and required roll, and defeat events report template IDs and XP awards; bxvtt forwards player-visibility events unmodified.
- **Spoiler-laden cache IDs in custom adventures:** Because commands reference cache IDs, authors should avoid naming caches `mimic_chest` or `trapped_coffer`.
- **Host-machine and tunnel-provider visibility:** Local operators can read `.data/bxvtt.db`, and Cloudflare terminates TLS at its edge for quick and named tunnels.
- **Binding `BXVTT_HOST` directly to a public interface:** Proxy header trust and transport assumptions expect `BXVTT_HOST=127.0.0.1` behind a local tunnel or reverse proxy.

## Host hardening checklist

1. Build production bundles with `npm run build`.
2. Require a strong host key (`export BXVTT_HOST_KEY="$(openssl rand -base64 24)"`, or let `npm run share` generate one).
3. Keep `BXVTT_HOST=127.0.0.1` and never expose the bxvtt port directly via router port forwarding.
4. Keep `bxapi` bound to `127.0.0.1` and never publish `bxapi` through a tunnel. If `bxapi` uses API keys, store `BXAPI_KEY` outside version-controlled files.
5. Set `BXVTT_PUBLIC_ORIGINS` strictly to your tunnel's HTTPS origin (`npm run share` sets this automatically).
6. On a named Cloudflare tunnel, enable **Always Use HTTPS** and consider gating access with **Cloudflare Access**.
7. Share invite links over private channels; rotate the link (**Make a new link**) if exposed, and remove former members.
8. Back up `.data/bxvtt.db` and `bxapi.db` together into a `0700`-restricted directory.
9. Run `npm audit` and update dependencies regularly before hosting public sessions.
10. Monitor JSON server logs for unexpected `401`, `403`, or `429` spikes (request logs record method, query-stripped path, status, user ID, and client IP, never tokens, invite codes, or bodies).
