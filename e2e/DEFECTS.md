# Defects found by the end-to-end suite

This report lists the product defects that are open after the third and final pass of the end-to-end suite and of exploratory play, by owner and severity, with a full entry for each. Every defect fixed in the three passes is listed by title in "Fixed" at the end. Each open entry gives the steps, or the spec that shows it, what happens, what should happen, and a screenshot under `.data/screens/e2e/` when one helps (that folder is ignored by Git, so run the spec to regenerate it).

A test that fails because of an open defect is marked `test.fixme` with the entry's ID in a comment, so the suite passes. After you fix a defect, remove the `fixme` from the tests that name its ID and run them.

Severity:

- **Blocker**: The table can't play past this point.
- **Major**: A feature is broken or misleading, or a player sees referee data, but the table can work around it.
- **Minor**: Something works incorrectly or confusingly in a way players notice.
- **Polish**: Wording, layout, or consistency.

IDs that start with `D-` come from the first pass, `R-` from the second, and `F-` from the final pass.

## Status

On 2026-11-22, at commit `f91b0f1`, 16 defects are open: 0 blockers, 0 majors, 7 minors, and 9 polish. Every open entry was found or confirmed on the final round's tree. The suite passes in development mode and against the production build, with the `fixme` tests that name F-001, F-002, and F-103.

## Open defects by owner

An entry with more than one owner is listed under each.

### adventures

- F-102 (Polish): The feed says "Osric takes a miller Aske's strongbox"

### app/shell

- F-003 (Minor): A full bxapi is reported as busy, with advice to wait
- F-104 (Minor): After the referee restores a save, the end screen leaves out quests completed before the save
- F-201 (Polish): The lobby and the end screen still put a stray space before a comma
- F-202 (Polish): The end screen writes game time in engine units and dates saves with a raw timestamp

### combat

- F-207 (Minor): The one-click battle action sends the back rank into melee
- F-208 (Minor): Seven gold pieces split three ways pay 6, and the seventh disappears without a word
- F-101 (Polish): Range track labels collide when a monster group carries a condition line
- F-103 (Polish): Waiting on indifferent monsters still leaves no line in the feed (the rest of R-517)
- F-206 (Polish): The battle composer's Sleep summary still points at text it doesn't show

### feed

- F-103 (Polish): Waiting on indifferent monsters still leaves no line in the feed (the rest of R-517)

### lobby

- F-201 (Polish): The lobby and the end screen still put a stray space before a comma

### map

- F-203 (Polish): An unkeyed cell is "On the way" in the scene panel, but "a corridor" to the keyboard cursor and the referee
- R-205 (Polish): Map labels run into the party token and into doors on The Toll at Crookback Bridge

### referee

- F-203 (Polish): An unkeyed cell is "On the way" in the scene panel, but "a corridor" to the keyboard cursor and the referee

### server

- F-003 (Minor): A full bxapi is reported as busy, with advice to wait
- F-208 (Minor): Seven gold pieces split three ways pay 6, and the seventh disappears without a word

### shared text

- F-204 (Minor): The feed says a member gains the whole award when bxapi caps it at one level
- F-102 (Polish): The feed says "Osric takes a miller Aske's strongbox"
- F-206 (Polish): The battle composer's Sleep summary still points at text it doesn't show

### sheet

- F-001 (Minor): Marching order rows are named with only part of what they show

### town

- F-002 (Minor): The town's member chooser buttons fail axe's label-in-name check
- F-205 (Polish): Town tokens wear a color from the name, not the owner's color

## Open defect entries

### R-205: Map labels run into the party token and into doors on The Toll at Crookback Bridge

- **Severity**: Polish
- **Status**: Possibly fixed. On the final tree the referee's map draws the toll gate's number clear of the door, but nobody checked the player's map in the toll gate with a torch lit.
- **Owner**: map
- **Steps**: Start The Toll at Crookback Bridge, enter the bridge, light a torch, and press the right arrow twice so the party stands in the toll gate.
- **What happens**: On the player's map, "The Kingsway" and "Toll gate" are drawn on one line through the party's square, and the party token covers the "T" of "Toll gate". On the referee's map at the same moment, the toll gate's area number "2" is drawn on top of a door.
- **What should happen**: Labels and area numbers should move clear of the party token and of doors, as the map README says they do for stairs and features.
- **Screenshot**: `.data/screens/e2e/tour-b-toll-walk.png`, `.data/screens/e2e/tour-b-toll-walk-referee.png`

### F-001: Marching order rows are named with only part of what they show

- **Severity**: Minor
- **Owner**: sheet
- **Steps**: `e2e/a11y.spec.ts`, "exploring, player and referee", "encounter", "battle", "game over", and "rejoining: the visitor waits, and the referee sees the request" (marked `fixme`). Open the Party tab on any play screen.
- **What happens**: axe reports `label-content-name-mismatch` (serious) on every marching order row. The final round's fix for R-101 names each row with `aria-labelledby` pointing at three spans, so the name is "Brenna You Level 1 fighter", but the row also shows its place number, the player's avatar initial, the hit points ("10/10"), and the armour class ("4"). Round two's version passed axe because the name began with the visible text. This regresses D-005.
- **What should happen**: The name should contain the row's visible text in order, for example by labelling the row with all its visible spans (hiding the avatar initial and the place number from the accessibility tree) and moving the long description to `aria-describedby`.
- **Screenshot**: `.data/screens/e2e/a11y-exploring-player.png`

### F-002: The town's member chooser buttons fail axe's label-in-name check

- **Severity**: Minor
- **Owner**: town
- **Steps**: `e2e/a11y.spec.ts`, "town, every part of town" (marked `fixme`). Open the Outfitter, the Temple, or the Treasure buyers tab.
- **What happens**: axe reports `label-content-name-mismatch` (serious) on each member button in the "who" chooser, such as `aria-label="Wren, 5 of 5 hp"` and `aria-label="Wren, 74 gp"`, and on the chosen marker (`._chosen`). The visible text reads "Wren" and "5 of 5 hp" on two lines.
- **What should happen**: Drop the `aria-label` and let the button take its name from its visible text, or include every visible word in it, so the name and the label agree.
- **Screenshot**: `.data/screens/e2e/a11y-town-temple.png`

### F-003: A full bxapi is reported as busy, with advice to wait

- **Severity**: Minor
- **Owner**: server, app/shell
- **Steps**: Let bxapi reach its storage limit (`/v1/meta` reports `used_bytes` at `max_bytes`), then create a character in the wizard or start a game from the lobby. During this pass the shared development bxapi filled up at about 04:06, and the agents saw this on the wizard's create step and on every table setup that creates characters or starts a game.
- **What happens**: bxapi answers 507 `storage_full`, and bxvtt shows "bxapi is busy (storage_full). Try again in a moment." Waiting never helps, because the storage stays full until someone frees space or raises the limit, and the raw code `storage_full` shows in the main interface.
- **What should happen**: Say what happened and who can fix it, for example "The rules server is out of storage, so it can't save anything new. Ask the person who runs this table to free space or raise the limit." Leave out the raw code.

### F-101: Range track labels collide when a monster group carries a condition line

- **Severity**: Polish
- **Owner**: combat
- **Steps**: `e2e/smoke.spec.ts`, the captain's loft. Wren puts Mag Corrie to sleep, and the party beats her and her bodyguard. Look at the aftermath card's range track, and at the battle board while Mag sleeps and her bodyguard still stands.
- **What happens**: Mag Corrie's label grows a third line, "1 asleep". In the aftermath card, whose track is narrow, that line is drawn on top of the "Party line" caption, and the party's tokens crowd against Mag's token. On the battle board, in a run where both groups stood at the same distance, the bodyguard's token, stacked below Mag's by the R-304 fix, covered Mag's "In melee" and "1 asleep" lines.
- **What should happen**: Stack groups at the same distance with room for every line of each label, and keep the condition line clear of the "Party line" caption.
- **Screenshot**: `.data/screens/e2e/smoke-captains-loft-won.png` (aftermath card, bottom centre)

### F-102: The feed says "Osric takes a miller Aske's strongbox"

- **Severity**: Polish
- **Owner**: shared text (or adventures, by renaming the item)
- **Steps**: `e2e/smoke.spec.ts`, the captain's loft. Take the treasure and read the feed.
- **What happens**: The take-treasure group reads "Brenna takes a silver brooch and 74 gp in coin. Osric takes a miller Aske's strongbox and 73 gp in coin." The item text lowercases the first letter of "Miller Aske's strongbox" and puts "a" in front of a possessive proper name. This is the line that completes the table's first side quest.
- **What should happen**: "Osric takes Miller Aske's strongbox and 73 gp in coin." An item whose name starts with a proper name or a possessive keeps its capital and takes no article (the noun's `proper` or `noArticle` flag), or the adventure renames it, for example "the miller's strongbox".
- **Screenshot**: none. The line is in the feed after the smoke test's "the party takes the captain's chest" step.

### F-103: Waiting on indifferent monsters still leaves no line in the feed (the rest of R-517)

- **Severity**: Polish
- **Owner**: feed, combat
- **Steps**: `e2e/combat.spec.ts`, "the feed says that the party waited a round (F-103)" (marked `fixme`). Bring a party into the counting room of The Toll at Crookback Bridge, where the clerk and his bandit are indifferent, and press Wait as the caller.
- **What happens**: The encounter panel now says "The party waits a round. The ink-stained clerk and the bandit pay the party no mind." for the caller and the other player, which fixes the panel half of R-517. The feed shows nothing for the wait, not even a "Sam Wait" heading, so anyone who reads the feed later can't tell that rounds passed.
- **What should happen**: A wait appears in the feed with the same sentence the panel shows.
- **Screenshot**: `.data/screens/e2e/combat-wait-indifferent.png` (panel)

### F-104: After the referee restores a save, the end screen leaves out quests completed before the save

- **Severity**: Minor
- **Owner**: app/shell
- **Steps**: In The Toll at Crookback Bridge, complete "Miller Aske's strongbox" (I used the referee command), save by hand, then complete "Open the Kingsway". The victory screen lists both quests. Restore the hand save from the end screen and complete "Open the Kingsway" again.
- **What happens**: The second victory screen lists only "Open the Kingsway". The fix for R-528 counts `quest_completed` entries whose `session_id` matches the current session, and a restore moves the table to a new bxapi session, so the strongbox quest, completed in the earlier session before the save, no longer counts. A referee who restores after a total party kill and then wins sees fewer quests than the party completed.
- **What should happen**: Count the quests completed in the game the save continues, for example from the saved game's quest state, or by following each restored session back to the session it was saved from.
- **Screenshot**: none (checked with a throwaway probe spec; the steps above repeat it).

### F-201: The lobby and the end screen still put a stray space before a comma

- **Severity**: Polish
- **Owner**: lobby, app/shell
- **Steps**: Read the accessibility tree of a lobby with characters in the party, and of the end screen after a game ends.
- **What happens**: R-101 is fixed where it was reported (the profile button reads "Sam, your profile", the catalog reads "Chainmail, Armour class 5, show details"), but the same pattern remains elsewhere. The lobby's party rows read "Level 1 fighter , played by Sam", the start card reads "0 characters , Standard rules", and the end screen reads "Level 1 fighter , 0 XP" and "Day 2, 10:20 , saved 11/22/2026, 4:25:50 AM". A screen reader pauses at the wrong place, and copied text keeps the space.
- **What should happen**: Put each comma in the same text node as the word before it, as the R-101 fix did for the profile button.
- **Screenshot**: `.data/screens/e2e/round3-g-p3-00-lobby-ready.aria.txt`, `.data/screens/e2e/round3-g-p12-01-end-ruth.aria.txt`

### F-202: The end screen writes game time in engine units and dates saves with a raw timestamp

- **Severity**: Polish
- **Owner**: app/shell
- **Steps**: Lose a game of The Drowned Bell on the second day (here, a total party kill at Day 2, 10:20) and read the end screen.
- **What happens**: "Game time" reads "1 day, 62 turns, and 1 round, ending at Day 2, 10:20". "62 turns" is 10 hours and 20 minutes, which nobody at the table counts in turns. Each save under "Continue from a save" is dated "11/22/2026, 4:25:50 AM", with seconds, while the saves dialog dates the same saves "4 minutes ago". The XP column is written `{member.xp} XP` in `EndScreen.tsx`, so a large total reads "2730 XP" while the feed writes "2,730 experience points" (the R-532 item, still open).
- **What should happen**: "1 day, 10 hours, and 20 minutes", the saves dialog's relative dates (or a date without seconds), and "2,730 XP".
- **Screenshot**: `.data/screens/e2e/round3-g-p12-01-end-ruth.png`

### F-203: An unkeyed cell is "On the way" in the scene panel, but "a corridor" to the keyboard cursor and the referee

- **Severity**: Polish
- **Owner**: map, referee
- **Steps**: Read `apps/web/src/map/cursor.ts` line 107, `features/referee/sections/QuickActions.tsx` line 375, and `features/referee/sections/HereNow.tsx` line 172. In the interface, pick a cell outside any area with "Place the party" and "A cell".
- **What happens**: The R-525 fix titles the scene panel "On the way", but the map's keyboard cursor still announces such a cell as "A corridor", the referee's pick reads "Level 1, a corridor", and "Here and now" says "The party stands in a corridor, outside any keyed area." On The Toll at Crookback Bridge a screen reader user still hears the bridge deck called a corridor. I confirmed this in the source; I didn't hear the cursor's announcement on the bridge.
- **What should happen**: One neutral name everywhere, such as "On the way" or "Between areas".

### F-204: The feed says a member gains the whole award when bxapi caps it at one level

- **Severity**: Minor
- **Owner**: shared text
- **Steps**: In town, as the referee, award 2,600 XP to each member of a first-level party (Brenna, Wren, Osric, Tamsin), then read the feed and the game view.
- **What happens**: The feed says "Wren gains 2,600 experience points." and "Wren reaches level 2", but Wren's XP is 2,399: one award raises a character at most one level, so bxapi stopped her one point short of level 3 and dropped the rest. The text uses `modified_award`, which bxapi documents as the amount before that cap.
- **What should happen**: Say what the member kept, such as "Wren gains 2,399 experience points. One award raises a character only one level, so the rest is lost." The view's XP before and after gives the number.
- **Screenshot**: `.data/screens/e2e/round3-g-chk-R531-feed.png`

### F-205: Town tokens wear a color from the name, not the owner's color

- **Severity**: Polish
- **Owner**: town
- **Steps**: Start a game where Sam (orange) plays Brenna and Ann (yellow) plays Tamsin and Osric. Compare the town square's "Purses and players" with the Party panel.
- **What happens**: The Party panel, the lobby, and the battle board ring each token in its owner's color. The town square's tokens get colors from `TokenPortrait`'s default, because `MemberToken` in `features/town/parts.tsx` passes no color: Brenna is green, Tamsin orange, Osric blue. Tamsin wears Sam's orange although Ann plays her.
- **What should happen**: Pass the owner's color, as the Party panel does.
- **Screenshot**: `.data/screens/e2e/round3-g-p3-01-town-sam.png`

### F-206: The battle composer's Sleep summary still points at text it doesn't show

- **Severity**: Polish
- **Owner**: combat, shared text
- **Steps**: In a battle, open a magic-user's "More choices", choose Cast, then Sleep.
- **What happens**: The button now reads "Cast Sleep" (part of R-532 is fixed), but the summary still reads "240’ · 4d4 turns · A single creature with 4+1 Hit Dice (see Hit point modifiers)." The composer also opens on "One creature", whose Cast button stays disabled until a target is picked, so a new player facing two goblins first sees a disabled button.
- **What should happen**: Drop the dangling reference, and open on the form that fits the encounter, or say why the button is disabled next to it (the reason is only in its title tooltip, "Choose a target first.").
- **Screenshot**: `.data/screens/e2e/round3-g-p8-01-cast-tab.png`

### F-207: The one-click battle action sends the back rank into melee

- **Severity**: Minor
- **Owner**: combat
- **Steps**: In The Drowned Bell, walk into the dorter (four hostile goblins, 50 feet away) with Brenna (fighter), Tamsin (magic-user, 3 hit points), and Osric (cleric, 3 hit points), choose Fight, and press each member's main button.
- **What happens**: The main button for every member is "Attack the goblins, closing in" (or "Close in on the goblins"), and the action bar offers the same with A. Pressing it for each member moved all three into melee in round 1. The goblins killed Osric and Tamsin in round 1 and Brenna in round 2. In the guardroom, at 30 feet, Tamsin's main button was a thrown dagger instead. A first-time player who takes the highlighted choice walks the magic-user into the front line.
- **What should happen**: bxapi decides what is legal, but the main suggestion is the client's choice. For a member outside the front rank, suggest a missile attack, a spell, or holding, and keep "close in" under "More choices".
- **Screenshot**: `.data/screens/e2e/round3-g-p11-end-sam.png`

### F-208: Seven gold pieces split three ways pay 6, and the seventh disappears without a word

- **Severity**: Minor
- **Owner**: combat, server
- **Steps**: Beat the two goblins in The Drowned Bell's guardroom. The feed says "The fallen leave behind 7 gp in coin." Press "Pick up the dropped goods".
- **What happens**: "Brenna takes 2 gp in coin. Tamsin takes 2 gp in coin. Osric takes 2 gp in coin." The dropped goods vanish from the scene, and nobody gets the seventh gold piece. This is the same family as R-518.
- **What should happen**: Give the remainder to someone (the first member in marching order, for example) or say where it went.
- **Screenshot**: `.data/screens/e2e/round3-g-p9-01-picked-up.png`

## Fixed

These defects were fixed and confirmed by a passing test or, where the entry had no test, by exploratory play or the source. A defect fixed in part names the open entry that carries the rest.

- D-001: The Party panel warns about darkness while the party is in town.
- D-002: The profile button's accessible name doesn't match its visible text.
- D-003: The "Hooks" heading in the adventure picker fails color contrast.
- D-004: Action bar buttons leave their shortcut key out of their accessible name.
- D-005: Marching order rows have a name that leaves out what they show. Fixed in the second pass, then regressed in the final round; see F-001.
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
- R-524: A long aftermath title pushes the Close button onto its own line, and a room label sits outside its room.
- R-525: The bridge deck is called "A corridor". Fixed in part; the rest is F-203.
- R-526: The action bar keeps offering "Attack" while the composer has Cast selected.
- R-527: Placing the party in a keyed area skips its encounter and triggers without saying so.
- R-528: The victory screen lists a quest from the table's previous adventure. Fixed in part; the rest is F-104.
- R-529: After a total party kill, the referee can still complete the quest that ends the adventure.
- R-530: Returning to the lobby quietly resets every character to how it was created.
- R-531: A level up only appears as a feed line.
- R-532: Small wording slips in the referee panel, the readiness card, and the end screen. Fixed in part; the rest is F-202 and F-206.

## Notes that aren't defects

- bxapi has no command that grants a gem or a piece of jewellery, so the referee's grant tool can only give items and coins. The town spec gets treasure by having the referee place the party in The Drowned Bell's chapel and take the altar's candlesticks. If the referee should be able to hand out treasure, bxapi needs a `grant_valuable` command first.
- First-level parties die easily in both sample adventures, as B/X intends. In the final pass, a first-time table that followed the battle board's highlighted action died in The Drowned Bell's dorter (see F-207), and talking at the toll gate can turn the bandits hostile, depending on the dice.
- On 2026-11-22 the shared development bxapi filled its 1 GiB storage limit after three passes of test runs, and every request that stored something failed until it was restarted on a fresh database. `scripts/dev-bxapi.sh` now turns the limit off. F-003 covers the message bxvtt showed.
