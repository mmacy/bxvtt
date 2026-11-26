---
title: Included and custom adventures
sidebar_label: Included and custom
description: Choose among the three ready-to-play adventures, upload custom osrlib JSON dungeons to a table, or add shared modules on disk.
sidebar_position: 1
---

# Included and custom adventures

An adventure is an `osrlib` JSON document defining a town, one or more multi-level dungeons, monster rosters, treasure caches, traps, triggers, and quests. `bxapi` executes the adventure's logic, and bxvtt projects its player-visible state and full referee key to the table.

## Ready-to-play adventures

Every bxvtt server offers three adventures in the lobby without requiring any upload:

| Title | Badge | Recommended party | Scope |
| --- | --- | --- | --- |
| **The Drowned Bell** | `Sample` | 3-6 characters of level 1 | Hollin Ferry and 3 dungeon levels (36 keyed areas, 3 quests, multi-session) |
| **The Toll at Crookback Bridge** | `Sample` | 4-6 characters of levels 1-2 | Wethercote and 1 level (13 keyed areas, 2 quests, about 1 hour) |
| **The Barrow of the Forgotten King** | `Comes with bxapi` | Unspecified on card | Built-in barrow adventure bundled directly inside `bxapi` |

### The Drowned Bell

On still nights, the people of Hollin Ferry hear a bell tolling beneath the Grey Mere from the sunken priory on Corvane's Holm, and drowned dead have begun walking the causeway. Mother Aldis at the temple wants the bell's iron tongue brought back and melted down, Reeve Tamsin Hale offers 100 gp for the head of the hobgoblin raider Gashnak One-Ear, and the priory's lost relic (the Hand of Saint Corvane) still lies somewhere below. Designed as an introductory B/X campaign, it exercises every door type, stairs, a trapdoor, a chute, secret passages, room and treasure traps, parleyable kobolds, turnable undead, and level-specific wandering monster tables.

### The Toll at Crookback Bridge

Mag Corrie's bandits have seized the toll tower on Crookback Bridge and extort travelers crossing the gorge. Reeve Odo Pell of Wethercote wants the bandits driven off and the east portcullis raised, while Miller Aske wants his stolen strongbox recovered. Built for a single evening session, it pits a small party against human brigands in a compact 13-area tower and bridge.

### The Barrow of the Forgotten King

A plundered burial mound outside town contains an idol that the local temple wants recovered. `bxapi` includes this adventure internally (`builtin-barrow`), so it is always present even if the `adventures/` directory is empty.

## Upload a custom adventure to one table

Referees can upload any valid `osrlib` adventure JSON document (exported from `osr-editor`, `osr-forge`, or a build script) directly in a table's lobby:

1. In the lobby's **Adventure** panel, select **Upload an adventure**.
2. Choose a `.json` file up to 8 MB (`8,388,608` bytes).
3. Wait while `bxapi` validates the document. If validation fails, a warning banner identifies the file and reports the exact schema or dungeon defect without storing anything.
4. When the banner confirms that the file is a valid adventure (for example, **The Sunken Vault is a valid adventure**), select **Upload**. The adventure is added to this table's list (up to 20 uploaded adventures per table) and selected automatically.

Players read the `description` of every treasure cache that comes into their party's sight, before anyone opens it. If you wrote the adventure before this behavior, check the cache descriptions first. See [Design tips for multiplayer fog of war](authoring-and-checking.md#design-tips-for-multiplayer-fog-of-war).

To remove an uploaded adventure from the table's picker, select the trash icon on its card and confirm **Delete adventure**. Existing saves from games that ran that adventure continue to work.

## Offer custom adventures to every table on a server

Every `*.json` file placed in the server's `adventures/` directory appears automatically as a `Sample` adventure in every table's lobby:

1. Validate your file first (see [Author and validate adventures](authoring-and-checking.md#validate-and-play-test-with-checkmjs)), then copy it into `adventures/` (for example, `adventures/sunken-vault.json`).
2. Reload the lobby in your browser. You do not need to restart bxvtt; the server scans `adventures/` whenever a lobby requests the adventure list.
3. Select your adventure in the **Adventure** panel.

The first time a table starts a game with a sample file, bxvtt uploads it to `bxapi` and caches the upload by content hash. If you later edit and rebuild the JSON file, the next new game automatically uploads the updated version. If a JSON file in `adventures/` fails `bxapi` validation, the server omits it from the lobby and logs a warning with `content_invalid` and the reason. Set `BXVTT_ADVENTURES_DIR` before starting the server if you store shared adventures in another directory.
