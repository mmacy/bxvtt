---
title: Set up a table and lobby
sidebar_label: Lobby and setup
description: Create a table, manage invites and returning players, choose an adventure and optional B/X rules, and assign seats and the caller.
sidebar_position: 1
---

# Set up a table and lobby

As the referee, you create the table, invite players, select the adventure and optional rules, organize the party's marching order and seats, and launch or restore the game.

## Create a table

1. Open bxvtt in your browser and enter your display name if prompted. If you are sharing the server through `npm run share`, open [http://127.0.0.1:8660](http://127.0.0.1:8660) rather than the temporary tunnel URL so your referee sign-in persists across sessions.
2. Under **Create a table**, enter a **Table name**. If your server requires a **Host key**, enter it in the field below the name.
3. Select **Create table**.

You enter the lobby as the table's referee. The server requires at least one referee per table at all times.

## Invite players and manage members

- **Share the invite link:** In **Invite players**, select **Copy** and send the link to your group (see [Play over the internet](../getting-started/share-online.md) when hosting remotely). Every member at the table can view the invite code, so treat it as group-visible. If a link leaks, select **Make a new link** to invalidate the previous code immediately.
- **Change roles or remove members:** In **People at the table**, open **Actions for** any member to choose **Make a referee**, **Make a player** (disabled when only one referee remains), or **Remove from the table**. Removing a member disconnects them immediately and rotates the invite code so the old link cannot be reused. Manage removals in the lobby between games, because the play screen has no member removal menu.
- **Approve returning players:** When a player opens your invite link from a new quick-tunnel URL or a different browser and chooses **I've played at this table before**, a banner appears at the top of your lobby or play screen: **Someone is asking to come back in as** followed by that member's name. Confirm with the player over voice or chat, then select **Let them in** (or **Not now** to decline). A referee can never approve a rejoin request for their personal account; if you might switch browsers, promote a co-referee beforehand.

## Leave or delete a table

Open the **Table menu** in the lobby header or in the play screen's top bar to leave or delete the table. Every member sees **Leave table**, and only referees see **Delete table**.

- **Delete table:** Deletes the table for everyone, with its saved games, chat, notes, and uploaded adventures. You can't recover them, but every member keeps their characters. Members who have the table open return to their table list, which tells them that a referee deleted the table.
- **Leave table:** Takes you off the table and your characters out of the party. If you're the only referee and other members remain, you can't leave until you make another member a referee in **People at the table** (in the lobby, so return to the lobby first during play). If you're the last member, leaving also deletes the table, and the dialog says so before you confirm.

Each person can be the referee of up to 50 tables that they created. When you reach the limit, delete a table you no longer use to make room. A table that you hand to another referee and leave stops counting toward your limit.

## Choose an adventure

Under **Adventure** (visible only to referees until play starts), choose which module to run:

- **The Drowned Bell** (`Sample`, selected by default): For 3-6 characters of level 1 across three dungeon levels.
- **The Toll at Crookback Bridge** (`Sample`): For 4-6 characters of levels 1-2, playable in about an hour.
- **The Barrow of the Forgotten King** (`Comes with bxapi`): Built-in barrow adventure included with `bxapi`.

Selecting an adventure card expands its **Hooks** so you can read the setup to your players while they roll characters. To run your own module, select **Upload an adventure** and pick an `osrlib` JSON file up to 8 MB; `bxapi` validates the file before you select **Upload**. Players read each treasure cache's `description` as soon as the party sees the cache, so check that your own adventure's cache descriptions name no contents and no traps. See [Included and custom adventures](../adventures/included-adventures.md).

## Choose optional rules

Expand **Optional rules** before starting a new game (and decide **Reroll low first-level hit points** before players roll characters, since players must check the matching box in Step 2 of the character wizard). Select **Use the standard rules** at any time to reset everything to the defaults below.

| Rule | Default | Effect |
| --- | --- | --- |
| **Encumbrance** | **Basic** | **Basic** slows characters based on worn armour and heavy treasure; **None** sets everyone's movement rate to 120 feet per turn; **Detailed** sums the coin weight of all armour, gear, and treasure. |
| **Experience awards** | **On returning to town** | Awards earned XP when survivors reach town, or choose **As soon as it is earned** for dungeon-only play. |
| **Variable weapon damage** | On | Weapons roll their listed damage dice (`1d8`, `1d4`, and so on). Turn off so all weapons deal `1d6`. |
| **Individual initiative** | Off | Each combatant rolls individual initiative instead of side-based initiative. |
| **THAC0 arithmetic** | Off | Resolves attacks with `THAC0 - AC` instead of the B/X attack matrix. |
| **Weapon reload** | Off | Crossbows and other slow-loading weapons cannot fire two rounds in a row. |
| **Big monsters count as magical** | Off | Monsters of 5 Hit Dice or more can harm creatures susceptible only to silver or magic weapons. |
| **Saving throws for magic items** | On | Equipped or packed magic items roll saving throws to survive when a breath weapon or similar effect kills their bearer. |
| **Hunger and thirst penalties** | Off | Going without rations or water penalizes attack rolls, then movement, and then hit points. |
| **Area spells catch allies** | On | Area spells such as *fireball* aimed at monsters engaged in melee can also strike allied front-liners. |
| **Passage width limits melee** | On | Caps how many combatants can fight abreast in narrow passages (two side by side in a 10-foot corridor). |
| **A failed trap removal springs the trap** | On | A thief who fails to disarm a treasure trap triggers it. |
| **Reroll low first-level hit points** | Off | Rerolls a `1` or `2` on a character's first-level hit die. Tell players before they create characters so they check the matching box in the character wizard. |

## Configure table settings, seats, and the caller

Open **Table settings** in the lobby (or select **Table settings** in the **Table menu** at any point during play) to control table flow:

- **Who moves the party:** **The caller** (default, matching B/X procedure) or **Anyone with a character** (convenient for small or informal groups).
- **Caller:** Pick a specific member or leave **No caller** (when a game starts with **No caller**, the owner of the first character in marching order becomes the caller automatically).
- **Resolve battle rounds automatically:** On by default. Resolves each round as soon as every eligible character has declared and the rules engine's preview shows that it would accept every declaration. If a declaration would be refused, the round waits for that player to choose another action. Turn off to have the caller or a referee trigger resolution manually.
- **Save automatically:** On by default. Retains the 10 most recent autosaves across major transitions.

When you start a game, bxvtt assigns each character's seat to the member who created that character, and you control any character whose seat is empty. During play, select **Seats and caller** in the **Table menu** to change the caller or reassign any character's seat (including **Empty seat (the referee plays)**).

## Start a new game or continue from a save

1. Arrange the **Party** list into your group's starting marching order by dragging rows or clicking the forward and back buttons.
2. Check **Start the game** in the side column for any non-blocking warnings (such as party size outside the adventure's recommendation or an online player without a character).
3. Choose how to enter play:
   - **Start a brand-new run (`Start the game`):** Begins the selected adventure with every roster character in their initial level-1 state as created.
   - **Resume an ongoing campaign (`Continue from a save`):** Shown whenever the table has saves from earlier sessions. Restores a saved session with all earned XP, treasure, spells, deaths, and dungeon progress intact (choose this rather than **Start the game** when continuing a multi-session campaign).
