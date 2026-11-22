# Adventures

An adventure is a document that describes a town, one or more dungeons, the monsters and treasure in them, and the quests that tie them together. bxapi plays it, and bxvtt shows it to your table. This guide lists the adventures that you can start with, then shows how to add your own and how to check one before your players use it.

## The adventures that come with bxvtt

The referee picks the adventure in the lobby. The list has three entries, and none of them needs an upload.

| Title | Source | Party | Length |
| --- | --- | --- | --- |
| The Barrow of the Forgotten King | Comes with bxapi | Not stated on its card | Not stated on its card |
| The Drowned Bell | Sample, in `adventures/` | 3 to 6 characters of level 1 | Three dungeon levels, several sessions |
| The Toll at Crookback Bridge | Sample, in `adventures/` | 3 to 6 characters of level 1 or 2 | One level, about an hour |

### The Barrow of the Forgotten King

A plundered barrow lies outside town, and the temple wants its idol back. bxapi includes this adventure, so it needs no file.

### The Drowned Bell

On still nights, the people of Hollin Ferry hear a bell tolling under the Grey Mere, from the sunken priory on Corvane's Holm. Since it began, the drowned dead have been seen walking on the causeway. The temple wants the bell silenced, the reeve wants the goblins who rob the ferry gone, and a famous relic is still missing. It is an introductory adventure for three to six first-level characters, and it spans several sessions. The screenshots in these guides show its first level.

### The Toll at Crookback Bridge

Bandits have taken the toll tower on Crookback Bridge, and they charge whatever they like to cross the gorge. A reeve wants the bridge open again, and a miller wants his strongbox back. It is a short, rowdy adventure for three to six characters of first or second level, and it fits in about an hour.

## Add your own adventure

You can add an adventure in two ways. Both need an adventure document: a JSON file that follows the osrlib adventure format. The upload form says that `osr-editor` or `osr-forge` can export one.

### Upload it in the lobby

Uploading adds the adventure to one table, and only the referee can do it.

1. In the lobby, find the **Adventure** panel and select **Upload an adventure**.
2. Pick the JSON file. It can be up to 8 MB.
3. Wait while bxapi checks the file. If it finds a problem, a banner names the file and the problem, and nothing is uploaded.
4. When the banner says **X is a valid adventure**, select **Upload**. The adventure appears in the list as ready to play, and it is selected.

To remove an uploaded adventure, select its delete button and confirm. Saves of games that used it stay.

### Drop a file in the adventures folder

Every `*.json` file in the `adventures` folder of the bxvtt checkout appears for every table, next to the adventures that come with bxapi.

1. Copy the file into `adventures/`, for example `adventures/my-crypt.json`.
2. Reload the lobby. The server reads the folder each time a table asks for its adventures, so you don't restart anything.
3. Look for the adventure's own name in the list, marked **Sample**. Selecting it uploads the file to bxapi the first time a table plays it.

The server checks each file with bxapi and leaves out a file that bxapi refuses. It logs a warning with the reason (`content_invalid`, and what is wrong) when it does. If your adventure doesn't appear, read the server log. To use a different folder, set `BXVTT_ADVENTURES_DIR` before you start the server.

If you change a file, the next game that a table starts uploads the new version.

## Check an adventure

The check tool tests an adventure document against a running bxapi before your players meet its mistakes. It needs Node 24 and no packages. bxapi has to accept referee commands, so run it against bxapi in anonymous mode, as in the [README](../../README.md#get-it-running). From the bxvtt folder, run:

```sh
node adventures/tools/check.mjs path/to/my-crypt.json --url http://127.0.0.1:8640
```

Leave out `--url` to use `BXAPI_URL`, or `http://127.0.0.1:8651` if you set nothing. Leave out the path to check every file in `adventures/`. Add `--no-maps` to skip the text drawing of each level.

The tool validates the document, draws each level as text, walks the map from the entrance, and then plays the adventure in test sessions. It checks that every area can be reached, every transition lands somewhere sensible, every encounter starts, every trigger fires, and every quest can be completed. For a sample adventure, the output looks like this, with the middle left out:

```text
bxapi at http://127.0.0.1:8640: engine 2.5.0, schema 4, role referee

#### the-toll-bridge.json

== Validation
  ok    bxapi accepts "The Toll at Crookback Bridge"

== Map: reachability from each entrance
  ok    bridge level 1: all 13 areas are reachable
...
== Play: every quest
  ok    open_the_kingsway: all 2 objectives complete, and the adventure ends in victory
  ok    millers_strongbox: all 1 objectives complete

Deleted 9 sessions and 1 uploaded adventures.

Every check passed.
```

Each line starts with `ok`, `note`, or `FAIL`. The tool exits with status 1 when a check fails. It deletes the sessions and uploads that it creates.

To check only that bxapi accepts the document, send it to the validation endpoint. The answer says `"valid":true` when the document passes:

```sh
curl -sS -X POST http://127.0.0.1:8640/v1/adventures/validate -H "Content-Type: application/json" --data-binary @path/to/my-crypt.json
```

## Learn the format

The [adventures README](../../adventures/README.md) explains how the sample adventures are built, with the scripts that write their JSON, and what each part of a text map means. It also links to the osrlib documentation, which is the authority on the adventure format, and to the bxapi guides on custom adventures.
