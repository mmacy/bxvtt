---
title: Author and validate adventures
sidebar_label: Author and validate
description: Script dungeon maps and quests with adventures/tools/build.mjs and play-test reachability, encounters, triggers, and quests with check.mjs.
sidebar_position: 2
---

# Author and validate adventures

You can author `osrlib` adventure documents with visual editors (`osr-editor` or `osr-forge`), write JSON against the `osrlib` schema, or build adventures from JavaScript scripts using the tooling in `adventures/tools/`.

## Build adventures from scripts

The bundled modules in `adventures/` are generated from ES modules in `adventures/src/*.mjs` (`the-drowned-bell.mjs` and `the-toll-bridge.mjs`) using helpers in `adventures/tools/lib.mjs`. `adventures/tools/build.mjs` scans `adventures/src/*.mjs` automatically and writes `adventures/<file>` for every module exporting `file` and `document` (modules without a `document` export, such as `named-monsters.mjs`, act as shared helpers).

Edit source scripts rather than editing `adventures/*.json` by hand, then regenerate the JSON files from the repository root:

```sh
node adventures/tools/build.mjs          # writes adventures/*.json
node adventures/tools/build.mjs --maps   # writes JSON and prints ASCII maps of every level
```

### Create a minimal custom module

Add a new script such as `adventures/src/my-crypt.mjs` with a unique output filename so you do not overwrite the bundled samples:

```js
import { LevelBuilder, envelope, feature, monsters } from '../tools/lib.mjs';

const level = new LevelBuilder({
  dungeonId: 'crypt',
  number: 1,
  mask: `
#######
#EEGGG#
#EEGGG#
#######
`,
});

level
  .area('E', { id: 'entry_steps', name: 'Entry steps', description: 'Damp stone steps descend out of the wind.' })
  .area('G', {
    id: 'guardroom',
    name: 'Guardroom',
    description: 'Broken spears litter the flagstones.',
    encounter: monsters([['goblin', '1d4']]),
    features: [feature({ id: 'iron_box', kind: 'treasure_cache', description: 'A rusted iron box.', coins: { gp: 40 } })],
  })
  .door([2, 1], 'east');

export const file = 'my-crypt.json';
export const document = envelope({
  name: 'The Old Crypt',
  description: 'A two-room crypt outside Oakhaven.',
  town: { name: 'Oakhaven', description: 'A quiet crossroads village.', travel_turns: { crypt: 1 } },
  dungeons: [{ id: 'crypt', name: 'The Old Crypt', levels: [level.build({ entrance: [1, 1] })] }],
});
```

Build, verify against `bxapi`, and reload the lobby to select **The Old Crypt**:

```sh
node adventures/tools/build.mjs --maps
node adventures/tools/check.mjs adventures/my-crypt.json
```

### How `LevelBuilder` maps work

Each dungeon level starts as an ASCII grid where each character represents one 10-foot cell (`x` increases east from `0` at the left; `y` increases south from `0` at the top):

- `#` and spaces represent solid rock.
- Adjacent cells with the **same** character connect via open edges, while adjacent cells with **different** characters are separated by walls.
- Characters registered with `area()` become keyed dungeon rooms; any other non-rock character becomes an unkeyed corridor cell.
- Helper methods (`open()`, `wall()`, `door()`, `join()`, `feature()`, and `transition()`) carve doors, secret passages, treasure caches, traps, stairs, trapdoors, and chutes by `(x, y)` coordinates and cardinal direction (`north`, `east`, `south`, `west`).
- Document helpers (`coins`, `valuable`, `monsters`, `wanderingTable`, `trap`, `gate`, `hasItem`, `flagEquals`, `narrative`, and `envelope`) assemble the complete `osrlib` schema v4 envelope.

### Design tips for multiplayer fog of war

- **Write each cache `description` as what the party sees:** The player view shows a treasure cache's authored `description` to every player once the cache is in sight, before anyone opens it and after it's emptied. Describe the container and where it stands, such as "A rusted iron box sits under the collapsed shelf." Don't list the contents, name a magic item or identify a potion, or describe a trap the party hasn't found. The same applies to the `description` of any other feature that the party can see.
- **Check the caches in an adventure you wrote before this version:** Earlier versions showed a cache's `description` only to the referee, so an older adventure might list contents or describe a trap there. Read every cache `description` before you run the adventure for players. The two sample adventures had their cache descriptions reworded for this reason.
- **Keep cache IDs neutral:** Players name a cache by an opaque `feature:` handle from the player view, and the server refuses a player's treasure command that names a raw cache `id`. An authored `id` still reaches a player's browser once the party empties the cache, because the player view then lists it in `emptied_caches`. Choose an `id` such as `altar_box`, not `trapped_false_bottom`.
- **Set `family_id` on disguised custom monsters:** When an adventure bundles a custom monster whose template ID would give away a plot twist, set `family_id` on the template (see `drowned_prior` in `adventures/src/the-drowned-bell.mjs`) so player-visible group labels and monster names do not unmask it early.

## Validate and play-test with `check.mjs`

Before running a new or edited adventure for players, test it end to end against a running `bxapi` instance with `adventures/tools/check.mjs`. The script requires Node.js 24 (no extra packages) and a `bxapi` server that accepts referee commands, such as one started with `npm run dev:bxapi` on port 8651 or `BXAPI_ALLOW_ANONYMOUS=true uv run bxapi` on port 8640:

```sh
# Check every file in adventures/ against BXAPI_URL (default http://127.0.0.1:8651)
node adventures/tools/check.mjs

# Check one custom file against bxapi on port 8640
node adventures/tools/check.mjs path/to/my-crypt.json --url http://127.0.0.1:8640

# Omit ASCII level maps from the output
node adventures/tools/check.mjs --no-maps
```

### What `check.mjs` verifies

For each JSON file, the checker runs static graph analysis followed by automated play sessions using a temporary level-8, 150-HP test party:

1. **Schema validation:** Posts the document to `POST /v1/adventures/validate` and halts on any `osrlib` schema or reference error.
2. **ASCII map rendering:** Prints each level (unless `--no-maps` is passed) using these symbols: `EN` (entrance), numbers (keyed areas listed in the legend below), `D` (normal door), `K` (stuck door), `L` (locked door), `S` (secret door), `G` (gated door), `O` (open door), `P` (walk-through passage), `up` / `dn` (stairs), `td` (trapdoor), and `ch` (chute).
3. **Entrance reachability:** Walks a breadth-first search from each entrance across open edges, doors, passages, stairs, trapdoors, and trap chutes, failing if any keyed area is unreachable and noting isolated corridor cells.
4. **Door and transition landings:** Verifies that every level transition and trap chute arrives on a carved floor cell within map bounds rather than solid rock, and notes one-way drops.
5. **Live transitions:** Uploads the adventure, satisfies any item or flag gates, steps through every staircase, trapdoor, chute, and passage, and confirms the party arrives at `to_position`.
6. **Live keyed encounters:** Walks into every room with keyed monsters and verifies that an encounter or battle starts for that area.
7. **Live triggers:** Opens an isolated session per trigger, satisfies its `when` event and `conditions` recursively, and verifies that the trigger appears in `fired_triggers`.
8. **Live quests:** Opens a session per quest, triggers activation, reveals hidden objectives, completes every objective in order, verifies quest completion, and confirms that any quest with `concludes_adventure: true` transitions the session to `victory`.

Every check prints `ok`, `note`, or `FAIL`. In a `finally` block, the tool deletes every temporary session and uploaded adventure it created on `bxapi`, then exits with status `0` if all checks passed or `1` if any check failed.

### Validate schema only with curl

To run a fast schema check without play-testing sessions, post the JSON file directly to `bxapi`:

```sh
curl -sS -X POST http://127.0.0.1:8651/v1/adventures/validate -H "Content-Type: application/json" --data-binary @path/to/my-crypt.json
```

A valid adventure returns `"valid":true`.

## Specification references

- **osrlib adventure models:** `osrlib/crawl/adventure.py`, `dungeon.py`, `gates.py`, `triggers.py`, `quests.py`, and `narrative.py`, documented at [osrlib-python documentation](https://mmacy.github.io/osrlib-python/) (see [Building an adventure](https://mmacy.github.io/osrlib-python/getting-started/building-an-adventure/) and [Gates, triggers, and quests](https://mmacy.github.io/osrlib-python/guides/gates-triggers-quests/)).
- **bxapi adventure endpoints and custom content:** The "Adventures" section of `docs/spec.md` and "Author and upload custom adventures" in `docs/client-guide.md` in the [bxapi repository](https://github.com/mmacy/bxapi).
