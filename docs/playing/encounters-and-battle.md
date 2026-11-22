---
title: Encounters and battle
description: Parley, evade, or fight monsters in encounters, declare simultaneous round actions in battle, and review combat playback.
sidebar_position: 4
---

# Encounters and battle

When the party meets monsters in a room or corridor, the mode switches to **Encounter**. If a fight breaks out, the mode switches to **Battle**.

## Respond to an encounter

The encounter panel displays the monster groups, their distance in feet, any surprise or pursuit status, and their initial reaction (**Attacking**, **Hostile**, **Uncertain**, **Indifferent**, or **Friendly**).

The caller chooses how the party responds:

- **Talk** (`T`): Attempt parley to shift the monsters' reaction. Selecting **Talk** in the panel lets you choose which character speaks; pressing `T` or clicking **Talk** on the action bar uses the member with the highest reaction bonus. If conversation settles the encounter peacefully, the referee concludes it from the referee panel.
- **Wait** (`W`, or **Keep running** during pursuit): Spend a round holding position while the monsters act on their disposition.
- **Flee** (`Shift+F`): Attempt to evade before combat begins. Selecting **Flee** in the panel offers **Just run**, **Scatter coins**, or **Drop food** to distract pursuing monsters.
- **Fight** (`F`, or **Turn and fight** during pursuit): Engage and start a battle round.
- **Turn undead**: Available in the encounter panel when a cleric (or other turning class) confronts undead.

Individual players can also **Use an item**, **Give items**, or **Drop items** (`Drop bait` during pursuit) from the encounter panel before the caller commits the party.

## Declare actions in battle

B/X battles resolve simultaneously round by round. A range track at the top of the battle board shows the distance from the party line to each monster group, while the declaration list below tracks every character who can act this round. Party members see one another's declarations in real time so the group can coordinate targets, spells, and movement.

![Battle board showing round playback above party action declarations](../images/battle.webp)

### Use smart quick actions or full choices

1. Locate your characters in the declaration list. Each undeclared character row offers a suggested quick action tailored to their rank, equipment, and class (press `A` to trigger it for your next character):
   - **Already in melee:** Attacks the engaged monster group with the character's wielded weapon (for example, **Attack the goblins with a sword**).
   - **Ranged weapon in range:** Shoots or throws at the nearest group in range (for example, **Shoot at the goblins with a shortbow**).
   - **Caster with memorized spells:** **Choose a spell**, which opens that character's **Cast** tab.
   - **Armoured non-caster front-rank fighter:** Closes in and attacks (such as **Attack the goblins with a sword, closing in** or **Close in on the goblins**).
   - **Back-rank or unarmoured characters without a ranged attack or spell:** Defaults to **Hold** so a quick keypress never sends unarmoured characters or casters charging into melee.
2. For any other tactic, select **More choices** (or press `1` through `9` for your first through ninth character) to open the action composer:
   - **Attack:** Pick a target group, switch weapons, or enable **Back-stab** on a surprise free round for thieves.
   - **Cast:** Choose a memorized spell and aim at monster groups, specific individual monsters (such as `Goblin 2`), or party allies.
   - **Move:** Choose **Close in** on a monster group, **Fighting withdrawal** (step back out of melee defensively), **Retreat** (flee melee at full speed), or **Trade places** with another party member between ranks.
   - **Item:** Drink a potion, read a scroll, throw oil or holy water, or activate a magic item.
   - **Give**, **Turn undead**, and **Hold**.
   - When facing a monster with a petrifying gaze, a **Guard against the gaze** selector lets you choose **No guard**, **Avert eyes**, or **Watch in a mirror**.
3. With **Resolve battle rounds automatically** enabled (the default), submitting the final character's declaration resolves the round immediately. While at least one character has yet to declare (or whenever automatic resolution is turned off), select **Change** to revise a character's declaration or click the clear button (`X`) to remove it.
4. Starting in round 2, select **Same as last round for all** (`Shift+A`) to repeat your previous declarations for every eligible character you control, or click the repeat icon on a single character's row.

## Resolve the round and watch playback

With **Resolve battle rounds automatically** enabled (the default), `bxapi` resolves the round the moment the final character declares. If automatic resolution is turned off, the caller or referee selects **Resolve the round** (`Ctrl+Enter`, or `Cmd+Enter` on macOS). A referee can also select **Resolve now** to resolve early, assigning **Hold** to any character without a declaration.

If `bxapi` refuses a declaration under the B/X rules (for example, casting a spell with the wrong number of targets or attacking out of reach), the round does not advance: the board flags the character whose declaration was refused and explains why so that player can pick a valid action.

Once accepted, `bxapi` rolls initiative, movement, attacks, damage, saving throws, spells, and morale checks, and the battle board plays the round back one beat at a time:

- The playback strip narrates each roll and synchronizes hit points and conditions with the current beat.
- Click the strip or press `Esc` (**Skip the playback**) to jump straight to the end of the round, or select **Replay** afterward to watch it again.
- Enter declarations for the next round at any time, even while playback is still running.

## Aftermath and end of the game

When a fight concludes and play returns to exploration, an aftermath summary card (titled, for example, **The goblins are beaten** or **The party got away**) lists defeated monsters, experience earned, fallen party members, and items left behind:

- Select **Pick up the dropped goods** or **Take the treasure** directly on the card to collect floor loot or untrapped caches. (Under standard B/X rules, earned XP is awarded when survivors return to town.)
- Select **Replay the last round** to rewatch the decisive round, or **Close** (`Esc`) to dismiss the card.

If the party completes an adventure's concluding quest, the **Victory** screen displays the closing narrative, total game time, completed quests, and final party roster. If every party member dies, **The party has fallen** (`Game over`) appears instead. On either end screen, the referee can restore a recent save to continue playing or select **Return the table to its lobby** to start fresh.
