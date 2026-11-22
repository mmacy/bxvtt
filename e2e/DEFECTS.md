# Defects found by the end-to-end suite

Product defects uncovered by the Playwright end-to-end suite are tracked below, with full reproduction details for open entries and a summary list of resolved entries at the bottom. Open entries record reproduction steps (or the spec file), actual behavior, expected behavior, and optional screenshot paths under `.data/screens/e2e/` (git-ignored; rerun the spec to regenerate).

Mark any test blocked by an open product defect with `test.fixme` referencing the defect ID in a comment, then remove `fixme` and rerun the spec once fixed.

Severity levels:

- **Blocker**: Play cannot continue past this point.
- **Major**: A feature is broken or misleading, or a player receives referee data, though a workaround exists.
- **Minor**: Behavior is wrong or confusing in a way players notice.
- **Polish**: Wording, layout, or screen-reader presentation issue.

ID prefixes denote the test pass that logged the issue (`D-` first pass, `R-` second, `F-` third, `L-` latest).

## Status

As of 2026-11-22 (commit `2923b75`), 3 defects remain open: 0 blockers, 0 majors, 0 minors, and 3 polish items. Two of them (`R-205` and `F-101`) might already be resolved by recent layout fixes, pending manual visual verification. All specs pass in both development and production modes with zero `test.fixme` annotations.

## Open defects by owner

### combat

- F-101 (Polish): Range track labels collide when a monster group displays a condition line

### map

- R-205 (Polish): Map labels overlap the party token and doors on *The Toll at Crookback Bridge*

### sheet

- L-001 (Polish): Each marching order row's details are read twice by a screen reader

## Open defect entries

### R-205: Map labels overlap the party token and doors on *The Toll at Crookback Bridge*

- **Severity**: Polish
- **Status**: Possibly fixed. On the latest tree, the referee map renders the toll gate's area number clear of the door, but the player map in the toll gate with a lit torch has not been visually rechecked.
- **Owner**: map
- **Steps**: Start *The Toll at Crookback Bridge*, enter the bridge, light a torch, and press the right arrow twice so the party stands in the toll gate.
- **What happens**: On the player map, "The Kingsway" and "Toll gate" render on one line through the party's square so the party token covers the "T" of "Toll gate". On the referee map at the same moment, area number "2" renders on top of a door.
- **What should happen**: Area labels and numbers should shift clear of the party token and doors, matching how they avoid stairs and features.
- **Screenshot**: `.data/screens/e2e/tour-b-toll-walk.png`, `.data/screens/e2e/tour-b-toll-walk-referee.png`

### F-101: Range track labels collide when a monster group displays a condition line

- **Severity**: Polish
- **Status**: Possibly fixed. Stacked groups now reserve vertical room for multi-line labels, and the captain's loft fight in `e2e/smoke.spec.ts` renders Mag Corrie and her bodyguard without overlap when awake; the asleep condition-line case remains unverified.
- **Owner**: combat
- **Steps**: In `e2e/smoke.spec.ts` (captain's loft), have Wren put Mag Corrie to sleep while her bodyguard remains standing, then inspect both the active battle board and the aftermath card's range track.
- **What happens**: Adding the third label line ("1 asleep") causes the narrow aftermath range track to overlap the "Party line" caption and crowd party tokens against Mag's token; on the battle board, the stacked bodyguard token previously overlapped Mag's "In melee" and "1 asleep" lines.
- **What should happen**: Stacked monster groups at the same distance should allocate space for every label line and stay clear of the "Party line" caption.
- **Screenshot**: `.data/screens/e2e/smoke-captains-loft-won.png` (aftermath card, bottom center)

### L-001: Each marching order row's details are read twice by a screen reader

- **Severity**: Polish
- **Owner**: sheet
- **Steps**: Open the **Party** tab and read the marching order in screen-reader browse mode, or inspect the list's accessibility tree.
- **What happens**: Each row names its button after the character and points `aria-describedby` at a visually hidden element inside the same list item. Because that element remains exposed in the accessibility tree, browse mode reads "You, level 1 fighter, 10 of 10 hit points, armour class 4. Opens the character sheet." on the list item and then repeats the same description on the "Brenna" button.
- **What should happen**: Screen readers should announce the description once (for example, by adding `aria-hidden="true"` to the description element, which `aria-describedby` still reads).

## Fixed

These defects were fixed and confirmed by a passing test or, where the entry had no test, by exploratory play or the source. A defect fixed in part names the open entry that tracks the remainder.

- D-001: The Party panel warns about darkness while the party is in town.
- D-002: The profile button's accessible name doesn't match its visible text.
- D-003: The "Hooks" heading in the adventure picker fails color contrast.
- D-004: Action bar buttons leave their shortcut key out of their accessible name.
- D-005: Marching order rows have a name that leaves out what they show. Fixed in the second pass, regressed in the third, and fixed again with F-001.
- D-006: Outfitter item buttons are named "Details for …" while they show the item and its summary.
- D-007: The dungeon map renders an empty tooltip with no accessible name.
- D-008: The journal's scrolling body can't be reached from the keyboard.
- D-009: The saves dialog's list contains elements other than list items.
- D-010: The "Dead" badge on the end screen fails color contrast.
- D-011: The dungeon map shows no focus ring when it has keyboard focus.
- D-012: The battle board's round number disagrees with the top bar.
- D-013: The end screen adds a second level-one heading.
- D-014: The built client is a single 1.7 MB script that includes the design-system gallery.
- D-015: The same "no light" state is described two ways, and the Party panel's version also shows outside the dungeon.
- D-016: The encounter panel and the action bar offer the same four choices with different labels.
- D-017: The character sheet shows an empty "Referee only" box.
- D-018: Scrolling a long feed blocks the main thread for 50 to 80 ms per step.
- D-019: The character sheet repeats the name and formats the class line oddly.
- D-020: An action clicked while another command is on its way, or just after a run of moves, is dropped without a word.
- D-101: Armour and weapons picked one by one in the wizard start unworn, and the review never shows armour class.
- D-102: The wizard's roll step says the same thing twice.
- D-103: Wizard controls have long or repeated accessible names.
- D-104: Demihuman class cards repeat the race as "Demihuman: dwarf".
- D-105: The first spell list shows durations that point at missing text.
- D-106: The wizard's review lists every coin denomination, even at zero.
- D-107: The wizard's shop and the town's Outfitter are two different shops for the same job.
- D-108: The temple writes the same price two ways.
- D-109: The rest options repeat their length, and the turn option gives a dungeon rule in town.
- D-110: The town shows the game clock twice.
- D-111: Coin amounts read with a stray letter for screen readers and in copied text.
- D-201: Area names on the map are cut off with an ellipsis at the default zoom.
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
- D-309: Party tokens overlap the "Party line" label on the battle track.
- D-310: The battle composer requests rules entries that don't exist, and the browser logs 404 errors.
- D-311: The referee's "They came to terms" dialog nests block elements inside a paragraph.
- D-312: Mag Corrie appears as "veteran" in the fight that the quest names her for.
- D-401: The referee panel shows raw feature IDs, flag keys, and cell coordinates.
- D-402: Picking a cell or a door on the map needs a mouse.
- D-403: Every save row's restore button is named "Restore".
- D-404: Dungeon names starting with "The" are capitalized in the middle of sentences.
- D-405: The pin dialog says everyone sees the pin while "Only referees see this pin" is checked.
- R-401: "Stop waiting" leaves the request waiting, so a referee can let in a visitor who left.
- R-402: Two players on one network can't ask to come back in at the same time.
- R-403: A browser opened after a rejoin says the server forgot the user, and offers to make a duplicate.
- R-404: One failed poll ends the wait on the page while the request still waits on the server.
- R-405: The "signed in from another browser" screen offers a name field that isn't there.
- R-502: A new magic-user can't cast in the first fight, and nothing says why.
- R-002: The darkest user color is unreadable as a name in the feed.
- R-003: The production server sends scripts and styles uncompressed.
- R-004: The play screen takes about four times longer to become usable since the bundle was split.
- R-101: Accessible names built from separate elements have a stray space before a comma. Fixed in part; the rest is F-201.
- R-102: The wizard's "Wear it" and "Wield it" checkboxes have names that leave out their visible label.
- R-103: The "Change" button for autosave does nothing in the lobby's saves dialog.
- R-104: At phone width the lobby is wider than the screen.
- R-105: A refused ability trade tells the player to lower a score it just said can't be lowered.
- R-106: The rules reference's class cards repeat the class name as the race.
- R-107: The catalog still shows weights two ways.
- R-108: The wizard's starting gold keeps the coin glyph in its text.
- R-109: The rejoin card tells every visitor that the table's address changed.
- R-110: The wizard's review says a character goes out "wearing and wielding" a dagger.
- R-111: Every save in the lobby is badged "Earlier game".
- R-112: Class feature names and a few sheet labels are in title case.
- R-113: The roll step lists the qualifying classes before the dice land.
- R-201: The map pick prompt covers the map's toolbar.
- R-202: The pick prompts tell the referee to click, although the keyboard picks too.
- R-203: The darkness overlay hides the map's focus ring while the party has no light (D-011 partly fixed).
- R-204: Area names are still cut off while the party has seen only one cell (D-201 still open).
- R-206: During an encounter the encounter panel covers the party on the map.
- R-207: The folded scene bar shows two chevron buttons side by side.
- R-208: The Pins list crowds its rows and clips the focus ring.
- R-301: The end screen's restore buttons are all named "Restore".
- R-302: The restore confirmation lowercases the save's label, place names included.
- R-303: The victory screen leaves out the adventure's closing text.
- R-304: A second monster group in melee is drawn at 15 feet on the range track.
- R-306: A player who isn't the caller sees the same refusal four times in the encounter panel.
- R-407: An unavailable quick action is named "End the encounter Not now".
- R-501: The join page offers to bring a stranger back in as the referee, and its text assumes the visitor played before.
- R-503: A run of moves renders as a broken feed group with a stray "Sam," and an entry with no name.
- R-504: The feed writes a memorized spell's name in lower case.
- R-505: A full day's rest fills the feed with 13 lines, most of which say nothing happened.
- R-506: "Recently in town" headlines a rest with a burnt-out torch, and its "+13 more" can't be opened.
- R-509: The first spell list writes ranges two ways.
- R-510: Each party row in the lobby has two buttons that open the same sheet.
- R-513: The server autosaves "before the battle" when the party only meets indifferent monsters.
- R-514: One of Wethercote's services has no name, so its whole sentence becomes a heading.
- R-517: Waiting on indifferent monsters gives no feedback, and the panel shows an empty "What happened" box. Fixed in part; the rest is F-103.
- R-518: "Pick up the dropped goods" takes nothing after the aftermath said coins were left behind.
- R-519: The referee's wandering monster table shows one row per die face.
- R-520: The new prepare dialog closes when bxapi refuses, and lets a player pick more copies than slots.
- R-521: Slain monsters "wake up" in the feed.
- R-522: The temple names a dead member's button "Osric Dead Dead".
- R-523: A single monster is written as plural and as "×1".
- R-524: A long aftermath title pushes the Close button onto a separate line, and a room label sits outside its room.
- R-525: The bridge deck is called "A corridor". Fixed in part; the rest is F-203.
- R-526: The action bar keeps offering "Attack" while the composer has Cast selected.
- R-527: Placing the party in a keyed area skips its encounter and triggers without saying so.
- R-528: The victory screen lists a quest from the table's previous adventure. Fixed in part; the rest is F-104.
- R-529: After a total party kill, the referee can still complete the quest that ends the adventure.
- R-530: Returning to the lobby quietly resets every character to how it was created.
- R-531: A level up only appears as a feed line.
- R-532: Small wording slips in the referee panel, the readiness card, and the end screen. Fixed in part; the rest is F-202 and F-206.
- F-001: Marching order rows are named with only part of what they show.
- F-002: The town's member chooser buttons fail axe's label-in-name check.
- F-003: A full bxapi is reported as busy, with advice to wait.
- F-102: The feed says "Osric takes a miller Aske's strongbox".
- F-103: Waiting on indifferent monsters still leaves no line in the feed (the rest of R-517).
- F-104: After the referee restores a save, the end screen leaves out quests completed before the save.
- F-201: The lobby and the end screen still put a stray space before a comma.
- F-202: The end screen writes game time in engine units and dates saves with a raw timestamp.
- F-203: An unkeyed cell is "On the way" in the scene panel, but "a corridor" to the keyboard cursor and the referee.
- F-204: The feed says a member gains the whole award when bxapi caps it at one level.
- F-205: Town tokens wear a color from the name, not the owner's color.
- F-206: The battle composer's Sleep summary still points at text it doesn't show.
- F-207: The one-click battle action sends the back rank into melee.
- F-208: Seven gold pieces split three ways pay 6, and the seventh disappears without a word.

## Notes that aren't defects

- bxapi has no command that grants a gem or a piece of jewellery, so the referee's grant tool can only give items and coins. The town spec gets treasure by having the referee place the party in The Drowned Bell's chapel and take the altar's candlesticks. If the referee should be able to hand out treasure, bxapi needs a `grant_valuable` command first.
- First-level parties die quickly in both sample adventures, as B/X intends. Talking at the toll gate can turn the bandits hostile, depending on the dice. Since F-207 was fixed, the battle board's highlighted choice keeps back-rank members out of melee, so a newcomer who follows it no longer walks the casters into a fight.
- On 2026-11-22 the shared development bxapi filled its 1 GiB storage limit after three passes of test runs, and every request that stored something failed until it was restarted on a fresh database. `scripts/dev-bxapi.sh` now turns the limit off. F-003 covers the message bxvtt showed.
