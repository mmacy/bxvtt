# Sample adventures (`adventures/`)

Each `*.json` file in `adventures/` is an `osrlib` schema v4 adventure document offered automatically as a `Sample` module in every table's lobby. When a table starts a game with a sample file, the server validates and uploads it to `bxapi`, caching uploads by content hash so rebuilt files take effect on the next new game.

| Title | File | Recommended party | Scope |
| --- | --- | --- | --- |
| **The Drowned Bell** | `the-drowned-bell.json` | 3-6 characters of level 1 | Hollin Ferry and 3 dungeon levels, 36 keyed areas, 3 quests |
| **The Toll at Crookback Bridge** | `the-toll-bridge.json` | 4-6 characters of levels 1-2 | Wethercote and 1 dungeon level, 13 keyed areas, 2 quests |

## Rebuild from source scripts

Do not edit `adventures/*.json` directly. Edit the generator scripts in `adventures/src/*.mjs` (`the-drowned-bell.mjs`, `the-toll-bridge.mjs`, and `named-monsters.mjs`, backed by `adventures/tools/lib.mjs`), then rebuild from the repository root:

```sh
node adventures/tools/build.mjs          # writes adventures/*.json
node adventures/tools/build.mjs --maps   # writes JSON and prints ASCII level maps
```

## Validate and play-test against `bxapi`

Run `adventures/tools/check.mjs` against a `bxapi` server accepting referee commands (such as `npm run dev:bxapi` on port 8651):

```sh
node adventures/tools/check.mjs                                 # check all adventures/*.json
node adventures/tools/check.mjs adventures/the-toll-bridge.json # check one file
node adventures/tools/check.mjs --url http://127.0.0.1:8651 --no-maps
```

`check.mjs` validates the JSON schema, checks entrance BFS reachability and transition landings, uploads the adventure, and drives a level-8 test party through every transition, keyed encounter, trigger, and quest before deleting all temporary sessions and uploads (`0` on success, `1` on failure).

See [Included and custom adventures](../docs/adventures/included-adventures.md) and [Author and validate adventures](../docs/adventures/authoring-and-checking.md) for full details and `osrlib` format links.
