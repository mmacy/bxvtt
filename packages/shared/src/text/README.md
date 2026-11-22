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

`describeEvent` describes one event. `describeEvents` also learns names from the whole list, joins an attack with the damage that follows it, drops a `dead` condition that a death event repeats, and collapses a run of empty wandering-monster checks. Pass `{ only: 'player' }` to keep player-visible events. An event type that this module doesn't know becomes bxapi's own message with the IDs replaced, when you pass `{ messages: outcome.messages }`.

## Keep the context between commands

A context is plain data. Pass the previous context as the second argument, so names survive a command that removes them from the view:

```ts
ctx = contextFromPlayerView(outcome.view, ctx);
```

This matters because a potion you drank is no longer in the post-command view, and the monster groups of a finished fight are gone from `view.encounter`. Build the context you use to describe an outcome from the view before the command, then call `contextFromPlayerView` with the new view afterward.

Extend a context with more data:

| Function | Adds |
| --- | --- |
| `extendContextWithReferee(ctx, refereeView)` | The template of every monster ID, NPC names, and the adventure's area, dungeon, town, item, and spell names. Referee clients only. |
| `extendContextWithCatalog(ctx, entries)` | Names from `/v1/rules/equipment`, `/magic-items`, `/spells`, and `/monsters` listings, for IDs that the built-in catalog lacks. |
| `extendContextWithEvents(ctx, events)` | What a defeated monster was, what an identified item is, and who joined the party. `describeEvents` calls it for you. |

The built-in catalog names (`data/catalog.json`) come from osrlib, so a torch, a sleep spell, or a goblin resolves without a lookup. A lookup that misses degrades to a phrase such as `a party member`, `a monster`, or `a magic item`, never to an ID.

## Other functions

- `describeRejection(rejection, ctx)` returns one or two sentences. `describeRejections` drops repeats.
- `humanizeMessage(message, ctx)` replaces every ID in a bxapi message string.
- Labels: `sessionModeLabel`, `conditionLabel`, `abilityLabel`, `saveLabel`, `alignmentLabel`, `classLabel`, `coinName`, `itemTypeLabel`, `doorStateLabel`, `stanceLabel`, `battleActionLabel`, `battleMoveLabel`, `directionLabel`, `facingLabel`, and a `*Description` for the sets that have one.
- Commands: `commandInfo(type)` returns `label`, `button`, `description`, and `phrase`. `commandFieldText(type, field)` returns `label` and `help`. `commandFieldOptionLabel(type, field, value)` names an option.
- Formatters: `formatGameClock`, `formatDuration`, `formatFeet`, `formatDice`, `formatCoins`, `signed`, `ordinal`, `count`, `pluralize`, and `joinList`.

## Game time

osrlib counts rounds from the start of the game. A round is 10 seconds, a turn is 60 rounds, and a day is 144 turns or 8,640 rounds. The engine has no time of day, so `formatGameClock(rounds)` starts day 1 at 00:00 and shows `Day 2, 10:40` for 12,480 rounds. Pass `{ startHour: 6 }` to start the day at dawn.

## Coverage data

`data/codes.json` lists every rejection code (with the params osrlib passes), every event type with its codes and fields, and the clock constants. `data/catalog.json` lists the built-in names. Regenerate both when osrlib changes:

```sh
uv run --project ~/repos/bxapi python packages/shared/src/text/tools/extract-codes.py
npx prettier --write packages/shared/src/text/data
```

The tests fail when a rejection code, an event type or code, a command, or a command field has no text, or when a rejection template uses a param that osrlib never passes with its code. After you regenerate the data, run `npx vitest run --project shared` and write the text for whatever the tests report.

## Files

- `rejections.ts`: one template for each rejection code. A template can have variants, chosen by which params are present.
- `events.ts`: the wording for each event type and code.
- `commands.ts`: command labels, field text, and option labels.
- `labels.ts` and `format.ts`: value labels and formatters.
- `context.ts`, `catalog.ts`, `humanize.ts`: names and ID replacement.
- `fixtures/`: bxapi outcomes captured from a live server (`outcomes.json`, `creation.json`) and a sample event for each type.
