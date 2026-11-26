---
title: Set up a table and lobby
sidebar_label: Lobby and setup
description: Create a table, manage invites and returning players, choose an adventure and the table's rules, and assign seats and the caller.
sidebar_position: 1
---

# Set up a table and lobby

As the referee, you create the table, invite players, select the adventure and the table's rules, organize the party's marching order and seats, and launch or restore the game.

## Create a table

1. Open bxvtt in your browser and enter your display name if prompted. If you are sharing the server through `npm run share`, open [http://127.0.0.1:8660](http://127.0.0.1:8660) rather than the temporary tunnel URL so your referee sign-in persists across sessions.
2. Under **Create a table**, enter a **Table name**. If your server requires a **Host key**, enter it in the field below the name.
3. Select **Create table**.

You enter the lobby as the table's referee. The server requires at least one referee per table at all times.

## Invite players and manage members

- **Share the invite link:** In **Invite players**, select **Copy** and send the link to your group (see [Play over the internet](../getting-started/share-online.md) when hosting remotely). Every member at the table can view the invite code, so treat it as group-visible. If a link leaks, select **Replace invite link** and confirm to invalidate the previous code immediately. Current members keep their places.
- **Change roles or remove members:** In **People at the table**, open **Actions for** any member to choose **Make referee**, **Make player** (disabled when only one referee remains), or **Remove from table**. Removing a member disconnects them immediately and rotates the invite code so the old link cannot be reused. Manage removals in the lobby between games, because the play screen has no member removal menu.
- **Approve returning players:** When a player opens your invite link from a new quick-tunnel URL or a different browser and chooses **I've played at this table before**, a banner appears at the top of your lobby or play screen: **Someone asked to rejoin as** followed by that member's name. Confirm with the player over voice or chat, then select **Approve** (or **Decline**). A referee can never approve a rejoin request for their personal account; if you might switch browsers, promote a co-referee beforehand.

## Leave or delete a table

Open the **Table menu** in the lobby header or in the play screen's top bar to leave or delete the table. Every member sees **Leave table**, and only referees see **Delete table**.

- **Delete table:** Deletes the table for everyone, with its saved games, chat, notes, and uploaded adventures. You can't recover them, but every member keeps their characters. Members who have the table open return to their table list, which tells them that a referee deleted the table.
- **Leave table:** Takes you off the table and your characters out of the party. If you're the only referee and other members remain, you can't leave until you make another member a referee in **People at the table** (in the lobby, so return to the lobby first during play). If you're the last member, leaving also deletes the table, and the dialog says so before you confirm.

Each person can be the referee of up to 50 tables that they created. When you reach the limit, delete a table you no longer use to make room. A table that you hand to another referee and leave stops counting toward your limit.

## Choose an adventure

Under **Adventure** (visible only to referees until play starts), choose which module to run:

- **The Drowned Bell** (`Sample`, selected by default): For 3-6 characters of level 1 across three dungeon levels.
- **The Toll at Crookback Bridge** (`Sample`): For 4-6 characters of levels 1-2, playable in about an hour.
- **The Barrow of the Forgotten King** (`Built-in`): Barrow adventure that comes with `bxapi`.

Selecting an adventure card expands its **Hooks** so you can read the setup to your players while they roll characters. To run your own module, select **Upload an adventure** and pick an `osrlib` JSON file up to 8 MB; `bxapi` validates the file before you select **Upload**. Players read each treasure's description as soon as the party sees it, so check that your own adventure's treasure descriptions name no contents and no traps. See [Included and custom adventures](../adventures/included-adventures.md).

## Choose the table's rules

Each table stores one set of rules. You set them before players create characters, because the rules decide how each player rolls a character, and again before you start a game, because they also decide how the game plays. Every member can read them, and only a referee can change them.

Expand **Rules** in the lobby, or open **Table settings** in the **Table menu** and select the **Rules** tab. The panel starts with **Starting rules**, then **Optional rules**, **House rules**, and **Rules for play**. Each change takes effect for everyone at once.

### Start from a set of rules

**Starting rules** has two choices:

- **Standard B/X:** The rules of the SRD, with **Hit die reroll** turned on.
- **Creation house rules:** **Standard B/X** with **4d6 drop lowest** and **Maximum hit points** turned on.

Choosing one sets every switch in the panel to match it, then lets you change any switch on its own. **Starting rules** doesn't change **Ability score rerolls**. When the switches match neither choice, **Starting rules** shows **Custom**, and choosing a starting ruleset first asks you to confirm, because it discards your changes. A new table starts with **Standard B/X**, as do tables that existed before the rules were stored.

### Optional rules from the SRD

The SRD has two optional rules for creating a character, and both are switches under **Optional rules**.

- **Hit die reroll (on by default):** The SRD says: "If your roll for hit points comes up 1 or 2 (before applying any CON modifier), the referee may allow you to re-roll. This is in order to increase the survivability of 1st level PCs." With the rule on, a first-level character rolls the hit die again whenever it comes up 1 or 2. The hit points step of the wizard shows the dice that were set aside.
- **Sub-par characters (off by default):** The SRD says: "If you roll a character with very poor ability scores - for example an 8 or less in every score or an extremely low rating in more than one ability - the referee may allow you to discard the character and start again." With the rule on, a player whose roll `bxapi` finds sub-par sees a **Sub-par** badge and a **Start again** button, which rolls new scores without using one of the player's rerolls. `bxapi` decides what counts as sub-par, so you don't judge the scores.

### House rules

**House rules** change character creation in ways the SRD doesn't describe.

- **4d6 drop lowest (off by default):** Each ability score is the total of the highest three of four d6, instead of 3d6. The wizard shows all four dice and marks the one that doesn't count.
- **Ability score rerolls (0 by default):** How many times each player can roll new ability scores for one character. A player's first roll is free, and each later roll uses one reroll. Enter a whole number from 0 to 99, or check **Unlimited**. At 0, the wizard offers no **Roll again** button, and the player keeps the first roll. Creating a character starts the count again for the next character, and a player can't make a character from an older roll once they roll again. A change to the number takes effect when you leave the field or press Enter.
- **Maximum hit points (off by default):** A first-level character starts with the highest number on the hit die instead of rolling it. The wizard's hit points step shows **Maximum hit points** and a **Take the maximum** button.

### When a change takes effect

A player's roll keeps the rules in effect when the player made it: how the scores were rolled, the hit die rules, and whether sub-par characters may start again. A change you make doesn't alter a character that a player has started, and players who roll after your change get the new rules. The exception is **Ability score rerolls**, which the server checks against the number you've set at the moment the player rolls again.

During a game, the **Rules for play** section says "Changes apply to the next new game", because a game keeps the rules it started with.

### Rules for play

These switches decide how the game plays, and the game starts with the table's current values. **Start game** names the table's rules as **Standard B/X**, **Creation house rules**, or **Custom rules**.

| Rule | Default | Effect |
| --- | --- | --- |
| **Encumbrance** | **Basic** | **Basic**: worn armour and heavy treasure slow a character down. **None**: carried weight never slows a character down. **Detailed**: the total weight of a character's armour, gear, and treasure sets their movement rate. |
| **Experience awards** | **On return to town** | **On return to town**: characters receive experience when the party returns to town alive, as B/X states. **Right away**: characters receive experience as soon as they earn it, which suits an adventure with no trip back to town. |
| **Variable weapon damage** | On | Weapons roll their listed damage dice. Turn it off and every weapon rolls 1d6. |
| **Individual initiative** | Off | Every combatant rolls their own initiative, instead of one roll for each side. |
| **THAC0 arithmetic** | Off | The roll to hit is THAC0 minus the target's armour class, instead of the number in the attack matrix. |
| **Weapon reload** | Off | Crossbows and other slow-loading weapons must spend a round reloading between shots. |
| **Big monsters** | Off | Monsters with 5 hit dice or more can hurt creatures that only silver or magic weapons harm. |
| **Magic item saves** | On | When a breath weapon or another destructive effect kills a character, each of their magic items makes a saving throw to survive. |
| **Hunger and thirst** | Off | A character without food or water takes penalties to attacks, movement, and rest, and eventually loses hit points. |
| **Friendly fire** | On | An area spell cast at monsters in melee also hits the party members fighting them. |
| **Passage width** | On | The width of a passage limits how many combatants can fight side by side. |
| **Failed trap removal** | On | A thief who fails to remove a treasure trap springs it. |
| **Back-stab from hiding** | On | A hiding thief's back-stab needs both the hide in shadows and the move silently roll to succeed, instead of either one. |

### Check characters from other tables

A player can bring a character that was built at another table, or before the table stored its rules. You decide whether to accept it, and bxvtt never refuses one. On each card in **Party**, you see at most one badge:

- **Different rules:** The character was rolled at this table under rules that differ from the table's now. Hover or focus the badge to read each rule that differs, such as "Ability score rerolls: Unlimited".
- **Other table:** The character's ability scores were rolled at another table. The badge turns to a warning when that table's rules differ from yours, and its tooltip lists the differences.
- **Rules unknown:** The server recorded no rules for the character, because it was created before the table settings existed.

A card with no badge was rolled at this table under the table's current rules. To keep a character out, remove it from the party with its remove button. Players don't see these badges.

## Configure table settings, seats, and the caller

Open **Table settings** in the lobby (or select **Table settings** in the **Table menu** at any point during play, where it is the **Table** tab) to control table flow:

- **Who moves the party:** **The caller** (default, matching B/X procedure) or **Anyone with a character** (convenient for small or informal groups).
- **Caller:** Pick a specific member or leave it **Not chosen** (when a game starts with no caller chosen, the owner of the first character in marching order becomes the caller automatically).
- **Resolve rounds automatically:** On by default. Resolves each round as soon as every eligible character has declared and the game checks that every action will work. If an action won't work, the round waits for that player to choose a different action. Turn off to have the caller or a referee trigger resolution manually.
- **Save automatically:** On by default. Retains the 10 most recent autosaves across major transitions.

When you start a game, bxvtt assigns each character's seat to the member who created that character, and you control any character whose seat is empty. During play, select **Seats and caller** in the **Table menu** to change the caller or reassign any character's seat (including **Empty seat (referee controls)**).

## Start a new game or continue from a save

1. Arrange the **Party** list into your group's starting marching order by dragging rows or clicking the forward and back buttons.
2. Read the notes under **Start game** in the side column. Blocking notes (such as no characters in the party or no adventure chosen) keep the button unavailable, and warnings (such as an online player without a character) let you start anyway. 
3. Choose how to enter play:
   - **Start a brand-new run (`Start game`):** Begins the selected adventure with every roster character in their initial level-1 state as created.
   - **Resume an ongoing campaign (`Continue from a save`):** Shown whenever the table has saves from earlier sessions. Restores a saved session with all earned XP, treasure, spells, deaths, and dungeon progress intact (choose this rather than **Start game** when continuing a multi-session campaign).
