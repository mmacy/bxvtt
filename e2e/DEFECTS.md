# Defects found by the end-to-end suite

This report lists the product defects that are open after the second, verification pass of the end-to-end suite and of exploratory play. The fixed defects from both passes are listed by title in "Fixed" at the end. Each open entry gives the steps, or the spec that shows it, what happens, what should happen, and a screenshot under `.data/screens/e2e/` when one helps (that folder is ignored by Git, so run the spec to regenerate it).

A test that fails because of an open defect is marked `test.fixme` with the entry's ID in a comment, so the suite passes. After you fix a defect, remove the `fixme` from the tests that name its ID and run them.

Severity:

- **Blocker**: The table can't play past this point.
- **Major**: A feature is broken or misleading, or a player sees referee data, but the table can work around it.
- **Minor**: Something works incorrectly or confusingly in a way players notice.
- **Polish**: Wording, layout, or consistency.

IDs that start with `D-` come from the first pass, and IDs that start with `R-` from the second.

## Status

On 2026-11-22, at commit `4bc4349`, 55 defects are open: 0 blockers, 0 majors, 21 minors, and 34 polish. Every open entry was found or confirmed on that tree. The suite passes in development mode and against the production build, with 3 tests marked `fixme` (R-002, R-301 with R-302, and R-303).

## Open defects by owner

### adventures

- R-514 (Polish): One of Wethercote's services has no name, so its whole sentence becomes a heading

### app/shell

- R-004 (Minor): The play screen takes about four times longer to become usable since the bundle was split
- R-201 (Minor): The map pick prompt covers the map's toolbar
- R-301 (Minor): The end screen's restore buttons are all named "Restore"
- R-303 (Minor): The victory screen leaves out the adventure's closing text
- R-528 (Minor): The victory screen lists a quest from the table's previous adventure
- R-101 (Polish): Accessible names built from separate elements have a stray space before a comma
- R-302 (Polish): The restore confirmation lowercases the save's label, place names included

### combat

- R-517 (Minor): Waiting on indifferent monsters gives no feedback, and the panel shows an empty "What happened" box
- R-518 (Minor): "Pick up the dropped goods" takes nothing after the aftermath said coins were left behind
- R-304 (Polish): A second monster group in melee is drawn at 15 feet on the range track
- R-306 (Polish): A player who isn't the caller sees the same refusal four times in the encounter panel
- R-523 (Polish): A single monster is written as plural and as "×1"
- R-524 (Polish): A long aftermath title pushes the Close button onto its own line, and a room label sits outside its room
- R-526 (Polish): The action bar keeps offering "Attack" while the composer has Cast selected

### compendium

- R-106 (Polish): The rules reference's class cards repeat the class name as the race

### explore

- R-203 (Minor): The darkness overlay hides the map's focus ring while the party has no light (D-011 partly fixed)
- R-206 (Minor): During an encounter the encounter panel covers the party on the map
- R-207 (Polish): The folded scene bar shows two chevron buttons side by side
- R-208 (Polish): The Pins list crowds its rows and clips the focus ring
- R-525 (Polish): The bridge deck is called "A corridor"

### feed

- R-002 (Minor): The darkest user color is unreadable as a name in the feed
- R-503 (Minor): A run of moves renders as a broken feed group with a stray "Sam," and an entry with no name
- R-531 (Polish): A level up only appears as a feed line

### lobby

- R-104 (Minor): At phone width the lobby is wider than the screen
- R-501 (Minor): The join page offers to bring a stranger back in as the referee, and its text assumes the visitor played before
- R-530 (Minor): Returning to the lobby quietly resets every character to how it was created
- R-109 (Polish): The rejoin card tells every visitor that the table's address changed
- R-510 (Polish): Each party row in the lobby has two buttons that open the same sheet

### map

- R-204 (Polish): Area names are still cut off while the party has seen only one cell (D-201 still open)
- R-205 (Polish): Map labels run into the party token and into doors on The Toll at Crookback Bridge

### referee

- R-103 (Minor): The "Change" button for autosave does nothing in the lobby's saves dialog
- R-527 (Minor): Placing the party in a keyed area skips its encounter and triggers without saying so
- R-529 (Minor): After a total party kill, the referee can still complete the quest that ends the adventure
- R-111 (Polish): Every save in the lobby is badged "Earlier game"
- R-202 (Polish): The pick prompts tell the referee to click, although the keyboard picks too
- R-407 (Polish): An unavailable quick action is named "End the encounter Not now"
- R-519 (Polish): The referee's wandering monster table shows one row per die face
- R-532 (Polish): Small wording slips in the referee panel, the readiness card, and the end screen

### server

- R-003 (Minor): The production server sends scripts and styles uncompressed
- R-513 (Minor): The server autosaves "before the battle" when the party only meets indifferent monsters

### shared text

- R-504 (Polish): The feed writes a memorized spell's name in lower case
- R-505 (Polish): A full day's rest fills the feed with 13 lines, most of which say nothing happened
- R-521 (Polish): Slain monsters "wake up" in the feed

### sheet

- R-520 (Minor): The new prepare dialog closes when bxapi refuses, and lets a player pick more copies than slots

### town

- R-107 (Polish): The catalog still shows weights two ways
- R-506 (Polish): "Recently in town" headlines a rest with a burnt-out torch, and its "+13 more" can't be opened
- R-522 (Polish): The temple names a dead member's button "Osric Dead Dead"

### wizard

- R-102 (Minor): The wizard's "Wear it" and "Wield it" checkboxes have names that leave out their visible label
- R-105 (Polish): A refused ability trade tells the player to lower a score it just said can't be lowered
- R-108 (Polish): The wizard's starting gold keeps the coin glyph in its text
- R-110 (Polish): The wizard's review says a character goes out "wearing and wielding" a dagger
- R-112 (Polish): Class feature names and a few sheet labels are in title case
- R-113 (Polish): The roll step lists the qualifying classes before the dice land
- R-509 (Polish): The first spell list writes ranges two ways

## Open defect entries

### R-002: The darkest user color is unreadable as a name in the feed

- **Severity**: Minor
- **Owner**: feed
- **Steps**: `e2e/a11y.spec.ts`, "every user color reads as a name in the feed" (marked `fixme`). Set a user's color to `#882255` (one of the 12 colors the server assigns at random) and post a message.
- **What happens**: axe reports `color-contrast` (serious) on the author's name in the feed: the wine color on the feed's dark background is far below 4.5:1. Each new user has a 1 in 12 chance of this color, so a run of the dock tabs test fails at random in production mode.
- **What should happen**: Every user color should be readable as text where the feed uses it, for example by lightening the name color on dark surfaces (keep the user's color for the avatar) or by replacing `#882255` in `USER_COLORS`.

### R-003: The production server sends scripts and styles uncompressed

- **Severity**: Minor
- **Owner**: server
- **Steps**: `e2e/performance.spec.ts`, "a first visit to the home page downloads only the home page", or `curl -s -D - -o /dev/null -H 'Accept-Encoding: gzip, br' http://127.0.0.1:<port>/assets/index-<hash>.js` against `npm start`.
- **What happens**: The response has no `Content-Encoding` and a `Content-Length` of 322,565 bytes for a file that gzips to about 99 KB. A first visit to the home page transfers 692 KB of script, which is its full decoded size. The catalog routes compress, but the static client doesn't.
- **What should happen**: Serve the built client compressed, for example with precompressed `.br` and `.gz` files from the build and `preCompressed: true` in `@fastify/static`, so a first visit transfers about a third as much.

### R-004: The play screen takes about four times longer to become usable since the bundle was split

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: `e2e/performance.spec.ts`, "the play screen becomes usable quickly", against the production build (same machine and seed as the first round).
- **What happens**: On the final run, the party could act 972 ms after a cold load (498 ms before the split) and a median of 1,023 ms after a warm reload with everything cached (217 ms before). An earlier run measured 936 ms and 858 ms. The screen stays empty for the first 400 ms while the browser fetches the play screen's chunks one after another (`index`, then `PlayShell`, then `store` and `MapStage`). Over a tunnel, each step of that chain adds a round trip.
- **What should happen**: A player who opens a table should fetch the play screen's chunks in parallel, for example with `<link rel="modulepreload">` for `PlayShell`, `store`, and `MapStage` when the route is a table, or by importing the play screen as soon as the identity loads. The home page's own load is fine (152 ms, and it fetches no play screen chunks).

### R-101: Accessible names built from separate elements have a stray space before a comma

- **Severity**: Polish
- **Owner**: app/shell, sheet, town
- **Steps**: Read the accessibility tree of the home page's profile button, the Party panel's marching order, the Outfitter or wizard catalog, and the character sheet's class line. `e2e/lobby.spec.ts` and `e2e/shell.spec.ts` match the profile button with an optional space for now.
- **What happens**: Chrome joins the button's separate spans with a space, so the names read "Ruth , your profile", "Brenna , Sam , Level 1 fighter" (marching order row), "Battle axe 1d8, melee, slow, two-handed , show details" (catalog item button), and ", Veteran , Lawful" (sheet class line). A screen reader pauses at the wrong place, and the names don't match the intended "Ruth, your profile".
- **What should happen**: Put the comma inside the same text node as the word before it, or build the name with `aria-label` or `aria-labelledby`, so each name reads "Ruth, your profile" and "Battle axe, 1d8, melee, slow, two-handed, show details".
- **Screenshot**: `town-party-panel.yml`, `town-outfitter.yml`, `sheet-brenna.yml`

### R-102: The wizard's "Wear it" and "Wield it" checkboxes have names that leave out their visible label

- **Severity**: Minor
- **Owner**: wizard
- **Steps**: Create a character, add chainmail and a dagger on the outfit step, and inspect the cart lines.
- **What happens**: The checkbox shows "Wear it" (or "Wield it"), but its accessible name is "Wear the suit of chainmail" because the visible text is `aria-hidden` and the name comes from visually hidden text. A speech-input user who says "click Wear it" reaches nothing (WCAG 2.5.3, label in name).
- **What should happen**: Keep the visible words at the start of the name, for example "Wear it: the suit of chainmail", or show "Wear the chainmail" as the visible label.
- **Screenshot**: `wizard-5-outfit-cart.png`

### R-103: The "Change" button for autosave does nothing in the lobby's saves dialog

- **Severity**: Minor
- **Owner**: referee, lobby
- **Steps**: End a game that has saves, so the table is back in its lobby. As the referee, choose "Continue from a save", then choose "Change" next to "Autosave is on".
- **What happens**: Nothing happens. `SavesDialog` calls `setSettingsOpen(true)`, but only `PlayShell` renders `TableSettingsDialog`, so no settings dialog opens in the lobby. The lobby's own "Table settings" card already has the "Save automatically" switch.
- **What should happen**: In the lobby, hide the button or have it close the dialog and move focus to the lobby's "Save automatically" switch.
- **Screenshot**: `lobby-saves-change.png`

### R-104: At phone width the lobby is wider than the screen

- **Severity**: Minor
- **Owner**: lobby, app/shell
- **Steps**: Open a lobby at a 390 px wide viewport. Read `document.documentElement.scrollWidth`.
- **What happens**: The page is 419 px wide in a 390 px viewport, so it scrolls sideways. The page header holds the logo, "Your tables" (which wraps onto two lines), the new "Rules reference" button, and the profile button, and the profile name runs off the right edge. The home page at the same width fits (390 px), and both pages fit at 600 px.
- **What should happen**: The header should fit at phone width, for example by showing the rules reference as an icon button below 480 px.
- **Screenshot**: `lobby-phone.png`

### R-105: A refused ability trade tells the player to lower a score it just said can't be lowered

- **Severity**: Polish
- **Owner**: wizard, shared text
- **Steps**: Roll for a magic-user (seed 9), choose the class, and on "Adjust scores" choose "Lower Dexterity" once.
- **What happens**: The alert reads "Dexterity can't be lowered. Only Strength, Intelligence, and Wisdom can be traded for points. Scores are lowered in steps of 2, so Dexterity can't be lowered by 1. Lower it by an even number." The last two sentences contradict the first. Every score also offers Lower and Raise buttons, although the step's own text says only Strength, Intelligence, and Wisdom can be lowered and only the prime requisite raised.
- **What should happen**: Report one reason per score: when a score can't be lowered at all, drop the step-of-2 sentence for it.
- **Screenshot**: `wizard-edge-lower-dex.png`

### R-106: The rules reference's class cards repeat the class name as the race

- **Severity**: Polish
- **Owner**: compendium
- **Steps**: Open the rules reference from the lobby and choose the Classes tab. Spec: `e2e/compendium.spec.ts`, "the rules reference opens from the home page and from the lobby" (screenshot only).
- **What happens**: Human classes show "Human" under the name, but the demihumans show "Dwarf" under "Dwarf", "Elf" under "Elf", and "Halfling" under "Halfling". The wizard's class cards were fixed to show "Demihuman" (D-104).
- **What should happen**: Show "Demihuman", as the wizard and B/X do.
- **Screenshot**: `.data/screens/e2e/compendium-lobby.png`

### R-107: The catalog still shows weights two ways

- **Severity**: Polish
- **Owner**: town, wizard
- **Steps**: Open the town's Outfitter or the wizard's outfit step and look at the Weight column.
- **What happens**: The wizard and the Outfitter now share one catalog table (most of D-107 is fixed), but gear rows still show "-" while ammunition rows show "0". "Sling stones" also costs "0 gp".
- **What should happen**: Show weights the same way for every item, for example "-" whenever the catalog lists no weight or a weight of zero.
- **Screenshot**: `town-outfitter-cart.png`, `wizard-5-outfit-cart.png`

### R-108: The wizard's starting gold keeps the coin glyph in its text

- **Severity**: Polish
- **Owner**: wizard
- **Steps**: Reach the outfit step and copy the "Starting gold" line.
- **What happens**: The coins lists in town and on the sheet now read "19 gp (gold)" (D-111 is fixed there). The wizard's starting gold still renders the coin as a "g" letter in a span (`styles.goldCoin`), hidden from assistive technology but still in the text, so copied text reads "Starting gold g180gp".
- **What should happen**: Draw the coin with CSS or an SVG, as the coins lists now do.
- **Screenshot**: `wizard-5-outfit-cart.png`

### R-109: The rejoin card tells every visitor that the table's address changed

- **Severity**: Polish
- **Owner**: lobby, app/shell
- **Steps**: As a visitor with no identity in this browser, open a table's invite link while the table has members.
- **What happens**: The "I've played at this table before" card says "The table's address changed since you last played, so this browser doesn't remember you." That is also shown to a player on a new device or after clearing the browser, when the address didn't change. The "I'm new here" card above reads "Pick the name The bell tolls sees", which puts a table name in the middle of a sentence without quotes.
- **What should happen**: State the situation without guessing the cause, such as "If this browser doesn't remember you, pick your name and a referee lets you back in." Write the other line as "Pick the name the table sees" or quote the table name.
- **Screenshot**: `rejoin-join-page.png`

### R-110: The wizard's review says a character goes out "wearing and wielding" a dagger

- **Severity**: Polish
- **Owner**: wizard
- **Steps**: Create a magic-user with only a dagger and reach the review.
- **What happens**: The review reads "You go out wearing and wielding a dagger." `ReviewStep` uses one sentence for any mix of worn and wielded items, so a weapon-only or armour-only outfit reads wrongly.
- **What should happen**: Name each part: "You go out wielding a dagger.", "You go out wearing leather armour and wielding a sword."
- **Screenshot**: `wizard-6-review.png`

### R-111: Every save in the lobby is badged "Earlier game"

- **Severity**: Polish
- **Owner**: referee
- **Steps**: In the lobby, open "Continue from a save".
- **What happens**: Each row carries an "Earlier game" badge, because no game is running and `current` compares against a missing session. In the lobby every save is from an earlier game, so the badge repeats on every row and says nothing.
- **What should happen**: Show the badge only while a game is running.
- **Screenshot**: `lobby-saves-change.png`

### R-112: Class feature names and a few sheet labels are in title case

- **Severity**: Polish
- **Owner**: wizard, sheet, shared text
- **Steps**: Open the wizard's class step, and the character sheet's Modifiers section.
- **What happens**: The class cards list "Detect Construction Tricks", "Turning the Undead", "Immunity to Ghoul Paralysis", and "Initiative Bonus (Optional Rule)". The sheet lists "Hit points per Hit Die".
- **What should happen**: Use sentence case, as the project's writing rules ask: "Detect construction tricks", "Hit points per hit die".
- **Screenshot**: `wizard-2-class.png`, `sheet-brenna.png`

### R-113: The roll step lists the qualifying classes before the dice land

- **Severity**: Polish
- **Owner**: wizard
- **Steps**: Roll ability scores without reduced motion.
- **What happens**: While the Strength dice are still tumbling and the other five scores are empty, "Classes this roll qualifies for" already shows the final list, and Continue is already enabled.
- **What should happen**: Reveal the list when the last score lands, or when the player chooses Skip.
- **Screenshot**: `wizard-1-roll-after.png`

### R-201: The map pick prompt covers the map's toolbar

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: As the referee at 1440 by 900, open the Referee tab, Quick actions, "Place the party", choose "A cell", and press "Pick a cell on the map". The same happens with "Pick a door on the map" in "Change a door".
- **What happens**: The prompt "Click the cell to place the party on." with its Cancel button sits at the top centre of the stage, on top of the "Map view options" toolbar. It hides the level switcher (only "el 1" shows to the right of Cancel) and the left edge of the map style buttons. A referee who wants to pick a cell on another level has to reach the level switcher under the prompt.
- **What should happen**: The prompt should sit clear of the toolbar, for example below it, so the level switcher stays usable during a pick.
- **Screenshot**: `.data/screens/e2e/tour-b-bell-pick-prompt.png`

### R-202: The pick prompts tell the referee to click, although the keyboard picks too

- **Severity**: Polish
- **Owner**: referee
- **Steps**: Start any map pick from the referee panel: "Pick a cell on the map" in "Place the party", or "Pick a door on the map" in "Change a door" or the command console.
- **What happens**: The prompts read "Click the cell to place the party on.", "Click the door to change.", and "Click the cell to use." The map now has a keyboard cursor for picks (arrow keys, E for the side, Enter to pick), but the prompt a sighted keyboard user reads mentions only clicking. The map's live region does explain the keys, so screen reader users hear them.
- **What should happen**: Name both ways, such as "Pick the cell to place the party on. Click it, or use the arrow keys and press Enter."
- **Spec**: `e2e/map.spec.ts`, "the referee picks a cell and a door on the map with the keyboard alone".

### R-203: The darkness overlay hides the map's focus ring while the party has no light (D-011 partly fixed)

- **Severity**: Minor
- **Owner**: explore
- **Steps**: Enter the priory without lighting a torch, which is how every game starts. Press Tab from the tool rail until the map has focus.
- **What happens**: The map has focus and its `:focus-visible` outline applies, but nothing changes on screen. The darkness layer (`.darkness::before` in `explore.module.css`, a 4800-pixel radial gradient drawn above the canvas) covers the outline at the stage's edges with 84 percent of the stage color. After Brenna lights a torch, the same Tab shows a clear orange ring.
- **What should happen**: The focus ring should show in the dark too, for example by drawing it on an element above the projected layer.
- **Screenshot**: `.data/screens/e2e/tour-b-map-focus-ring.png` (dark, no ring) and `.data/screens/e2e/tour-b-map-focus-ring-lit.png` (lit, ring shows)

### R-204: Area names are still cut off while the party has seen only one cell (D-201 still open)

- **Severity**: Polish
- **Owner**: map
- **Steps**: `e2e/explore.spec.ts`, "stairs take the party to the next level", or enter the priory without light and look at the label above the party.
- **What happens**: Without light the party knows only its own cell, and the area label squeezes into that cell's width on two lines: "Gateh… / stair" at the entrance and "Foot… / night…" at the foot of the night stair. Once a torch lights the room, the same labels show in full.
- **What should happen**: The label should show the whole name at the zoom the map opens at, even when the known part of the area is one cell wide.
- **Screenshot**: `.data/screens/e2e/explore-level-2.png`, `.data/screens/e2e/tour-b-map-focus-ring.png`

### R-205: Map labels run into the party token and into doors on The Toll at Crookback Bridge

- **Severity**: Polish
- **Owner**: map
- **Steps**: Start The Toll at Crookback Bridge, enter the bridge, light a torch, and press the right arrow twice so the party stands in the toll gate.
- **What happens**: On the player's map, "The Kingsway" and "Toll gate" are drawn on one line through the party's square, and the party token covers the "T" of "Toll gate". On the referee's map at the same moment, the toll gate's area number "2" is drawn on top of a door.
- **What should happen**: Labels and area numbers should move clear of the party token and of doors, as the map README says they do for stairs and features.
- **Screenshot**: `.data/screens/e2e/tour-b-toll-walk.png`, `.data/screens/e2e/tour-b-toll-walk-referee.png`

### R-206: During an encounter the encounter panel covers the party on the map

- **Severity**: Minor
- **Owner**: explore
- **Steps**: In The Toll at Crookback Bridge, walk east into the toll gate so the bandits' encounter starts. Look at the referee's map, then the player's.
- **What happens**: The map keeps the party at the centre of the whole stage, and the encounter panel at the bottom centre covers that point. On the referee's screen, whose panel is taller because of "Monsters and referee tools", the party token is hidden under the panel. On the player's screen the token sits on the panel's top edge.
- **What should happen**: While a bottom overlay holds the stage, the camera should keep the party in the visible part of the map above it.
- **Screenshot**: `.data/screens/e2e/tour-b-toll-walk-referee.png`, `.data/screens/e2e/tour-b-toll-walk.png`

### R-207: The folded scene bar shows two chevron buttons side by side

- **Severity**: Polish
- **Owner**: explore
- **Steps**: Stand in a corridor with a door, or wait 10 seconds in a room, so the scene panel folds to its title bar.
- **What happens**: The bar shows "1 thing here" with a down chevron, and right beside it the "Show the description" button with another down chevron. The two look like one control drawn twice, although one opens a menu of actions and the other unfolds the card.
- **What should happen**: Give the two controls different looks, for example an expand icon on the fold button, or put the count inside the bar's unfold button and the actions in a separate menu button.
- **Screenshot**: `.data/screens/e2e/scene-folded.png`

### R-208: The Pins list crowds its rows and clips the focus ring

- **Severity**: Polish
- **Owner**: explore
- **Steps**: `e2e/map.spec.ts`, "a player adds a pin from the Pins list, and the referee finds and reads it there". Open the Pins list with one pin and press Tab twice.
- **What happens**: The "Show" button sits directly against the end of the note ("The statue hides a loose step Show"), and the focused "Open" button's focus ring is cut off by the panel's right edge.
- **What should happen**: Leave a gap between the note and the buttons (or put the buttons on their own line for a long note), and keep the focus ring inside the panel's padding.
- **Screenshot**: `.data/screens/e2e/map-pins-list.png`

### R-301: The end screen's restore buttons are all named "Restore"

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: `e2e/end-screen.spec.ts`, "the end screen names each save in its restore button and its confirmation as written" (marked `fixme`). Win or lose a game as the referee and look at "Continue from a save" on the end screen.
- **What happens**: Each save row has a button named only "Restore". A screen reader user who tabs through the list hears "Restore, button" three times with no save name, and a test can reach a row's button only through the row's text. The saves dialog names the same action "Restore <save name>".
- **What should happen**: Name each button for its save, such as "Restore On the Kingsway", as the saves dialog does (a visually hidden suffix keeps the visible label short).
- **Screenshot**: `.data/screens/e2e/end-victory-referee.png`

### R-302: The restore confirmation lowercases the save's label, place names included

- **Severity**: Polish
- **Owner**: app/shell
- **Steps**: `e2e/end-screen.spec.ts`, same `fixme` test as R-301. On the end screen, the referee clicks Restore on "Autosave: Entered Crookback Bridge".
- **What happens**: The confirmation reads "Restore autosave: entered crookback bridge?". `EndScreen.tsx` calls `saveTitle(restoring).toLowerCase()`, which lowercases proper nouns ("Crookback Bridge", "Corvane's Holm", "Kingsway") and a referee's own label.
- **What should happen**: Show the label as written, for example "Restore “Autosave: Entered Crookback Bridge”?" or "Restore this save?" with the label in the description.
- **Screenshot**: `.data/screens/e2e/probe-restore-dialog.png` (taken while the dialog was still fading in)

### R-303: The victory screen leaves out the adventure's closing text

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: `e2e/end-screen.spec.ts`, "after a victory, the end screen tells how the adventure ends in its own words" (marked `fixme`). Win The Toll at Crookback Bridge (the referee can complete "Open the Kingsway") and read the end screen.
- **What happens**: The end screen says only "The party has finished the adventure." The quest's completion text, "By evening the first carts are rolling over Crookback Bridge, and the drovers cheer you all the way down to Wethercote. The reeve pays out of his own purse.", appears in the feed but not on the end screen. bxapi's `AdventureCompletedEvent` carries that text so a client can show it on a closing screen.
- **What should happen**: The victory screen should tell the ending in the adventure's own words, under the heading, from the `adventure_completed` event (or the concluding quest's completion text).
- **Screenshot**: `.data/screens/e2e/end-victory-player.png`

### R-304: A second monster group in melee is drawn at 15 feet on the range track

- **Severity**: Polish
- **Owner**: combat
- **Steps**: Climb to the captain's loft in The Toll at Crookback Bridge (Mag Corrie and her bodyguard both stand 5 feet from the party), or any battle where two groups stand at the same distance. Look at the range track.
- **What happens**: Mag Corrie sits over the 5-foot tick, and Mag's bodyguard sits between the 10-foot and 15-foot ticks, although both labels say "In melee" and the referee's roster says 5 feet for both. The fix for D-309 offsets groups at the same distance by a fixed width (`groupOffset` in `RangeTrack.tsx`), which moves the second token along the feet scale.
- **What should happen**: Groups at the same distance should share the distance's position, for example stacked vertically as the party's members are, so the track's scale stays true.
- **Screenshot**: `.data/screens/e2e/probe-loft-ref.png`, `.data/screens/e2e/smoke-captains-loft.png`

### R-306: A player who isn't the caller sees the same refusal four times in the encounter panel

- **Severity**: Polish
- **Owner**: combat
- **Steps**: `e2e/smoke.spec.ts`, the toll gate. Look at the encounter panel as Ann, who isn't the caller.
- **What happens**: Talk, Wait, Flee, and Fight each replace their explanation with "Only the caller or the referee can act for the whole party.", so the sentence fills the panel four times and the choices' explanations are gone.
- **What should happen**: State the reason once above the choices (naming the caller, such as "Sam is the caller, so Sam or the referee chooses for the party."), and keep each choice's own explanation.
- **Screenshot**: `.data/screens/e2e/smoke-toll-gate.png`

### R-407: An unavailable quick action is named "End the encounter Not now"

- **Severity**: Polish
- **Owner**: referee
- **Steps**: As a referee while the party explores with no encounter, open Quick actions and list the buttons with a screen reader.
- **What happens**: The accordion trigger's name runs the label and the badge together: "End the encounter Not now". It reads like a command, and "Not now" is also the label of the button that declines a rejoin request.
- **What should happen**: Name the trigger "End the encounter" and give the state as a description, or write the badge as "Not available now" so the name reads "End the encounter, not available now".

### R-501: The join page offers to bring a stranger back in as the referee, and its text assumes the visitor played before

- **Severity**: Minor
- **Owner**: lobby
- **Steps**: Create a table as Ruth (the only referee). Open its invite link in a new browser.
- **What happens**: Next to "I'm new here", the page shows "I've played at this table before" with a "Come back in as Ruth" button. Its text says "The table's address changed since you last played, so this browser doesn't remember you. Pick your name, and a referee at the table lets you back in." For a first-time visitor the address didn't change, and the visitor picks a member, not a name. Clicking "Come back in as Ruth" answers 409 and shows "No referee can let this member back in. A referee can't approve their own request.", and the browser logs "Failed to load resource: the server responded with a status of 409". Once players go offline, the list also offers them ("Come back in as Sam") to anyone who has the link.
- **What should happen**: Leave out a member whom nobody can approve (the table's only referee), so no button leads to a certain refusal. Word the section for someone who may or may not have played ("Played here before? Pick who you were, and a referee lets you back in."), and avoid the console error.
- **Screenshot**: `.data/screens/e2e/explore-round2-rejoin-referee-offered.png`, `.data/screens/e2e/explore-round2-rejoin-referee-refused.png`

### R-503: A run of moves renders as a broken feed group with a stray "Sam," and an entry with no name

- **Severity**: Minor
- **Owner**: feed
- **Steps**: In the dungeon, light a torch from the action bar, then press the right arrow key twice. Open the Feed tab. Later, walk back with two left arrows and choose "Return to town".
- **What happens**: The first "The party moves east." is drawn in the header position of a row, with Sam's avatar and the timestamp at its right, and the next row's header reads "Move the party" with no name. In the feed's text the groups read "S / Game time / Day 1, 00:10" with no name or command, followed by "Sam, / Move the party", with a trailing comma after the name. The same happens before "Return to town".
- **What should happen**: Every group should have one header with the sender and the command ("Sam · Move the party"), and each move should be a line inside it, as other commands are.
- **Screenshot**: `.data/screens/e2e/explore-round2-feed-move-header.png`

### R-504: The feed writes a memorized spell's name in lower case

- **Severity**: Polish
- **Owner**: shared text
- **Steps**: Rest a full day in town, then prepare Sleep for a magic-user. Read the feed.
- **What happens**: The line reads "Tamsin memorizes sleep." The sheet, the wizard, and the rules reference all write "Sleep".
- **What should happen**: "Tamsin memorizes Sleep."
- **Screenshot**: `.data/screens/e2e/explore-round2-feed-rest.png`

### R-505: A full day's rest fills the feed with 13 lines, most of which say nothing happened

- **Severity**: Polish
- **Owner**: shared text, feed
- **Steps**: In town, press "Rest a full day" with four members, three of them unhurt. Read the feed.
- **What happens**: The rest group lists eight lines such as "Brenna eats the day's food." and "Brenna drinks the day's water.", then "Osric regains no hit points.", "Tamsin regains no hit points.", and "Wren regains no hit points." The one line that matters, "Brenna regains 3 hit points.", is lost in the middle.
- **What should happen**: Summarize upkeep in one line ("The party eats and drinks the day's rations.") and leave out members who regain nothing.
- **Screenshot**: `.data/screens/e2e/explore-round2-feed-rest.png`

### R-506: "Recently in town" headlines a rest with a burnt-out torch, and its "+13 more" can't be opened

- **Severity**: Polish
- **Owner**: town
- **Steps**: Rest a full day in town (with a torch still lit from the dungeon) and look at "Recently in town" on the town square.
- **What happens**: The only row reads "Sam · The torch that Brenna carries burns out. +13 more". The rest itself ("The party rests for a full day.") isn't the summary, and "+13 more" is plain text, not a button, so nobody can see the rest.
- **What should happen**: Summarize the action ("Sam: the party rested a full day. Brenna regained 3 hit points.") and make "+13 more" open the details, or link to the feed.
- **Screenshot**: `.data/screens/e2e/explore-round2-recently-in-town.png`

### R-509: The first spell list writes ranges two ways

- **Severity**: Polish
- **Owner**: wizard
- **Steps**: Create a magic-user and reach the "First spell" section of the identity step.
- **What happens**: Most spells read "Range 120’ · One or more days", but self-only spells read "Range: the caster · 6 turns", with a colon the others lack. D-105 fixed the wording but not the punctuation.
- **What should happen**: One form for every spell, such as "Range 120’" and "Range: the caster" with the colon on both, or "On the caster".

### R-510: Each party row in the lobby has two buttons that open the same sheet

- **Severity**: Polish
- **Owner**: lobby
- **Steps**: Add characters to the party in the lobby and read a row.
- **What happens**: Every row has a "Brenna , open the character sheet" button (the whole card) and a separate scroll icon button, "Open Brenna's sheet", that does the same thing. A keyboard user tabs through both for every member.
- **What should happen**: One control per row for the sheet.
- **Screenshot**: `.data/screens/e2e/explore-round2-lobby-two-sheet-buttons.png`

### R-513: The server autosaves "before the battle" when the party only meets indifferent monsters

- **Severity**: Minor
- **Owner**: server
- **Steps**: With autosave on, walk into the toll gate of The Toll at Crookback Bridge, where four indifferent bandits wait.
- **What happens**: The feed says "The server saved the game: before the battle in Crookback Bridge, level 1." No battle has started: the encounter panel says the bandits take no interest in the party, and talking or waiting may avoid a fight.
- **What should happen**: Label the save for what happened, such as "met 4 bandits in Crookback Bridge", so a referee restoring it knows the party hasn't fought yet.

### R-514: One of Wethercote's services has no name, so its whole sentence becomes a heading

- **Severity**: Polish
- **Owner**: adventures
- **Steps**: Start The Toll at Crookback Bridge and look at "What the town offers".
- **What happens**: Three services read as a name and a line ("Hob Tanner's smithy and store" / "weapons, armour, and gear"), but the third heading is the sentence "Old Nan Colley buys gems and jewellery", with no description, because the adventure writes it without the "name: description" form.
- **What should happen**: The adventure should write it as "Old Nan Colley: buys gems and jewellery", as The Drowned Bell writes "Widow Marl, moneychanger: buys gems, jewellery, and coin".

### R-517: Waiting on indifferent monsters gives no feedback, and the panel shows an empty "What happened" box

- **Severity**: Minor
- **Owner**: combat, shared text
- **Steps**: In The Toll at Crookback Bridge, enter the counting room, where the clerk and a bandit are indifferent. As the caller, press Wait in the encounter panel, twice.
- **What happens**: The command is accepted (`wait`, revision 43 to 44), but bxapi returns no events, so the feed shows nothing and the encounter panel grows an empty "What happened" box. The caller can't tell whether the round passed.
- **What should happen**: Say what the wait did, such as "The party waits a round. The clerk and the bandit pay the party no mind.", in the panel and in the feed, and never render an empty "What happened" box.
- **Screenshot**: `.data/screens/e2e/explore-round2-wait-empty.png`

### R-518: "Pick up the dropped goods" takes nothing after the aftermath said coins were left behind

- **Severity**: Minor
- **Owner**: combat, server
- **Steps**: In The Toll at Crookback Bridge, win the bunkroom fight. The aftermath card says "Left behind: Coins worth 2 gp, now among the dropped goods here." Press "Pick up the dropped goods".
- **What happens**: A turn passes, and the feed's "Take treasure" group says "Brenna takes nothing.", "Osric takes nothing.", "Tamsin takes nothing.", "Wren takes nothing." The toast says "Brenna takes nothing." The dropped goods then vanish from the scene panel. The 2 gp may have gone into the sea chest's share, which the next "Take the treasure" split, but nothing says so.
- **What should happen**: Picking up dropped goods should take the coins the aftermath named and say so ("Brenna picks up 2 gp."). If the goods merged into the room's treasure, the aftermath shouldn't offer two buttons.
- **Note**: In The Drowned Bell's guardroom, where the room has no treasure of its own, the same button worked ("Brenna takes 2 gp in coin." and so on), so the failure seems to need a room that also holds a treasure cache.
- **Screenshot**: `.data/screens/e2e/explore-round2-pickup-nothing.png`

### R-519: The referee's wandering monster table shows one row per die face

- **Severity**: Polish
- **Owner**: referee
- **Steps**: Enter Crookback Bridge and open the Referee tab's "Here and now".
- **What happens**: The "Crookback Bridge" table has 20 rows: "1 Bandits on their rounds 1d4" through "6 Bandits on their rounds 1d4", then three rows of giant bats, and so on. The referee scrolls through repeated rows to read a table the adventure writes as six ranges.
- **What should happen**: One row per entry with its range, such as "1 to 6", "Bandits on their rounds", "1d4".
- **Screenshot**: `.data/screens/e2e/explore-round2-referee-wandering-rows.png`

### R-520: The new prepare dialog closes when bxapi refuses, and lets a player pick more copies than slots

- **Severity**: Minor
- **Owner**: sheet
- **Steps**: After commit 6acad72, open a magic-user's Spells tab with nothing memorized and press "Prepare spells" in the new prompt. The dialog opens with one copy of Sleep already chosen ("Slots used: 1 of 1"). Press "More copies of Sleep", then "Prepare spells".
- **What happens**: "More copies of Sleep" stays enabled at 1 of 1, so the count goes to 2. On "Prepare spells" the dialog closes, and the refusal appears behind it on the sheet: "This caster has 1 slot for level 1 spells, but 2 were chosen." Before this commit the refusal stayed inside the dialog, where the player could fix the count.
- **What should happen**: Keep the dialog open with the refusal in it, and disable "More copies" when every slot of that level is used (the dialog already shows "Slots used: 1 of 1").
- **Screenshot**: `.data/screens/e2e/explore-round2-prepare-refused-closed.png`

### R-521: Slain monsters "wake up" in the feed

- **Severity**: Polish
- **Owner**: shared text, server
- **Steps**: Put three bandits to sleep with Sleep, kill them while they sleep, and read the feed. The same happens with the two goblins in The Drowned Bell's guardroom.
- **What happens**: After "A bandit is slain." three times, the referee sees "The sleep effect on a bandit ends early. A bandit wakes up." three times. The players see the "wakes up" lines too: Tess's feed reads "A goblin is slain. A goblin is slain. The fallen leave behind 7 gp in coin. A goblin wakes up. A goblin wakes up." (`.data/screens/e2e/explore-round2-820-feed.png`).
- **What should happen**: Leave out the wake-up lines for a dead monster, or word them as the effect ending ("The sleep on the slain bandits ends.").

### R-522: The temple names a dead member's button "Osric Dead Dead"

- **Severity**: Polish
- **Owner**: town
- **Steps**: With a dead member, open the town's Temple tab and read the "Who is treated" buttons.
- **What happens**: The dead member's button is named "Osric Dead Dead", while the others read "Brenna 6 of 6 hp". The same tab also offers "Buy cure light wounds for Osric" and four other services that can't help a dead member, each with an enabled Buy button, and a "Temple cleric's level (optional)" field that only a referee would know how to fill.
- **What should happen**: "Osric, dead". For a dead member, show raise dead first and explain that the other services need a living patient.
- **Screenshot**: `.data/screens/e2e/explore-round2-temple-dead.png`

### R-523: A single monster is written as plural and as "×1"

- **Severity**: Polish
- **Owner**: combat
- **Steps**: Fight the ink-stained clerk and the bandit in the counting room.
- **What happens**: The encounter panel lists "Ink-stained clerk ×1" and "Bandit ×1". After the clerk dies, the battlefield's description reads "The ink-stained clerks, slain", plural for one clerk.
- **What should happen**: Show a count only above one, and use the singular for one slain monster ("The ink-stained clerk, slain").

### R-524: A long aftermath title pushes the Close button onto its own line, and a room label sits outside its room

- **Severity**: Polish
- **Owner**: combat, map
- **Steps**: Win the counting room fight in The Toll at Crookback Bridge.
- **What happens**: The aftermath title "The ink-stained clerk and the bandit are beaten" plus the "2 rounds" badge fill the header, so "Close" drops to a second line under the title. On the map behind it, the "Counting room" label is drawn on the bridge corridor below the room, not inside it.
- **What should happen**: Keep Close at the top right and let the title wrap beside it, and place the label inside its area.
- **Screenshot**: `.data/screens/e2e/explore-round2-aftermath-title-wrap.png`

### R-525: The bridge deck is called "A corridor"

- **Severity**: Polish
- **Owner**: explore, adventures
- **Steps**: In The Toll at Crookback Bridge, walk east from the toll gate onto the bridge.
- **What happens**: The scene panel's title is "A corridor" for the open deck of a bridge over a gorge.
- **What should happen**: An unkeyed cell should take a neutral name ("Between rooms" or "On the way"), or the adventure should key the deck ("Crookback Bridge deck").
- **Screenshot**: `.data/screens/e2e/explore-round2-bridge-corridor.png`

### R-526: The action bar keeps offering "Attack" while the composer has Cast selected

- **Severity**: Polish
- **Owner**: combat
- **Steps**: In a battle, open a magic-user's "More choices" and choose the Cast tab and a spell.
- **What happens**: The composer shows Cast and Sleep, but the action bar at the bottom still reads "Tamsin: Attack the bandits" with the shortcut A, so pressing A declares an attack, not the spell the player is looking at.
- **What should happen**: While the composer is open, the action bar should follow it, or step aside.
- **Screenshot**: `.data/screens/e2e/explore-round2-actionbar-vs-composer.png`

### R-527: Placing the party in a keyed area skips its encounter and triggers without saying so

- **Severity**: Minor
- **Owner**: referee
- **Steps**: In The Drowned Bell, open the Referee tab, then Quick actions, "Place the party", "An area", and choose "Drain Folk warren". Place the party.
- **What happens**: The scene panel says "The party enters the Drain Folk warren." and describes kobolds watching with their spears held low, but no encounter starts. The area's trigger doesn't fire either: the kobolds' journal line never appears, and the hidden objective "Learn where the brothers hid the Hand", which the warren should reveal, stays hidden. The feed says only "The party is placed in the priory on Corvane's Holm, level 1." The form's help text says only "The party lands on the cell nearest the middle of the area."
- **What should happen**: The form should say what placing skips ("Placing the party doesn't start the area's monsters or fire its triggers. Walk in to start them."), or offer to run the area's arrival. The feed should name the area the party lands in.
- **Screenshot**: `.data/screens/e2e/explore-round2-place-no-trigger.png`

### R-528: The victory screen lists a quest from the table's previous adventure

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: Play The Toll at Crookback Bridge to its end, return the table to its lobby, start The Drowned Bell, and reach its victory screen (I used the referee's "Complete a quest" on "Silence the drowned bell").
- **What happens**: "Quests completed" reads "Open the Kingsway and Silence the drowned bell". "Open the Kingsway" belongs to The Toll at Crookback Bridge. `useCompletedQuests` in `EndScreen.tsx` collects every `quest_completed` event in the table's feed, from every session, and only from the part of the feed that has loaded.
- **What should happen**: Count only the quests of the session that ended, for example by filtering on `session_id` or by reading the quests from the game view.
- **Screenshot**: `.data/screens/e2e/explore-round2-victory-wrong-quest.png`

### R-529: After a total party kill, the referee can still complete the quest that ends the adventure

- **Severity**: Minor
- **Owner**: referee, server
- **Steps**: Lose every member in The Toll at Crookback Bridge. On the end screen, open the Referee tab, then "Every referee command", "Complete a quest", choose "Open the Kingsway", and press "Complete quest".
- **What happens**: The command succeeds. The panel shows "Quest complete: Open the Kingsway. By evening the first carts are rolling over Crookback Bridge, and the drovers cheer you all the way down to Wethercote.", while the end screen above still reads "The party has fallen" and now lists "Quests completed: Open the Kingsway".
- **What should happen**: Once the game is over, list commands that change the story as "Not now", as the panel already does for "End the encounter", and point the referee at restoring a save.
- **Screenshot**: `.data/screens/e2e/explore-round2-quest-after-tpk.png`

### R-530: Returning to the lobby quietly resets every character to how it was created

- **Severity**: Minor
- **Owner**: lobby
- **Steps**: Finish a game (here, a total party kill after the party earned 77 to 81 XP each and some coins), press "Return the table to its lobby", and open Brenna's sheet in the lobby.
- **What happens**: Brenna is alive with 0 of 2,000 XP and her starting purse. The lobby still lists the four characters, ready to start again, and the dialog only said "The game ends and the saves stay." Nothing tells the players that the XP, treasure, and deaths of the last game stay with that game.
- **What should happen**: Say it where the players see it, for example in the return dialog and on the lobby's party card ("Characters start each new game as they were created. To keep playing these versions, continue from a save.").
- **Screenshot**: `.data/screens/e2e/explore-round2-lobby-reset-xp.png`

### R-531: A level up only appears as a feed line

- **Severity**: Polish
- **Owner**: feed, sheet
- **Steps**: As the referee, award 2,600 XP to every living member at level 1.
- **What happens**: All four members reach level 2. Players see only a "4" badge on the Feed tab and, in the party panel, "Level 2" in place of "Level 1". There is no toast or highlight on the member, and the sheet doesn't point out a new spell slot for the magic-user.
- **What should happen**: A short notice, such as a toast "Tamsin reaches level 2 and gains 2 hit points. Tamsin has a new spell slot.", for the owner of each member.
- **Screenshot**: `.data/screens/e2e/explore-round2-level-up-silent.png`

### R-532: Small wording slips in the referee panel, the readiness card, and the end screen

- **Severity**: Polish
- **Owner**: referee, town, app/shell
- **Steps**: Read the Toll's quest in the Referee tab's "Quests, flags, and triggers", the Bell's town readiness card with an unprepared caster, the referee command forms, and the end screen.
- **What happens**:
  - The strongbox objective reads "Done when: A member gains a miller Aske's strongbox." and the portcullis objective "The flag set when the party enters East gatehouse is set to “raised”."
  - The readiness card's spell line reads "Spells to prepare: nobody has it yet", a phrase built for items.
  - Every referee command form has a "Source" field, "A note about who or what issued the command.", a bxapi field that a referee has no use for.
  - The end screen writes "2730 XP", while the feed writes "2,730 experience points".
  - The battle composer's summary for Sleep, in its "One creature" form, reads "A single creature with 4+1 Hit Dice (see Hit point modifiers).", a reference to text the composer doesn't show, and the composer's button reads "Cast sleep".
- **What should happen**: "Done when: a member picks up Miller Aske's strongbox.", "Done when: the party enters the east gatehouse.", "Spells to prepare: Tamsin has none memorized", no Source field (or one under an "Advanced" toggle), "2,730 XP", no dangling reference, and "Cast Sleep".

## Fixed

These defects were fixed in the working tree and confirmed by a passing test or, where the entry had no test, by exploratory play. A defect fixed in part names the open entry that carries the rest.

- D-001: The Party panel warns about darkness while the party is in town.
- D-002: The profile button's accessible name doesn't match its visible text.
- D-003: The "Hooks" heading in the adventure picker fails color contrast.
- D-004: Action bar buttons leave their shortcut key out of their accessible name.
- D-005: Marching order rows have a name that leaves out what they show.
- D-006: Outfitter item buttons are named "Details for …" while they show the item and its summary.
- D-007: The dungeon map renders an empty tooltip with no accessible name.
- D-008: The journal's scrolling body can't be reached from the keyboard.
- D-009: The saves dialog's list contains elements other than list items.
- D-010: The "Dead" badge on the end screen fails color contrast.
- D-011: The dungeon map shows no focus ring when it has keyboard focus. Fixed in part; the rest is R-203.
- D-012: The battle board's round number disagrees with the top bar.
- D-013: The end screen adds a second level-one heading.
- D-014: The built client is a single 1.7 MB script that includes the design-system gallery.
- D-015: The same "no light" state is described two ways, and the Party panel's version also shows outside the dungeon.
- D-016: The encounter panel and the action bar offer the same four choices with different labels.
- D-017: The character sheet shows an empty "Referee only" box.
- D-018: Scrolling a long feed blocks the main thread for 50 to 80 ms per step.
- D-019: The character sheet repeats the name and formats the class line oddly. Fixed in part; the rest is R-101.
- D-020: An action clicked while another command is on its way, or just after a run of moves, is dropped without a word.
- D-101: Armour and weapons picked one by one in the wizard start unworn, and the review never shows armour class.
- D-102: The wizard's roll step says the same thing twice.
- D-103: Wizard controls have long or repeated accessible names. Fixed in part; the rest is R-102.
- D-104: Demihuman class cards repeat the race as "Demihuman: dwarf".
- D-105: The first spell list shows durations that point at missing text.
- D-106: The wizard's review lists every coin denomination, even at zero.
- D-107: The wizard's shop and the town's Outfitter are two different shops for the same job. Fixed in part; the rest is R-107.
- D-108: The temple writes the same price two ways.
- D-109: The rest options repeat their length, and the turn option gives a dungeon rule in town.
- D-110: The town shows the game clock twice.
- D-111: Coin amounts read with a stray letter for screen readers and in copied text. Fixed in part; the rest is R-108.
- D-201: Area names on the map are cut off with an ellipsis at the default zoom. Fixed in part; the rest is R-204.
- D-202: The minimap draws the unexplored level as a flat light-blue block.
- D-203: The scene panel announces areas without an article.
- D-204: The map's screen reader description says the arrow keys pan the map, while they move the party.
- D-205: Pins, drawings, and pings exist only on the canvas, so keyboard and screen reader users can't reach them.
- D-206: The ruler's measurement is never stated in text.
- D-207: The party's light is described two different ways at once.
- D-208: The autosave notice capitalizes "The" in the middle of a sentence.
- D-209: The referee map's wandering-monster chip says "level table".
- D-210: A player's game log names the dungeon by its ID, while the town and the referee use its name.
- D-211: A feature marker on the player's map covers an area name.
- D-301: A thrown dagger is described as shooting.
- D-302: A refused battle declaration doesn't say whose declaration it is.
- D-303: Popovers are dialogs without an accessible name.
- D-304: The feed entry for talking doesn't say who spoke, and the encounter's opening lines contradict each other.
- D-305: A member's choices open on the Attack tab when every attack is out of reach.
- D-306: The same fallen member is "Down" on the battle board and "Dead" in the Party panel.
- D-307: The after-fight summary is titled "Victory", the same word as winning the adventure.
- D-308: The pile of dropped treasure has three names.
- D-309: Party tokens overlap the "Party line" label on the battle track. Fixed, but the fix caused R-304.
- D-310: The battle composer requests rules entries that don't exist, and the browser logs 404 errors.
- D-311: The referee's "They came to terms" dialog nests block elements inside a paragraph.
- D-312: Mag Corrie appears as "veteran" in the fight that the quest names her for.
- D-401: The referee panel shows raw feature IDs, flag keys, and cell coordinates.
- D-402: Picking a cell or a door on the map needs a mouse.
- D-403: Every save row's restore button is named "Restore". Fixed in part; the rest is R-301.
- D-404: Dungeon names starting with "The" are capitalized in the middle of sentences.
- D-405: The pin dialog says everyone sees the pin while "Only referees see this pin" is checked.
- R-401: "Stop waiting" leaves the request waiting, so a referee can let in a visitor who left.
- R-402: Two players on one network can't ask to come back in at the same time.
- R-403: A browser opened after a rejoin says the server forgot the user, and offers to make a duplicate.
- R-404: One failed poll ends the wait on the page while the request still waits on the server.
- R-405: The "signed in from another browser" screen offers a name field that isn't there.
- R-502: A new magic-user can't cast in the first fight, and nothing says why.

## Notes that aren't defects

- bxapi has no command that grants a gem or a piece of jewellery, so the referee's grant tool can only give items and coins. The town spec gets treasure by having the referee place the party in The Drowned Bell's chapel and take the altar's candlesticks. If the referee should be able to hand out treasure, bxapi needs a `grant_valuable` command first.
- The Toll at Crookback Bridge is very hard for a party of four first-level characters with 2 to 6 hit points each: exploratory play ended in two total party kills in Mag Corrie's loft. That is B/X working as intended, but a referee running it as a first game should know.
