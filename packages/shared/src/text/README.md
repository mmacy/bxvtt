# Game text

This module turns bxapi events, rejections, commands, and game values into text for players, so the interface never shows a raw code or ID. It is pure TypeScript with no dependencies beyond the bxapi types. Import it as `@bxvtt/shared/text`.

## Describe a command outcome

Build a `TextContext` from the player view, then describe the outcome's rejections and events:

```ts
import { contextFromPlayerView, describeEvents, describeRejections } from '@bxvtt/shared/text';

let ctx = contextFromPlayerView(view); // view from GET /view, or `view` in a command outcome

if (!outcome.accepted) {
  const sentences = describeRejections(outcome.rejections, ctx);
  // ["Wren isn't in the front rank, so they can't attack in melee. Close with the monsters first, or use a missile weapon or spell."]
}

for (const line of describeEvents(outcome.events, ctx)) {
  // line.text     "Brenna hits a goblin with a sword for 5 damage."
  // line.detail   "Rolled 16 +1 = 17, needed 13 against armour class 6. Damage dice: 5."
  // line.category "damage" | line.tone "good" | line.icon "sword" | line.actorIds [...]
}
```

`describeEvent` describes one event. `describeEvents` also learns names from the whole list, joins an attack with the damage that follows it, and collapses a run of empty wandering-monster checks. It drops lines that repeat another line: a `dead` condition that a death event repeats, and a hit point report with the same numbers as the last report for that creature, such as the second "Mira has 0 of 3 hit points." after her death. Pass `{ dropRedundant: false }` to keep them.

Pass `{ only: 'player' }` to keep player-visible events. An event type that this module doesn't know becomes bxapi's own message with the IDs replaced, when you pass `{ messages: outcome.messages }`. Pass the messages of the whole outcome, one per event, even with `only`: each message stays with its own event after the filter.

### Text for players and text for referees

A line narrates the game the way the party sees it, by direction rather than by map cell: "The party moves north." and "The door to the north opens." When a line has facts that only a referee needs, such as the cell of a step or a door, they are in `line.refereeDetail` ("Cell (14, 17)." or "The door is on the north side of cell (14, 18)."). Show `refereeDetail` only to a referee with the referee lens on. Show `text` and `detail` to anyone who may see the line.

## Keep the context between commands

A context is plain data. Pass the previous context as the second argument, so names survive a command that removes them from the view:

```ts
ctx = contextFromPlayerView(outcome.view, ctx);
```

This matters because a potion you drank is no longer in the post-command view, and the monster groups of a finished fight are gone from `view.encounter`. Build the context you use to describe an outcome from the view before the command, then call `contextFromPlayerView` with the new view afterward.

Extend a context with more data:

| Function | Adds |
| --- | --- |
| `extendContextWithReferee(ctx, refereeView)` | The template of every monster ID, NPC names, the adventure's area, dungeon, town, item, and spell names, and what sets off each trigger, so a `trigger_fired` event reads "The trigger for entering the drain warren fires." Referee clients only. |
| `extendContextWithCatalog(ctx, entries)` | Names from `/v1/rules/equipment`, `/magic-items`, `/spells`, and `/monsters` listings, for IDs that the built-in catalog lacks. Pass the names as the catalog prints them, such as `Torches (6)`. |
| `extendContextWithNames(ctx, names)` | Item names by ID, such as `game.scene.names` from the bxvtt server. Each name becomes a noun: `Torches (6)` reads as `torch`, `a potion` stays a potion, and `Hand of Saint Corvane` keeps its capitals. |
| `extendContextWithEntryNames(ctx, entry.names)` | The names a game feed entry recorded for the IDs in its events: member names, group labels, the label of each monster's group as the players saw it, and item names. Use it to narrate an entry from the feed history, after the encounter left the player view. An entry without names leaves the context unchanged. |
| `extendContextWithEvents(ctx, events)` | What a defeated monster was, when the context doesn't name it yet, what an identified item is, and who joined the party. `describeEvents` calls it for you. A monster the context already names keeps its label, so a disguised monster isn't unmasked by its defeat. |

The built-in catalog names (`data/catalog.json`) come from osrlib, so a torch, a sleep spell, or a goblin resolves without a lookup. A lookup that misses degrades to a phrase such as `a party member`, `a monster`, or `a magic item`, never to an ID.

For the scene, add the names after you read the player view:

```ts
ctx = extendContextWithNames(contextFromPlayerView(game.view, ctx), game.scene.names);
```

For a game entry from the feed, add the entry's own names, so a battle that ended reads "A goblin hits Osric" as it did live:

```ts
const lines = describeEvents(entry.events, extendContextWithEntryNames(ctx, entry.names));
```

## Name items

Item names come from several places: the equipment catalog prints lot names such as `Torches (6)` and `Oil (1 flask)`, the player view masks an unidentified magic item as `a potion`, and an adventure's author writes names such as `Hand of Saint Corvane`. The text layer turns each of these into an `ItemNoun` with a singular (`one`), a plural (`many`), and flags for a name that takes no article (`thieves' tools`) and a proper name (`proper`), which keeps its capitals and takes `the`.

Name an item the same way the log does:

```ts
import { itemPhrase, resolveItemNoun } from '@bxvtt/shared/text';

const noun = resolveItemNoun('torch', ctx); // { one: 'torch', many: 'torches' }
itemPhrase(noun); // 'a torch'
itemPhrase(noun, 12); // '12 torches'
itemPhrase(resolveItemNoun('iron_spikes', ctx)); // 'an iron spike'
itemPhrase(resolveItemNoun('hand_of_saint_corvane', ctx)); // 'the Hand of Saint Corvane'

// An inventory entry for an item the context doesn't know: pass its printed name.
resolveItemNoun(template.id, ctx, { name: template.name }).one; // 'moon blade'
```

`resolveItemNoun` prefers the curated noun of a built-in equipment ID, whatever `ctx.items` says, so a torch reads as `torch` even when a caller stored `Torches (6)`. A curated noun names one unit of an inventory stack: an inventory entry with `quantity: 6` is `6 torches`, and leather armour is `a suit of leather armour`.

| Function | Returns |
| --- | --- |
| `resolveItemNoun(id, ctx, { name })` | The `ItemNoun` for an item ID. `name` is the fallback for an ID the context doesn't know. |
| `itemPhrase(noun, quantity)` | `a torch`, `an iron spike`, `12 torches`, `thieves' tools`, or `the Hand of Saint Corvane`. |
| `itemNounFromName(name, { catalog })` | The `ItemNoun` for a printed name. Pass `catalog: true` for a rules catalog name in title case, such as `Ring of Fire Resistance`, so that it reads in lower case. Without it, a title-case name is a proper name. |
| `itemName(id, ctx)`, `itemNoun(id, ctx, count)`, `itemCount(id, quantity, ctx)` | The same names as strings: `a torch`, `torches`, `3 torches`. |
| `itemList(ids, ctx, { lots })` | One phrase per distinct ID, counting repeats. Pass `lots: true` for the `item_ids` of a purchase, which list one ID per lot, so two `torch` IDs read as `12 torches`. |
| `equipmentNoun(id)`, `equipmentLotSize(id)` | The curated noun and the lot size of a built-in equipment ID, or `undefined`. |

## Other functions

- `describeRejection(rejection, ctx)` returns one or two sentences. `describeRejections` drops repeats.
- `humanizeMessage(message, ctx)` replaces every ID in a bxapi message string.
- Labels: `sessionModeLabel`, `conditionLabel`, `abilityLabel`, `saveLabel`, `alignmentLabel`, `classLabel`, `coinName`, `itemTypeLabel`, `weaponQualityLabel`, `doorStateLabel`, `stanceLabel`, `battleActionLabel`, `battleMoveLabel`, `directionLabel`, `facingLabel`, `timeUnitLabel`, and a `*Description` for the sets that have one, such as `weaponQualityDescription('two_handed')`: "Needs both hands, so the wielder can't use a shield with it." `WEAPON_QUALITY_VALUES` and `TIME_UNIT_VALUES` list the values.
- `timeUnitNoun(unit, count)` names a time unit for a count: `timeUnitNoun('turn', 3)` gives `turns`.
- Commands: `commandInfo(type)` returns `label`, `button`, `description`, and `phrase`. `commandFieldText(type, field)` returns `label` and `help`. `commandFieldOptionLabel(type, field, value)` names an option.
- Formatters: `formatGameClock`, `formatDuration`, `formatFeet`, `formatDice`, `formatCoins`, `signed`, `ordinal`, `count`, `pluralize`, and `joinList`.

## Game time

osrlib counts rounds from the start of the game. A round is 10 seconds, a turn is 60 rounds, and a day is 144 turns or 8,640 rounds. The engine has no time of day, so `formatGameClock(rounds)` starts day 1 at 00:00 and shows `Day 2, 10:40` for 12,480 rounds. Pass `{ startHour: 6 }` to start the day at dawn.

## Coverage data

`data/codes.json` lists every rejection code (with the params osrlib passes), every event type with its codes and fields, the values of the osrlib enums that have labels (weapon qualities and time units), and the clock constants. `data/catalog.json` lists the built-in names. Regenerate both when osrlib changes:

```sh
uv run --project ~/repos/bxapi python packages/shared/src/text/tools/extract-codes.py
npx prettier --write packages/shared/src/text/data
```

The tests fail when a rejection code, an event type or code, a weapon quality, a time unit, a command, or a command field has no text, or when a rejection template uses a param that osrlib never passes with its code. After you regenerate the data, run `npx vitest run --project shared` and write the text for whatever the tests report.

## Files

- `rejections.ts`: one template for each rejection code. A template can have variants, chosen by which params are present.
- `events.ts`: the wording for each event type and code.
- `commands.ts`: command labels, field text, and option labels.
- `labels.ts` and `format.ts`: value labels and formatters.
- `context.ts`, `catalog.ts`, `humanize.ts`: names, item nouns, and ID replacement. `humanizeMessage` also rewrites osrlib wording that reads badly once the IDs are names: it takes map coordinates out ("The party moves north."), says "The party arrives in Hollin Ferry." for `enters town town`, says "nothing" for an empty list ("Brenna drops nothing."), writes "The fallen leave a few coins behind." for osrlib's "The fallen leave behind ." (a drop of coins worth less than 1 gp), and replaces every em dash and en dash.
- `fixtures/`: bxapi outcomes captured from a live server (`outcomes.json`, `creation.json`) and a sample event for each type.
