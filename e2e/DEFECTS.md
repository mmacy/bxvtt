# Defects found by the end-to-end suite

Each entry describes one product defect that the end-to-end suite or exploratory play found. A test that fails because of a defect is marked `test.fixme` with the entry's ID in a comment, so the suite passes. After you fix a defect, remove the `fixme` from the tests that name its ID and run them.

Severity:

- **Blocker**: The table can't play past this point.
- **Major**: A feature is broken or misleading, or a player sees referee data, but the table can work around it.
- **Minor**: Something works incorrectly or confusingly in a way players notice.
- **Polish**: Wording, layout, or consistency.

Screenshots are under `.data/screens/e2e/`, which is ignored by Git, so regenerate them by running the spec named in the entry.

IDs are grouped by the part of the suite that found them: `D-0xx` for the lobby, accessibility, layout, and performance; `D-1xx` for the wizard and town; `D-2xx` for exploration, the feed, and the journal; `D-3xx` for encounters, battle, and the whole-game run; and `D-4xx` for referee tools, privacy, and resilience.

## Status

Every entry is open unless its **Status** line says otherwise. On 2026-11-22, each open entry was checked again against the working tree, by rerunning its spec (with any `fixme` removed) or by finding the code it describes. D-302 is fixed, and D-401 is partly fixed. Every other entry still reproduces.

## Defects

### D-001: The Party panel warns about darkness while the party is in town

- **Severity**: Polish
- **Owner**: sheet
- **Steps**: Start a game of The Drowned Bell and look at the Party tab of the dock in town.
- **What happens**: The panel shows "No light. The party is in darkness unless someone lights a torch." while the party stands in Hollin Ferry.
- **What should happen**: The light warning should appear only in a dungeon.

### D-002: The profile button's accessible name doesn't match its visible text

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: `e2e/a11y.spec.ts`, "home with tables" and "lobby, referee and player".
- **What happens**: axe reports `label-content-name-mismatch` (serious) on the profile button in the top bar. Its name is "Your profile: Ruth", but its visible text is the avatar initial and the name ("R Ruth"), so a speech-input user who says "click R Ruth" misses it.
- **What should happen**: The accessible name should contain the visible text in order, for example by hiding the avatar initial from the accessibility tree and naming the button "Ruth, your profile".
- **Screenshot**: `.data/screens/e2e/a11y-home.png`

### D-003: The "Hooks" heading in the adventure picker fails color contrast

- **Severity**: Minor
- **Owner**: lobby
- **Steps**: `e2e/a11y.spec.ts`, "lobby, referee and player". Open a lobby as the referee and look at The Drowned Bell's card.
- **What happens**: axe reports `color-contrast` (serious) on the small uppercase "HOOKS" title inside the selected adventure card.
- **What should happen**: The title should meet a 4.5:1 contrast ratio against the selected card's background.
- **Screenshot**: `.data/screens/e2e/a11y-lobby-referee.png`

### D-004: Action bar buttons leave their shortcut key out of their accessible name

- **Severity**: Minor
- **Owner**: kit
- **Steps**: `e2e/a11y.spec.ts`, "town, every part of town". Any action bar in town, such as Outfitter, Temple, Treasure buyers, and Set out.
- **What happens**: axe reports `label-content-name-mismatch` (serious): the button's visible text is "Outfitter O" (the label and a key hint), but `aria-label` is "Outfitter". The town's current-place marker (`styles.here` in `TownActions`) has the same mismatch.
- **What should happen**: Hide the key hint from the accessible name with `aria-hidden` and expose it with `aria-keyshortcuts`, so the name and the visible label agree.
- **Screenshot**: `.data/screens/e2e/a11y-town-town-square.png`

### D-005: Marching order rows have a name that leaves out what they show

- **Severity**: Minor
- **Owner**: sheet
- **Steps**: `e2e/a11y.spec.ts`, every play screen test ("exploring", "encounter", "battle", "game over", and the dock tabs test).
- **What happens**: axe reports `label-content-name-mismatch` (serious) on each row of the Party tab's marching order. The name is "Brenna, level 1 fighter, 10 of 10 hit points, armour class 4. Open the character sheet.", but the row also shows the player's name or "You", which the name omits, and it shows the numbers in another order.
- **What should happen**: The accessible name should start with the visible text, or the row should use `aria-describedby` for the extra detail and keep the visible text as its name.
- **Screenshot**: `.data/screens/e2e/a11y-exploring-player.png`

### D-006: Outfitter item buttons are named "Details for …" while they show the item and its summary

- **Severity**: Minor
- **Owner**: town
- **Steps**: `e2e/a11y.spec.ts`, "town, every part of town", Outfitter tab.
- **What happens**: axe reports `label-content-name-mismatch` (serious) on every item name button in the catalog. The button shows "Battle axe" and a summary line, but its name is "Details for Battle axe".
- **What should happen**: The name should begin with the visible item name, such as "Battle axe, show details".
- **Screenshot**: `.data/screens/e2e/a11y-town-outfitter.png`

### D-007: The dungeon map renders an empty tooltip with no accessible name

- **Severity**: Minor
- **Owner**: map
- **Steps**: `e2e/a11y.spec.ts`, any screen with the dungeon map.
- **What happens**: axe reports `aria-tooltip-name` (serious): `DungeonMap` keeps a `div[role="tooltip"]` in the page even when no tooltip shows, and it has no text or name.
- **What should happen**: Render the tooltip element only while it has content, or give it the content's text.
- **Screenshot**: `.data/screens/e2e/a11y-exploring-player.png`

### D-008: The journal's scrolling body can't be reached from the keyboard

- **Severity**: Minor
- **Owner**: journal
- **Steps**: `e2e/a11y.spec.ts`, "dock tabs, character sheet, rules reference, and dialogs", Journal tab.
- **What happens**: axe reports `scrollable-region-focusable` (serious) on the journal body: it scrolls, but neither it nor anything inside it takes focus, so a keyboard user can't scroll it.
- **What should happen**: Give the scrolling region `tabIndex={0}` and an accessible name, as the feed's list has.
- **Screenshot**: `.data/screens/e2e/a11y-journal.png`

### D-009: The saves dialog's list contains elements other than list items

- **Severity**: Minor
- **Owner**: referee
- **Steps**: `e2e/a11y.spec.ts`, "dock tabs, character sheet, rules reference, and dialogs", saves dialog.
- **What happens**: axe reports `list` (serious): the saves list (`ul` with class `list`) has direct children that aren't `li`, so screen readers announce a wrong item count.
- **What should happen**: Wrap each row in an `li`, or render the list with the kit's `List` component.
- **Screenshot**: `.data/screens/e2e/a11y-saves.png`

### D-010: The "Dead" badge on the end screen fails color contrast

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: `e2e/a11y.spec.ts`, "game over". Lose every party member and look at the end screen.
- **What happens**: axe reports `color-contrast` (serious) on the red "Dead" condition text in the end screen's party list.
- **What should happen**: The text should reach a 4.5:1 contrast ratio against its badge.
- **Screenshot**: `.data/screens/e2e/a11y-game_over.png`

### D-011: The dungeon map shows no focus ring when it has keyboard focus

- **Severity**: Minor
- **Owner**: map
- **Steps**: `e2e/a11y.spec.ts`, "tabbing through the exploring screen" and "tabbing through the battle screen". Press Tab on the play screen until the map has focus.
- **What happens**: The map's appearance doesn't change at all. `DungeonMap` sets a `focusRing` state from `:focus-visible`, but nothing visible results, so a keyboard user can't tell that the arrow keys now move the party.
- **What should happen**: The map should draw a visible focus outline while it has keyboard focus, as AGENTS.md requires for every interactive element.
- **Screenshot**: `.data/screens/e2e/map-focused-no-ring.png`

### D-012: The battle board's round number disagrees with the top bar

- **Severity**: Minor
- **Owner**: combat
- **Steps**: Start a battle (for example, spawn two goblins near the party in The Drowned Bell, which attack at once) and look at the play screen before anyone declares.
- **What happens**: The top bar shows "Round 1", which matches `view.encounter.battle_round` (1), but the battle board's heading says "Round 2".
- **What should happen**: Both should show the same round number, the one the party is declaring for.
- **Screenshot**: `.data/screens/e2e/round-mismatch.png`

### D-013: The end screen adds a second level-one heading

- **Severity**: Polish
- **Owner**: app/shell
- **Steps**: Reach `game_over` and read the headings.
- **What happens**: The top bar's table name is an `h1`, and the end screen's "The party has fallen" is a second `h1`.
- **What should happen**: The page should have one `h1`. Make the end screen's title an `h2`, as the town's "Hollin Ferry" is.

### D-014: The built client is a single 1.7 MB script that includes the design-system gallery

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: `e2e/performance.spec.ts`, "the built client is reasonably small", or `npm run build`.
- **What happens**: Vite emits one JavaScript chunk of 1,694 KB (499 KB gzipped) and warns that it exceeds 500 KB. `App.tsx` imports the `/kit` gallery and the table mock eagerly, so every player downloads development pages. The home page and the join page load the whole play screen, map renderer, and compendium before they show a name field.
- **What should happen**: Load `/kit` and `/kit/table` with `React.lazy`, and split the play screen (map, compendium, referee tools) from the home and lobby pages, so a first visit downloads well under 500 KB of script.

### D-015: The same "no light" state is described two ways, and the Party panel's version also shows outside the dungeon

- **Severity**: Polish
- **Owner**: explore and sheet
- **Steps**: Enter a dungeon without lighting a torch.
- **What happens**: The map's status pill says "No light. The party is in the dark." and the Party panel says "No light. The party is in darkness unless someone lights a torch." at the same time. The Party panel's version also stays on the end screen (see D-001 for town).
- **What should happen**: One message in one place, or the same wording in both, shown only while the party is in a dungeon.
- **Screenshot**: `.data/screens/e2e/a11y-exploring-player.png`

### D-016: The encounter panel and the action bar offer the same four choices with different labels

- **Severity**: Polish
- **Owner**: combat
- **Steps**: Meet the kobolds in the drain warren (or any encounter) and compare the encounter panel with the action bar.
- **What happens**: The panel has "Talk", "Wait", "Flee", and "Fight" buttons with explanations, and the action bar below repeats them as "Talk (Osric)", "Wait", "Flee", and "Fight". Two sets of controls for one decision, one of which names the speaker and one of which doesn't, invite the question of whether they differ.
- **What should happen**: Keep one primary set (the panel) and let the action bar show only the shortcuts, or name the speaker in both.
- **Screenshot**: `.data/screens/e2e/a11y-encounter.png`

### D-017: The character sheet shows an empty "Referee only" box

- **Severity**: Polish
- **Owner**: sheet
- **Steps**: As the referee with the lens on, open any character sheet that has no hidden state.
- **What happens**: A pink "Referee only" box at the bottom says "The referee state adds nothing hidden for Brenna."
- **What should happen**: Show the box only when the referee state has something to add.
- **Screenshot**: `.data/screens/e2e/a11y-character-sheet.png`

### D-018: Scrolling a long feed blocks the main thread for 50 to 80 ms per step

- **Severity**: Polish
- **Owner**: feed
- **Steps**: `e2e/performance.spec.ts`, "a feed with thousands of entries stays responsive" (2,000 chat messages, production build).
- **What happens**: Each scroll step of 1,500 px back through the feed produces a long task of 51 to 78 ms, and posting one message after that produces four long tasks of 67 to 88 ms. The median frame stays at 17 ms, so scrolling works, but it stutters.
- **What should happen**: Scrolling and posting should stay under the 50 ms long-task threshold, for example by memoizing row text and measuring rows less often.

### D-020: An action clicked while another command is on its way, or just after a run of moves, is dropped without a word

- **Severity**: Major
- **Owner**: app/shell
- **Steps**: `e2e/shell.spec.ts`, "an action clicked while a move is on its way is sent or explained, never dropped silently" (marked `fixme`). In the dungeon, press an arrow key, and while the move is still on its way (the spec holds it for 2 seconds, as a slow connection would), choose Rest from the action bar.
- **What happens**: Nothing. No request goes out, no toast appears, and the Rest choice is gone. `useSendCommand` in `apps/web/src/app/commands.ts` returns `skipped` with reason `busy` while a command is in flight, and `throttled` after 4 sends in a second, and shows nothing for either, because the pacing was built for held arrow keys. The same thing happens to a deliberate click right after a few quick moves: on the production build, the smoke spec's "Open it" on a door is the fifth command within a second, so the door stays closed and the player has to guess why. With a tunnel's latency of 100 to 300 ms per command, players will hit this often.
- **What should happen**: Drop extra key repeats silently, but treat a click or a menu choice differently: queue it until the command in flight lands, or show a short notice such as "Another action is still on its way." The same applies to every feature that calls `send` from a button.

### D-101: Armour and weapons picked one by one in the wizard start unworn, and the review never shows armour class

- **Severity**: Minor
- **Owner**: wizard
- **Steps**: Create a fighter in the wizard. On the outfit step, add plate mail, a shield, and a sword to the cart one at a time with their Add buttons, and leave the cart lines as they are. Continue to the review and create the character. Spec: `e2e/wizard.spec.ts`, "a fighter trades Intelligence for Strength, is refused for overspending, and shops within the gold" (the test checks the boxes itself).
- **What happens**: Each hand-picked cart line's "Wear it" or "Wield it" checkbox starts unchecked, whereas the "Fill with the … kit" button checks them. The review says "Armour class depends on what you wear, so it appears once the character exists", so nothing warns the player. The stored fighter has armour class 9 (ascending 10) and wields nothing, although they paid 80 gp for plate, shield, and sword.
- **What should happen**: The first armour, shield, and weapon the class can use should be worn and wielded when the player adds them, as the kit does, and the review should state the armour class the character will have (the character preview can compute it).
- **Screenshot**: `.data/screens/e2e/wizard-review-step.png`

### D-102: The wizard's roll step says the same thing twice

- **Severity**: Polish
- **Owner**: wizard
- **Steps**: Open the wizard from the lobby ("Create a character") before rolling.
- **What happens**: The step's subtitle reads "Roll 3d6 for each ability, in order." and the paragraph under it starts again with "Roll 3d6 for each ability, in order: Strength, Intelligence, …".
- **What should happen**: Keep one of the two sentences, so the step reads once.
- **Screenshot**: `.data/screens/e2e/wizard-roll-step.png`

### D-103: Wizard controls have long or repeated accessible names

- **Severity**: Minor
- **Owner**: wizard
- **Steps**: `e2e/wizard.spec.ts` selects these. Open the class step, then the outfit step with two armour items in the cart, and inspect the accessibility tree.
- **What happens**: Each class card is one button whose name is the whole card, about 50 words ("Cleric Human Requires Nothing Prime requisite WIS · −10% XP Hit die d6 Armour …"). Cart quantity buttons read "Decrease How many of A suit of plate mail", with a capital letter in the middle. Every armour line's checkbox is named "Wear it", and every weapon line's "Wield it", so a screen reader user hears several identical checkboxes. On the treasure buyers tab, the same happens with two "Silver altar candlestick" checkboxes for two members.
- **What should happen**: Name a class card by the class ("Cleric") and attach the details with `aria-describedby`. Name the quantity buttons "Fewer suits of plate mail" and "More suits of plate mail", and the checkboxes "Wear the plate mail" and "Wield the sword". Name a treasure checkbox with its carrier, such as "Brenna's silver altar candlestick".
- **Screenshot**: `.data/screens/e2e/wizard-class-step.png`

### D-104: Demihuman class cards repeat the race as "Demihuman: dwarf"

- **Severity**: Polish
- **Owner**: wizard
- **Steps**: Open the class step.
- **What happens**: Human classes show "Human" under the name, but the demihumans show "Demihuman: dwarf", "Demihuman: elf", and "Demihuman: halfling" under "Dwarf", "Elf", and "Halfling".
- **What should happen**: Show "Demihuman" alone, as B/X does, so the line doesn't repeat the class name.
- **Screenshot**: `.data/screens/e2e/wizard-class-step.png`

### D-105: The first spell list shows durations that point at missing text

- **Severity**: Polish
- **Owner**: wizard
- **Steps**: Create a magic-user and reach the "First spell" section of the identity step.
- **What happens**: Charm Person reads "Range 120’ · One or more days (see below)", but nothing below explains it. Self-only spells read "Range The caster", which isn't a sentence.
- **What should happen**: Drop the "(see below)" reference (or link to the spell's entry), and write the range of a self-only spell as "Range: the caster" or "On the caster".
- **Screenshot**: `.data/screens/e2e/wizard-identity-magic-user.png`

### D-106: The wizard's review lists every coin denomination, even at zero

- **Severity**: Polish
- **Owner**: wizard
- **Steps**: Reach the review step with gold left over.
- **What happens**: The equipment section lists "0 pp (platinum)", "29 gp (gold)", "0 ep (electrum)", "0 sp (silver)", and "0 cp (copper)". The town and the character sheet show only the coins a character has.
- **What should happen**: Show only the nonzero denominations, as everywhere else.

### D-107: The wizard's shop and the town's Outfitter are two different shops for the same job

- **Severity**: Polish
- **Owner**: wizard, town
- **Steps**: Compare the wizard's outfit step with the town's Outfitter tab.
- **What happens**: The wizard shop is a list with an "About X" button, no weights, and a search box named "Search the shop". The Outfitter is a sortable table with weights, a "Details for X" button, and a search box whose placeholder says "Search the shelves" while its accessible name is "Search equipment". The cart in the wizard has quantity steppers and wear checkboxes, but the Outfitter's cart has neither. Gear weights show "-" while ammunition weights show "0".
- **What should happen**: Use one catalog and cart component for both, with one set of names, and show weights the same way for every item.
- **Screenshot**: `.data/screens/e2e/wizard-outfit-step.png`, `.data/screens/e2e/town-outfitter.png`

### D-108: The temple writes the same price two ways

- **Severity**: Polish
- **Owner**: town
- **Steps**: `e2e/town.spec.ts`, "the temple heals a wounded member, and the party pays the fee". On the Temple tab, buy raise dead for a living member.
- **What happens**: The service list shows "1000 gp", and the refusal banner says "That costs 1,000 gp".
- **What should happen**: Format prices the same way everywhere, with a thousands separator.

### D-109: The rest options repeat their length, and the turn option gives a dungeon rule in town

- **Severity**: Polish
- **Owner**: town
- **Steps**: Open the town's "Rest and prepare" tab.
- **What happens**: Each option states its length twice: "Rest for one turn, which is 10 minutes." and then "1 turn (10 minutes) of game time". The turn option also says "A party needs this breather once every six turns", which is a rule for dungeon exploration and doesn't apply in town.
- **What should happen**: State the length once, and drop the six-turn note in town.
- **Screenshot**: `.data/screens/e2e/town-rest.png`

### D-110: The town shows the game clock twice

- **Severity**: Polish
- **Owner**: town
- **Steps**: Open any town tab.
- **What happens**: The top bar shows "Day 1, 01:10", and the town masthead shows the same clock again in a pill on the right.
- **What should happen**: Show the clock once. The top bar already shows it on every screen.
- **Screenshot**: `.data/screens/e2e/town-treasure-buyers.png`

### D-111: Coin amounts read with a stray letter for screen readers and in copied text

- **Severity**: Polish
- **Owner**: kit
- **Steps**: `e2e/town.spec.ts` matches around it. Read the text content of any coins list, such as a member on the town square.
- **What happens**: The coin icon is a "g" glyph in the text, so the content reads "g70gp (gold)". The accessibility tree reads "70 gp (gold)", but copied text and the wizard's "Starting gold" line ("Starting goldg110gp") include the glyph.
- **What should happen**: Mark the coin glyph `aria-hidden` and keep it out of the text flow (a CSS pseudo-element or an SVG), so the text reads "70 gp".

### D-201: Area names on the map are cut off with an ellipsis at the default zoom

- **Severity**: Polish
- **Owner**: map
- **Steps**: `e2e/explore.spec.ts`, "stairs take the party to the next level". Take the night stair to level 2, or stand on the gatehouse stair at the entrance.
- **What happens**: The label over the party reads "Foot of the nig..." and "Gatehouse...", although the map around the party is empty and has room for the whole name.
- **What should happen**: The label should show the whole area name, or wrap it, at the zoom the map opens at. The hover tooltip isn't a substitute, because touch and keyboard users never see it.
- **Screenshot**: `.data/screens/e2e/explore-level-2.png`

### D-202: The minimap draws the unexplored level as a flat light-blue block

- **Severity**: Polish
- **Owner**: map
- **Steps**: `e2e/explore.spec.ts`, any test. Enter the priory and look at the minimap in the bottom right corner.
- **What happens**: The minimap fills the whole level's bounding box with one light-blue color and marks the party with a red dot. The main map shows the same unexplored squares as dark fog, so the minimap looks like a solid tile with nothing on it until the party has explored a lot.
- **What should happen**: The minimap should draw unexplored squares in the main map's fog color, so it shows the explored shape.
- **Screenshot**: `.data/screens/e2e/explore-level-2.png`

### D-203: The scene panel announces areas without an article

- **Severity**: Polish
- **Owner**: explore
- **Steps**: `e2e/explore.spec.ts`, "stairs take the party to the next level". Walk or be placed into any keyed area and read the scene panel's live region (the text a screen reader speaks).
- **What happens**: The panel announces "The party enters Kitchen." and "The party enters Foot of the night stair." (`ScenePanel.tsx`, `setAnnouncement`). The feed, from the text layer, says "The party enters the gatehouse stair."
- **What should happen**: The announcement should read as a sentence and match the feed, such as "The party enters the kitchen."

### D-204: The map's screen reader description says the arrow keys pan the map, while they move the party

- **Severity**: Minor
- **Owner**: explore
- **Steps**: Enter the priory as the caller and read the map canvas's accessible description.
- **What happens**: The canvas's label says "The arrow keys move the party", and they do. Its `aria-describedby` text says "Arrow keys pan the map. Plus and minus zoom. Zero fits the explored map." `MapStage` handles the arrow keys itself and never passes `arrowKeys="move"` to `DungeonMap`, so the map describes its default behavior.
- **What should happen**: The description should agree with the label: arrow keys move the party, and Shift with an arrow key pans.

### D-205: Pins, drawings, and pings exist only on the canvas, so keyboard and screen reader users can't reach them

- **Severity**: Minor
- **Owner**: explore
- **Steps**: `e2e/explore.spec.ts`, "pings, drawings, and pins reach the other person". Sam pins a note; Ruth tries to read it.
- **What happens**: The only way to open a pin is to click its marker on the canvas, and the marker's head is drawn above and to the left of the point it marks, so a click on the marked square misses it. No list of pins exists, a pin can't be focused, and nothing announces another member's new pin, drawing, or ping. The spec has to click the drawn head at an offset of (0.8, 1.3) squares.
- **What should happen**: Each pin should be reachable by role and name (for example, a "Pins on this level" list or focusable markers), and a ping or new pin from someone else should be announced in a polite live region.

### D-206: The ruler's measurement is never stated in text

- **Severity**: Minor
- **Owner**: map
- **Steps**: Choose "Measure" on the map tool rail and point at a square a few squares away.
- **What happens**: The distance appears only on the canvas. The map's live region keeps saying "The party is at x, y, facing …", and the prompt "Point at a square to measure…" never changes to a result.
- **What should happen**: The measurement, such as "3 squares, 30 feet", should also appear in the map's status text or in the ruler's status line.

### D-207: The party's light is described two different ways at once

- **Severity**: Polish
- **Owner**: sheet
- **Steps**: Light Brenna's torch in the priory and look at the Party tab and the map together.
- **What happens**: The Party tab says "Light from Brenna (6 turns left)". The map's light status says "Brenna's light, about 6 turns left".
- **What should happen**: Both should use one wording. The map's phrasing reads better.

### D-208: The autosave notice capitalizes "The" in the middle of a sentence

- **Severity**: Polish
- **Owner**: feed
- **Steps**: Enter The Drowned Bell's priory with autosave on, then open the Feed tab.
- **What happens**: The system line reads "Autosaved: Entered The priory on Corvane's Holm."
- **What should happen**: The label should read as a sentence, such as "Autosaved: entered the priory on Corvane's Holm."

### D-209: The referee map's wandering-monster chip says "level table"

- **Severity**: Polish
- **Owner**: explore
- **Steps**: Enter the priory as the referee and read the chip at the bottom left of the map.
- **What happens**: The chip reads "Wandering monsters: 1 in 6 every 2 turns, level table". "level table" doesn't tell the referee which table.
- **What should happen**: Name the table, as the adventure does ("Priory undercroft"), or drop the phrase.

### D-210: A player's game log names the dungeon by its ID, while the town and the referee use its name

- **Severity**: Polish
- **Owner**: shared text
- **Steps**: `e2e/feed.spec.ts`, "the game log reads as sentences after a busy stretch of play". Compare Sam's and Ruth's feeds.
- **What happens**: Sam's feed says "The party enters the priory, level 1." and "The party is placed in the priory, level 1.", which is the dungeon ID `priory` made readable. Ruth's feed says "The party is placed in the priory on Corvane's Holm, level 1.", and the town's road list shows Sam "The priory on Corvane's Holm".
- **What should happen**: Players should read the dungeon's name, which they already see in town, so the same place has one name everywhere.
- **Screenshot**: `.data/screens/e2e/feed-busy-sam.png`, `.data/screens/e2e/feed-busy-ruth.png`

### D-211: A feature marker on the player's map covers an area name

- **Severity**: Polish
- **Owner**: map
- **Steps**: `e2e/feed.spec.ts`, "the game log reads as sentences after a busy stretch of play". Look at the chapter house on Sam's map after the search.
- **What happens**: The diamond marker for the chapter house's relief map is drawn on top of the area label, so it reads "Chap◇ter house".
- **What should happen**: The label should move clear of feature markers, as the map README says it does for stairs and features.
- **Screenshot**: `.data/screens/e2e/feed-busy-sam.png`

### D-301: A thrown dagger is described as shooting

- **Severity**: Polish
- **Owner**: combat
- **Steps**: In the guardroom battle, open Tamsin's (magic-user with a dagger) choices.
- **What happens**: The Attack tile reads "Shoot: Goblins, 30 feet away" and "Shoots with a dagger from 30 feet."
- **What should happen**: A thrown weapon should read "Throw" and "Throws a dagger 30 feet."

### D-302: A refused battle declaration doesn't say whose declaration it is (fixed)

- **Severity**: Major
- **Owner**: server
- **Status**: Fixed in the working tree during the run. The server now probes each declaration (`attributeRefusals` in `apps/server/src/game/battle.ts`) and the board marks Brenna's row with "The target is 30 feet away, too far for a melee attack." `e2e/combat.spec.ts`, "the refusal names the member whose declaration bxapi refused", now passes without `fixme`.
- **Steps**: With `auto_resolve` off, start the guardroom battle in The Drowned Bell, declare an attack for Brenna on the goblins 30 feet away without closing in, have everyone else hold, and resolve the round.
- **What happened**: `declarations.refusals` was `[{ "member_id": null, "code": "combat.attack.out_of_reach", ... }]`, so the board could only show a general banner.
- **What should happen**: Each refusal names the member whose declaration bxapi refused, and the board marks that row.

### D-303: Popovers are dialogs without an accessible name

- **Severity**: Minor
- **Owner**: kit
- **Steps**: `e2e/combat.spec.ts`, "walking into a keyed room…". In an encounter, the caller clicks Talk (or Flee).
- **What happens**: The popover is a `dialog` with no accessible name. Its visible title ("Who speaks for the party?", "Flee") is a plain paragraph that isn't linked with `aria-labelledby`, so a screen reader announces only "dialog", and a test can't find it by role and name.
- **What should happen**: The kit's `Popover` should name its content by its title.

### D-304: The feed entry for talking doesn't say who spoke, and the encounter's opening lines contradict each other

- **Severity**: Minor
- **Owner**: shared text
- **Steps**: `e2e/combat.spec.ts`, "walking into a keyed room…". Walk into the guardroom, then have the caller talk with Osric as the speaker. Read the feed.
- **What happens**: The encounter entry says "The monsters are uncertain." and then "The monsters pay the party no mind." in the same entry, while the encounter panel shows the bearing "Indifferent". The talk entry, headed "Talk to the monsters", says only "The monsters are uncertain." and doesn't name Osric.
- **What should happen**: The opening entry should state one bearing, the one the panel shows (or say that the bearing changed). The talk entry should name the speaker, such as "Osric talks to the goblins. They are uncertain now."

### D-305: A member's choices open on the Attack tab when every attack is out of reach

- **Severity**: Polish
- **Owner**: combat
- **Steps**: In the guardroom battle, declare for Tamsin. The board opens Osric's choices next.
- **What happens**: Osric's choices open on Attack, whose only tile is disabled ("Out of reach: 30 feet away, and Osric moves 20 feet a round."). The useful choice, closing in, is on the Move tab.
- **What should happen**: The choices should open on the tab of the suggested action (the one the row's quick button offers), here Move.

### D-306: The same fallen member is "Down" on the battle board and "Dead" in the Party panel

- **Severity**: Polish
- **Owner**: combat
- **Steps**: `e2e/combat.spec.ts`, "a party member dies…". Let the goblins kill Tamsin (seed 110, 1 hit point).
- **What happens**: Tamsin's row on the battle board reads "Down", while the Party panel and the end screen show a red "Dead" badge.
- **What should happen**: The board should use the member's condition the way the sheet does: "Dead" for a dead member, and "Down" (or "Unconscious") only for a member who is alive at 0 hit points.
- **Screenshot**: `.data/screens/e2e/combat-member-down.png`

### D-307: The after-fight summary is titled "Victory", the same word as winning the adventure

- **Severity**: Polish
- **Owner**: combat
- **Steps**: `e2e/combat.spec.ts`, "the party wins through the board…". Win the guardroom fight.
- **What happens**: The aftermath card over the map is titled "Victory", which is also the title of the end screen when the adventure is won and the name of the `victory` game mode. Its experience line reads "worth 10 experience for the party".
- **What should happen**: Title the card for the fight, such as "The goblins are beaten", and write "10 XP" or "10 experience points".
- **Screenshot**: `.data/screens/e2e/combat-aftermath-victory.png`

### D-308: The pile of dropped treasure has three names

- **Severity**: Polish
- **Owner**: combat
- **Steps**: Win the guardroom fight and read the aftermath and the scene panel.
- **What happens**: The aftermath says "Coins worth 7 gp, in a pile where the party stands." The scene panel says "Dropped goods lie here." and offers "Pick up the dropped goods". The action bar offers "Treasure".
- **What should happen**: Use one name for the pile everywhere, such as "the goblins' coins" or "the pile".

### D-309: Party tokens overlap the "Party line" label on the battle track

- **Severity**: Polish
- **Owner**: combat
- **Steps**: Start the guardroom battle with four members and look at the range track.
- **What happens**: The third member's hit point bar is drawn through the "Party line" label, so the label reads as struck through. When two monster groups stand in melee, the second group's token covers the first group's condition label (only "ep" of "asleep" shows).
- **What should happen**: Labels should sit clear of the tokens.
- **Screenshot**: `.data/screens/e2e/combat-battle-playback.png`

### D-310: The battle composer requests rules entries that don't exist, and the browser logs 404 errors

- **Severity**: Minor
- **Owner**: combat
- **Steps**: `e2e/combat.spec.ts`, "declaring against a monster whose family isn't a catalog entry requests nothing that fails" (marked `fixme`). In The Toll at Crookback Bridge, open a member's choices in the battle with Mag Corrie (`veteran_2`).
- **What happens**: `useGazeGroups` in `Composer.tsx` requests `/api/rules/monsters/<family_id>` for each group. The family `veteran` isn't a monster ID, so the request answers 404 and the console logs "Failed to load resource" for every player. A family that isn't a catalog entry also can't be checked for a gaze.
- **What should happen**: Look gaze attacks up from data that exists for every group (for example, the full monster catalog by `family_id`, or a field in the player view), and request nothing that 404s.

### D-311: The referee's "They came to terms" dialog nests block elements inside a paragraph

- **Severity**: Minor
- **Owner**: combat
- **Steps**: `e2e/combat.spec.ts`, "the referee ends an encounter by coming to terms without a console error" (marked `fixme`). As the referee, open "Monsters and referee tools" in an encounter and click "They came to terms".
- **What happens**: React logs "In HTML, <p> cannot be a descendant of <p>" and "<div> cannot be a descendant of <p>". `RefereeActions` passes a `<p>` and a `Checkbox` as the `description` of `ConfirmDialog`, which renders the description inside Radix's `AlertDialog.Description` paragraph.
- **What should happen**: Put the checkbox in the dialog body rather than the description, or let `ConfirmDialog` render a block description, so the markup is valid and the console stays clean.

### D-312: Mag Corrie appears as "veteran" in the fight that the quest names her for

- **Severity**: Polish
- **Owner**: adventures
- **Steps**: `e2e/smoke.spec.ts`. Climb to the captain's loft in The Toll at Crookback Bridge.
- **What happens**: The quest objective reads "Beat Mag Corrie", and the area description names Mag Corrie and her bodyguard, but the battle board calls them "veteran" and "berserker", the monster templates' names, and bxapi's encounter message reads "2 veterans".
- **What should happen**: The adventure should give the captain's loft monsters display names (as The Drowned Bell does for its drowned prior), such as "Mag Corrie" and "the bodyguard", so the fight matches the story.
- **Screenshot**: `.data/screens/e2e/smoke-captains-loft.png`

### D-401: The referee panel shows raw feature IDs, flag keys, and cell coordinates

- **Severity**: Polish
- **Owner**: referee
- **Status**: Partly fixed. The status strip now shows the area's name instead of `gatehouse_stair`. The rest is still open.
- **Steps**: Start The Drowned Bell, enter the priory, and open the Referee tab. Look at the status strip, the "Here and now" section, and the "Quests, flags, and triggers" section.
- **What happens**: The status strip still ends with "cell 14, 23" (`RefereePanel.tsx`). Each feature in "Here and now" shows its ID next to its title, such as "Feature fallen_statue" (`AreaDetails.tsx`, `styles.idMark`). The objective "Report to Reeve Tamsin Hale" reads "Done when: The party returns to Hollin Ferry, while the flag priory.gashnak is “dead”" (`model/describe.ts`).
- **What should happen**: The referee interface should name things in words. AGENTS.md forbids raw codes and IDs in the main interface. If the IDs and flag keys help a referee who writes adventures, they should sit behind a details toggle.
- **Screenshot**: `.data/screens/e2e/referee-now.png`

### D-402: Picking a cell or a door on the map needs a mouse

- **Severity**: Minor
- **Owner**: map
- **Steps**: As a referee, open Quick actions, then "Place the party", choose "A cell", and press "Pick a cell on the map". Try to pick a cell with the keyboard. Do the same with "Change a door" and "Pick a door on the map".
- **What happens**: The map enters pick mode, but only a pointer click picks. The arrow keys pan the map, and Enter does nothing. The map's README lists no keyboard path for `pick-cell` or `pick-edge`.
- **What should happen**: In pick mode the arrow keys should move a highlighted cell (or edge) and Enter should pick it, as the ruler does with `startMeasure`. "An area" and the typed door fields work as keyboard alternatives today, but a cell that isn't an area's centre can't be chosen without a mouse.
- **Spec**: `e2e/referee.spec.ts` "the referee places the party by picking a cell, and changes a door" clicks the canvas by pixel offset.

### D-403: Every save row's restore button is named "Restore"

- **Severity**: Polish
- **Owner**: referee
- **Steps**: Make two saves, open the table menu, choose Saves, and list the buttons with a screen reader.
- **What happens**: Each row has a button named "Restore", so a screen reader's button list reads "Restore, Restore, Restore". The row's menu button is named "More for <save name>", which is unique.
- **What should happen**: Name the button for its save, such as "Restore Before the guardroom", or give it an `aria-describedby` that points at the save's title.

### D-404: Dungeon names starting with "The" are capitalized in the middle of sentences

- **Severity**: Polish
- **Owner**: server
- **Steps**: Start The Drowned Bell. In town, press "Set out" in the action bar. Then enter the dungeon and open the table menu's Saves dialog.
- **What happens**: The set-out dialog asks "Set out for The priory on Corvane's Holm?", and the autosave is labeled "Entered The priory on Corvane's Holm".
- **What should happen**: A name that starts with "The" should read "the" inside a sentence ("Set out for the priory on Corvane's Holm?"). The autosave label comes from the server, and the dialog title from the town feature, so both need the same rule, ideally in `@bxvtt/shared/text`.
- **Screenshot**: `.data/screens/e2e/referee-saves.png`

### D-405: The pin dialog says everyone sees the pin while "Only referees see this pin" is checked

- **Severity**: Polish
- **Owner**: explore
- **Steps**: As a referee, choose "Pin a note" in the map tools, click the map, and check "Only referees see this pin".
- **What happens**: The dialog's description still reads "Everyone at the table sees the pin and its note on this level."
- **What should happen**: The description should change with the checkbox, for example "Only referees see this pin and its note." The pin itself stays private: the privacy spec confirms that the player's browser never receives it.

### D-019: The character sheet repeats the name and formats the class line oddly

- **Severity**: Polish
- **Owner**: sheet
- **Steps**: Open any character sheet from the Party tab.
- **What happens**: The sheet shows the "Brenna" heading twice. The class line's accessible text reads "fighter (open in the rules reference)" with a lowercase class name, and the line has a stray space before a comma (", Veteran , Lawful").
- **What should happen**: One heading, and a class line such as "Level 1 fighter, Veteran, Lawful" whose link is named "Fighter in the rules reference".
- **Screenshot**: `.data/screens/e2e/a11y-character-sheet.png`

## Notes that aren't defects

- bxapi has no command that grants a gem or a piece of jewellery, so the referee's grant tool can only give items and coins. The town spec gets treasure by having the referee place the party in the chapel of The Drowned Bell and take the altar's candlesticks. If the referee should be able to hand out treasure, bxapi needs a `grant_valuable` command first.
