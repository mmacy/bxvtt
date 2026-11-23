# Game text (`@bxvtt/shared/text`)

`@bxvtt/shared/text` formats `bxapi` events, rejection codes, commands, and game values into plain B/X sentences so the UI never displays raw internal IDs or dotted codes. It is pure TypeScript with zero runtime dependencies beyond `@bxvtt/shared/bxapi`.

## Describe events and rejections

Build a `TextContext` from `PlayerView`, then format rejections or event outcomes:

```ts
import { contextFromPlayerView, describeEvents, describeRejections } from '@bxvtt/shared/text';

const ctx = contextFromPlayerView(view);

if (!outcome.accepted) {
  const sentences = describeRejections(outcome.rejections, ctx);
  // ["Wren isn't in the front rank, so they can't attack in melee. Close with the monsters first, or use a missile weapon or spell."]
}

for (const line of describeEvents(outcome.events, ctx, { messages: outcome.messages })) {
  // line.text          -> "Brenna hits a goblin with a sword for 5 damage."
  // line.detail        -> "Rolled 16 +1 = 17, needed 13 against armour class 6. Damage dice: 5."
  // line.refereeDetail -> optional referee-only coordinates, such as "Cell (14, 17)."
  // line.category | line.tone | line.icon | line.actorIds
}
```

- `isTradeInProgress(code)` and `describeTradeGuidance(rejection)` cover the two ability trade refusals (`reduction_not_even`, `points_mismatch`) that describe a trade the player hasn't finished. `describeTradeGuidance` words them as the next step, using only the refusal's params. Any other code, including one bxapi adds later, is a wrong choice and keeps its `describeRejection` wording and a warning.
- `describeEvent` formats a single event; `describeEvents` joins attack rolls with immediate damage, collapses empty wandering-monster check runs, and drops redundant `dead` or duplicate HP lines (pass `{ dropRedundant: false }` to retain all lines, or `{ only: 'player' }` to filter out referee events).
- Display `line.refereeDetail` only when the user is a referee with the referee lens enabled.

## Carry `TextContext` forward across commands

Always pass the previous `TextContext` as the second argument to `contextFromPlayerView(nextView, prevCtx)` after describing an outcome so names of consumed potions or defeated monster groups remain available after leaving the live view:

| Function | Added names |
| --- | --- |
| `extendContextWithScene(ctx, scene)` | `scene.names` (item/magic-item/valuable display names) and `scene.dungeon_names`. |
| `extendContextWithNames(ctx, names)` | Item names keyed by ID, normalized into singular/plural nouns while keeping masked names (`a potion`) and proper capitalization (`Hand of Saint Corvane`). |
| `extendContextWithCatalog(ctx, entries)` | Rules catalog entries (`/v1/rules/equipment`, `magic-items`, `spells`, `monsters`) missing from `data/catalog.json`. |
| `extendContextWithEntryNames(ctx, entry.names)` | Snapshot names stored on a historical feed `game` entry (`describeGameEntry` applies this automatically). |
| `extendContextWithEvents(ctx, events)` | Newly identified items, newly joined party members, and defeated monsters not already named (preserving disguised group labels). |
| `extendContextWithReferee(ctx, refereeView)` | Referee-only monster templates, NPCs, areas, dungeons, triggers, and flag descriptions. |

To format a historical `game` feed entry, call `describeGameEntry(entry, ctx, { only: 'player' })`.

## Sentence case, proper labels, items, and game time

- **Leading articles:** `nameInSentence(name)` lowercases a leading `"The"` mid-sentence (`"Set out for the priory on Corvane's Holm?"`), and `placeInSentence(name)` supplies the appropriate article after verbs such as `"enters"`.
- **Proper vs. common group labels:** `isProperLabel(label)` distinguishes named NPCs (`Mag Corrie`, `Gashnak One-Ear`, which take no article or plural) from common monster groups (`2 goblins`), formatted via `countedLabel(label, plural, count)`.
- **Item nouns:** `resolveItemNoun(id, ctx, { name })` returns `{ one, many, noArticle?, proper? }`, preferring curated unit nouns over catalog lot titles (`Torches (6)` resolves to `torch` / `torches` with `equipmentLotSize('torch') === 6`). Format quantities with `itemPhrase(noun, quantity)`, `itemName`, `itemCount`, or `itemList(ids, ctx, { lots })`.
- **Labels, commands, and formatters:** `sessionModeLabel`, `conditionLabel`, `abilityLabel`, `saveLabel`, `alignmentLabel`, `classLabel`, `coinName`, `itemTypeLabel`, `weaponQualityLabel` / `weaponQualityDescription`, `doorStateLabel`, `stanceLabel`, `battleActionLabel`, `battleMoveLabel`, `directionLabel`, `facingLabel`, `timeUnitLabel` / `timeUnitNoun`, `commandInfo`, `commandFieldText`, `commandFieldOptionLabel`, `humanizeMessage`, `formatGameClock` (`60` rounds/turn, `8,640` rounds/day), `formatDuration`, `formatFeet`, `formatDice`, `formatCoins`, `signed`, `ordinal`, `count`, `pluralize`, and `joinList`.

## Regenerate coverage data (`data/codes.json` and `data/catalog.json`)

When `osrlib` adds or changes event types, rejection codes, commands, or built-in catalog items, regenerate the extracted metadata from your `bxapi` checkout and run the `shared` test suite:

```sh
uv run --project ~/repos/bxapi python packages/shared/src/text/tools/extract-codes.py
npx prettier --write packages/shared/src/text/data
npx vitest run --project shared
```

Tests fail automatically if any rejection code, event code, enum value, command, or command field lacks prose or references an unused parameter.
