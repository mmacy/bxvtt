# Game text (`@bxvtt/shared/text`)

`@bxvtt/shared/text` formats `bxapi` events, rejection codes, commands, and game values into plain B/X sentences so the UI never displays raw internal IDs or dotted codes. It is pure TypeScript with zero runtime dependencies beyond `@bxvtt/shared/bxapi`.

## Describe events and rejections

Build a `TextContext` from `PlayerView`, then format rejections or event outcomes:

```ts
import { contextFromPlayerView, describeEvents, describeRejections } from '@bxvtt/shared/text';

const ctx = contextFromPlayerView(view);

if (!outcome.accepted) {
  const sentences = describeRejections(outcome.rejections, ctx);
  // ["Wren isn't in the front rank, so they can't reach the monsters in melee or with a touch. Close with the monsters first, or use a missile weapon or a spell with range."]
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
- A refusal of a battle declaration names the declaring member in `params.character`, including the kernel checks that a declaration passes through, such as `combat.attack.out_of_reach` and `magic.cast.target_count`. Each template names the member when the param is present and still reads well without it. `DECLARATION_CODES` lists the codes whose `character` param osrlib adds this way, and `declarationParams(code)` returns the params a declaration adds to a code. A refused `give_item` also names the recipient in `params.target` for `session.command.unknown_member` and `session.command.member_incapacitated`.
- An event that osrlib recorded before 2.7 keeps its older wording. Coins read from the event's `coins` by denomination (`39 copper pieces`), and from `coins_gp_value` when `coins` is missing or empty. An experience award reads from `gained` and says when the one-level limit cut it, and from `modified_award` when `gained` is `null`. An encounter names its groups from `group_labels`, and spawned monsters read by `display_name`, with the older fields as the fallback.

## Carry `TextContext` forward across commands

`contextFromPlayerView(view)` reads the names the player view states: each member's `class_name`, `item_names` and `item_names_plural`, `spell_names` and `reversed_spell_names`, the entered `dungeons`, the entered `areas` of each `explored` level, and the monsters in each encounter group's `members`, which it names with `creatureNames`. These names win over the built-in catalog, so a custom class, a spell the adventure bundles, a dungeon, and an area read correctly without the referee view. A view from before bxapi stated these names leaves the catalog to name them.

Always pass the previous `TextContext` as the second argument to `contextFromPlayerView(nextView, prevCtx)` after describing an outcome so names of consumed potions or defeated monster groups remain available after leaving the live view:

| Function | Added names |
| --- | --- |
| `extendContextWithNames(ctx, names, plurals)` | Item names keyed by ID, and their plurals when you have them, normalized into nouns while keeping masked names (`potion`) and proper capitalization (`Hand of Saint Corvane`). |
| `extendContextWithCatalog(ctx, entries)` | Rules catalog entries (`/v1/rules/equipment`, `magic-items`, `spells`, `monsters`) missing from `data/catalog.json`. |
| `extendContextWithEntryNames(ctx, entry.names)` | Snapshot names stored on a historical feed `game` entry, including what the table called each monster (`Goblin 2`) in `names.monsters[id].name` (`describeGameEntry` applies this automatically). |
| `extendContextWithEvents(ctx, events)` | Newly identified items, by the event's `display_name` and `display_name_plural`, newly joined party members, and defeated monsters not already named (preserving disguised group labels). |
| `extendContextWithReferee(ctx, refereeView)` | Referee-only monster templates, NPCs, areas, dungeons, triggers, and flag descriptions. |

To format a historical `game` feed entry, call `describeGameEntry(entry, ctx, { only: 'player' })`.

## Sentence case, proper labels, items, and game time

- **Leading articles:** `nameInSentence(name)` lowercases a leading `"The"` mid-sentence (`"Set out for the priory on Corvane's Holm?"`), and `placeInSentence(name)` supplies the appropriate article after verbs such as `"enters"`.
- **Proper vs. common group labels:** `isProperLabel(label)` distinguishes named NPCs (`Mag Corrie`, `Gashnak One-Ear`, which take no article or plural) from common monster groups (`2 goblins`), formatted via `countedLabel(label, plural, count)`.
- **Item nouns:** `resolveItemNoun(id, ctx, { name })` returns `{ one, many, noArticle?, proper? }`, preferring curated unit nouns over catalog lot titles (`Torches (6)` resolves to `torch` / `torches` with `equipmentLotSize('torch') === 6`). Format quantities with `itemPhrase(noun, quantity)`, `itemName`, `itemCount`, or `itemList(ids, ctx, { lots })`.
- **Labels, commands, and formatters:** `sessionModeLabel`, `conditionLabel`, `abilityLabel`, `saveLabel`, `alignmentLabel`, `classLabel`, `coinName`, `itemTypeLabel`, `weaponQualityLabel` / `weaponQualityDescription`, `doorStateLabel`, `stanceLabel`, `battleActionLabel`, `battleMoveLabel`, `directionLabel`, `facingLabel`, `timeUnitLabel` / `timeUnitNoun`, `commandInfo`, `commandFieldText`, `commandFieldOptionLabel`, `humanizeMessage`, `formatGameClock` (`60` rounds/turn, `8,640` rounds/day), `formatDuration`, `formatFeet`, `formatDice`, `formatCoins`, `signed`, `ordinal`, `count`, `pluralize`, and `joinList`.
- **Monsters, spells, and coins:** `creatureNames(view.encounter?.groups)` names each creature of the open encounter, such as `Goblin 2`, or `Ogre` for the only one with its label, numbering a label's creatures in the order of their IDs so a split group keeps its numbers. Event and refusal text names a creature the same way, live and in the feed: its own name first (a referee's NPC name), then a numbered table name (`Goblin 2`), then its label (`an ogre`). `spellFormName(id, reversed, ctx)` names the reversed form by its own name (`Darkness`) when the view states it. `memberClass(id, ctx)` gives a member's class as it reads mid-sentence, from the view's `class_name` first. It goes through `classInSentence(name)`, which lowercases the first word (`Magic-User` gives `magic-user`) but keeps a proper class name's capitals (`Hollow Knight` stays `Hollow Knight`). `coinParts(coins)` gives the coins of a `Coins` object as list items (`['3 gold pieces', '4 silver pieces']`) to join with other goods, and `coinsPhrase(coins)` gives them as a phrase (`3 gold pieces and 4 silver pieces`, or `no coins`). `battleActionLabel('hide')` is `Hide`.
- **When a command works:** `commandModesSentence(type, allowedModes, mode)` turns a command's `allowed_modes` from bxapi's command catalog into a reason, such as "You can search only while exploring. The party is in town now." `sessionModeWhen` (`while exploring`) and `sessionModeNow` (`is exploring a dungeon`) give the phrases for one mode.

## Regenerate coverage data (`data/codes.json` and `data/catalog.json`)

When `osrlib` adds or changes event types, rejection codes, commands, or built-in catalog items, regenerate the extracted metadata from your `bxapi` checkout and run the `shared` test suite:

```sh
uv run --project ~/repos/bxapi python packages/shared/src/text/tools/extract-codes.py
npx prettier --write packages/shared/src/text/data
npx vitest run --project shared
```

Tests fail automatically if any rejection code, event code, battle action, weapon quality, time unit, command, or command field lacks prose or references an unused parameter. The test `covers the number of codes that osrlib defines` states how many event codes osrlib defines. Update that number only after every new code has wording of its own.

`tools/extract-codes.py` lists the params that osrlib passes where it builds each rejection, so it misses the `character` param that osrlib adds to the refusal of a battle declaration. When osrlib adds a check that a declaration passes through, add its code to `DECLARATION_CODES` in `rejections.ts`, and give its template a variant that names the member.
