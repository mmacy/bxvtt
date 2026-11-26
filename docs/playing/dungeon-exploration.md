---
title: Explore the dungeon
description: Read the dungeon map, manage light, move the party, handle doors and traps, and collaborate with map tools.
sidebar_position: 3
---

# Explore the dungeon

Once the party enters a dungeon, the central stage displays the explored map in **Exploring** mode. Each grid square measures 10 feet across, and the map reveals only cells and doors the party has discovered.

![Exploring the first level of The Drowned Bell in the blueprint map theme, with the scene panel listing a treasure and its Take button, dropped goods with what lies there, and a door](../images/explore.webp)

## Read the map and controls

- **Party token:** A red circular token marks the party's square, with an arrow pointing in the direction the party faces.
- **Top-left toolbar:**
  - **Level selector:** Switches between dungeon levels the party has visited.
  - **Map themes:** Choose **Blueprint map**, **Torchlit map**, or **Parchment map**. Your choice applies only to your own browser.
  - **Pins:** Lists every note pin placed on the current level, with buttons to center on a pin, read it, or **Add pin at party**.
  - **Light status:** Shows remaining light duration (such as `6 turns`), **No light** (`The party has no light.`), or **Darkness** (`Magical darkness covers the party.`). Click this button at any time to light a torch or lantern or put out an active light.
- **Scene panel (top-left, below toolbar):** Shows the name and description of the room the party occupies (or **On the way** where the adventure keys no room), the direction the party faces, and a list of what the party perceives here, each with its action: stairs, passages, treasure, dropped goods, and doors. When the party knows about a trap in the room, a **Trapped** or **Trap sprung** badge appears beside the room's name, and it stays there when the panel folds. A stairway says which way it leads, and a trapdoor, chute, or passage says what it is, but none says where it takes the party. The description collapses automatically after 10 seconds or when you click the map. Select **Collapse description** or **Show description** to keep it folded or open. When it's folded, a button counts what's here (**1 thing here**, **3 things here**) and opens a menu of the actions. On a phone-width screen, the button shows an icon and the number, so the room's name has more space. An emptied treasure doesn't count.
- **Bottom-right camera controls and minimap:** Use **Zoom in**, **Zoom out**, **Fit map**, **Center on the party**, and **Follow the party** (which tracks the party automatically until you pan manually), plus the collapsible minimap and compass.

## Move, turn, and track time

If you are the caller (or if **Anyone with a character** is enabled), move the party one 10-foot square at a time:

- **Move and face:** Press an arrow key, or click an adjacent square with the **Select and move** (`V`) tool. Walls and closed doors block movement.
- **Turn in place:** Hold `Alt` (`Option` on macOS) and press an arrow key to change the direction the party faces without stepping forward.
- **Pan the camera:** Hold `Shift` and press an arrow key, hold `Space` and drag, middle-click and drag, or switch to **Pan the map** (`H`).

Dungeon actions advance the game clock in the top bar. A lit torch or lantern burns down as turns pass, and the light status shows how much light is left. The game rolls for wandering monsters as turns pass, and the feed reports what the party meets. Rest (`Z`) when your referee calls for it, as the B/X rules for dungeon exploration describe.

## Exploration actions

| Action | Shortcut | What it does |
| --- | --- | --- |
| **Search** | `S` | Choose secret doors, room traps, or construction tricks, then pick the character who searches. |
| **Listen** | `L` | Listen for sound behind a closed door adjacent to the party's square (works on any side of your square, regardless of facing). |
| **Light** | `T` | Light a torch or lantern, set fire to dropped oil, or put out a character's light. |
| **Rest** | `Z` | Rest for one turn, a night, or a full day inside the dungeon. |
| **Treasure** / **Dropped goods** | `G` | Appears when treasure or dropped goods are in reach. |
| **Go down the stairs** / **Climb the stairs** | `U` | Appears when the party stands on stairs, a trapdoor, or a chute between levels. |
| **Return to town** | none | Appears when the party stands on the dungeon entrance cell. |
| **Other** | `M` | Change facing, open character sheets to equip/drop/give items, reorder the party, prepare or learn spells, cast a spell, or use an item. |

Right-click any square, wall, or door on the map (or press `Shift+F10` with the map focused) to open a context menu with the actions valid at that spot.

### Doors

Stand next to a door and click it on the map, right-click it, or open the **Door** menu in the scene panel:

- **Open door** or **Close door** for unlocked, unstuck doors.
- **Force door** to have a party member shoulder a stuck door (each member's `X in 6` chance is listed).
- **Pick lock** to have a thief attempt a locked door with thieves' tools.
- **Listen at door** to spend a turn listening for monsters beyond.
- **Wedge shut with a spike** or **Wedge open with a spike** using iron spikes.

### Treasure and traps

Each treasure the party can see appears in the scene panel as a row that leads with its description, before anyone opens it. The description says what the treasure looks like, not what it holds. A treasure with no description reads **Treasure lies here.**, or **Treasure 1 lies here.**, **Treasure 2 lies here.**, and so on when several lie in sight.

A row shows a badge once the party knows about its trap: **Trapped** for a trap the party found, **Trap sprung**, or **Trap disarmed**. The game never says whether a treasure has a trap the party hasn't found. Once the party takes a treasure, its row stays on the list with an **Emptied** badge and no buttons, so you can see what the party already opened. Its map tooltip is titled **Treasure** and says "Emptied."

A treasure the party can see but can't reach from where it stands says **Step closer to reach it.** and has no buttons. Move onto its square, or into the room it belongs to, and the buttons appear.

A treasure in reach has a **Take** button and a **More for this treasure** menu (**More for** followed by the start of the description when several treasures lie here):

- **Take** divides the treasure across the party. When the party has found a trap on it, the button reads **Take anyway**, so the table decides whether to try to disarm it first. If you aren't allowed to act for the party, the button is unavailable and its tooltip says who can.
- **Give all to one member** (in the **More** menu, when more than one character is alive) assigns the treasure to one character.
- **Check for traps** lets a thief inspect a treasure that has no known trap, and **Disarm trap** lets a thief try to disarm one the party has found.

The **Treasure** menu on the action bar (`G`) lists the same actions for each treasure in reach, and **Pick up dropped goods** collects coins and gear left on the floor, such as after a fight. In the scene panel, dropped goods appear as their own row, "Dropped goods lie here.", with a **Pick up** button. A second line lists what lies there, coins first, such as "30 gold pieces, 2 vials of holy water, a torch, and a potion." The map's tooltip for dropped goods lists the same things, one per line.

Items read by the names the party knows. A magic item the party hasn't identified reads by what it looks like, such as "a potion", until someone identifies it. An item the party has no name for reads "something".

## Collaborate with map tools

Switch tools from the left-hand tool rail or by pressing their single-letter shortcuts:

- **Select and move** (`V`): Click adjacent squares to step, click doors or features to act, and drag to pan.
- **Pan the map** (`H`): Drag the map freely without clicking cells or doors.
- **Measure** (`R`): Drag from square to square to measure distance in squares and feet. Measurements appear only on your screen.
- **Ping** (`P`): Click any spot to pulse a ring in your player color for everyone at the table (`Alt`+click or long-press works from any tool).
- **Draw** (`D`): Drag freehand lines in your player color, visible to everyone on mapped levels until erased.
- **Pin a note** (`N`): Place a numbered pin with a note up to 280 characters that anyone can read on hover or from the **Pins** menu.
- **Erase** (`E`): Click or drag across drawings to remove them. Players erase strokes they drew; referees can erase any stroke or clear a level.

### Use map tools from the keyboard

When you focus the map canvas while using **Measure** (`R`), **Ping** (`P`), or **Pin a note** (`N`), a highlighted cell cursor appears at the party's square:

- Press the **arrow keys** to move the cursor cell by cell (the map announces the room, the position, and anything lying on the square, such as treasure, dropped goods, stairs, and doors, to screen readers).
- Press `Enter` to drop a ping, create a pin, or start and finish a ruler measurement.
- Press `Esc` to clear a measurement or hide the cursor.
