# Sample adventures

The adventure documents in this directory come with bxvtt. Each `*.json` file is an osrlib adventure document that bxapi can validate, store, and play.

The bxvtt server offers every `*.json` file here to every table, next to the adventures that come with bxapi, so a referee can start a game without uploading anything. The server validates each file with bxapi and leaves out a file that bxapi refuses. It uploads a file to bxapi the first time a table plays it and remembers the upload by the file's content, so after you change a file, the next game uploads the new version.

## The adventures

| Title | File | Party | Length |
| --- | --- | --- | --- |
| The Drowned Bell | `the-drowned-bell.json` | 3 to 6 characters of level 1 | Three dungeon levels, 36 keyed areas, several sessions |
| The Toll at Crookback Bridge | `the-toll-bridge.json` | 4 to 6 characters of level 1 or 2 | One level, 13 keyed areas, about an hour |

### The Drowned Bell

On still nights, the people of Hollin Ferry hear a bell tolling under the Grey Mere, from the ruined priory on Corvane's Holm, and the drowned dead have begun to walk on the causeway. The temple wants the bell silenced, the reeve wants the goblins who rob the ferry gone, and the priory's lost relic is still somewhere below. The party crosses to the island, explores the undercroft, the crypts, and the flooded church beneath them, and comes home with the bell's iron tongue. The adventure is the introduction to bxvtt: it uses every kind of door, stairs, a trapdoor, a chute, a walk-through passage, room and treasure traps, a band of kobolds the party can talk to, undead for a cleric to turn, wandering monsters on each level, and three quests.

### The Toll at Crookback Bridge

Bandits have taken the toll tower on Crookback Bridge, and they charge whatever they like to cross the gorge. The reeve of Wethercote wants the bridge open again, and a miller wants back the strongbox the bandits took from him. It's a short, rowdy adventure with human enemies, written to be finished in under an hour.

## Edit an adventure

Don't edit the JSON files by hand. Each adventure is written as a script in `src/`, and `tools/build.mjs` writes the JSON from it:

```sh
node adventures/tools/build.mjs          # writes adventures/*.json
node adventures/tools/build.mjs --maps   # also prints each level as text
```

In a script, each level is a mask of text with one character for each 10-foot cell. A `#` is solid rock. Neighbouring cells with the same character join with open edges, and cells with different characters are walled apart. A letter that the script declares with `area()` is a keyed area, and every other character is corridor. The script then opens edges, places doors, and adds transitions by cell coordinates, where `x` counts columns from 0 at the left and `y` counts rows from 0 at the top. `tools/lib.mjs` contains the helpers.

## Check the adventures against bxapi

`tools/check.mjs` checks every `adventures/*.json` file against a running bxapi server. It needs Node 24 and no packages. The server has to accept referee commands, so use a referee key or a server in anonymous mode, such as the development server that `npm run dev:bxapi` starts:

```sh
node adventures/tools/check.mjs                                 # every adventure, against http://127.0.0.1:8651
node adventures/tools/check.mjs adventures/the-toll-bridge.json # one adventure
node adventures/tools/check.mjs --url http://127.0.0.1:8651 --no-maps
```

You can also set `BXAPI_URL` in place of `--url`. For each document, the tool:

1. Validates the document with `POST /v1/adventures/validate`.
2. Prints each level as text. In the drawing, `D` is a door, `K` a stuck door, `L` a locked door, `S` a secret door, `G` a gated door, `O` a door that starts open, `P` a passage, `up` and `dn` stairs, `td` a trapdoor, `ch` a chute, and `EN` the entrance. Each number is the key of an area, listed under the map.
3. Walks the map from the entrance through open edges, doors, stairs, trapdoors, passages, and trap chutes, and reports an area it can't reach or a transition that lands on solid rock.
4. Uploads the document and plays it in several sessions. It takes every transition and checks where the party lands, walks into every area that has monsters and checks that the encounter starts, makes every trigger fire, and completes every quest objective by objective.

The tool moves the party with the referee commands `place_party` and `set_door_state`, and it uses a generated party raised to level 8 with 150 hit points, so it can walk into every trap and win every fight. It prints `ok`, `note`, or `FAIL` for each check, deletes the sessions and the uploaded adventures it created, and exits with status 1 when a check fails.

To check a document without the tool, send it to the validation endpoint and confirm that `valid` is `true` in the response:

```sh
curl -sS -X POST http://127.0.0.1:8651/v1/adventures/validate -H "Content-Type: application/json" --data-binary @adventures/the-drowned-bell.json
```

## Learn the format

- The osrlib models are the authority on the format. Read the module documentation in `osrlib/crawl/adventure.py`, `dungeon.py`, `gates.py`, `triggers.py`, `quests.py`, and `narrative.py` in the osrlib that bxapi installs, or the [osrlib documentation](https://mmacy.github.io/osrlib-python/), especially the guides [Building an adventure](https://mmacy.github.io/osrlib-python/getting-started/building-an-adventure/) and [Gates, triggers, and quests](https://mmacy.github.io/osrlib-python/guides/gates-triggers-quests/).
- The "Adventures" section of `docs/spec.md` in bxapi describes the endpoints and what a player sees of an adventure before play.
- "Author and upload custom adventures" in `docs/client-guide.md` in bxapi explains bundled monsters, spells, and temple prices. Set `family_id` on a bundled monster whose template id would give away a disguise, as `drowned_prior` in The Drowned Bell does.
