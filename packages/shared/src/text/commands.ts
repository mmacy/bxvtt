/**
 * Labels, button text, and descriptions for every bxapi command, plus a label and help text for each command
 * field, so that a form generated from a command's JSON schema reads well.
 *
 * Use `commandInfo(type)` for the command itself and `commandFieldText(type, field)` for one of its fields.
 * `commandFieldOptionLabel` names the allowed values of an enumerated field, such as the lengths of a rest.
 */

import {
  battleActionLabel,
  battleMoveLabel,
  directionLabel,
  encounterOutcomeLabel,
  healingServiceLabel,
  restKindLabel,
  searchKindLabel,
  timeUnitLabel,
} from './labels';
import { capitalizeFirst, prettifyId } from './format';

export interface CommandInfo {
  /** A name for menus and headings: `Open a door`. */
  label: string;
  /** Short imperative text for a button: `Open`. */
  button: string;
  /** One sentence that says what the command does. */
  description: string;
  /** The command as an infinitive phrase for sentences: `open a door`. */
  phrase: string;
  /** Who may send it: any caller (`play`) or only a referee. */
  kind: 'play' | 'referee';
}

function play(label: string, button: string, phrase: string, description: string): CommandInfo {
  return { label, button, phrase, description, kind: 'play' };
}

function referee(label: string, button: string, phrase: string, description: string): CommandInfo {
  return { label, button, phrase, description, kind: 'referee' };
}

export const COMMAND_INFO: Record<string, CommandInfo> = {
  move_party: play(
    'Move the party',
    'Move',
    'move the party',
    'Step the party one cell in a direction. The party turns to face that way.',
  ),
  turn_party: play(
    'Turn the party',
    'Turn',
    'turn the party',
    'Turn the party in place to face a new direction. This takes no game time.',
  ),
  reorder_party: play(
    'Set the marching order',
    'Reorder',
    'change the marching order',
    'Choose the order the party walks in, front rank first.',
  ),
  open_door: play(
    'Open a door',
    'Open',
    'open a door',
    "Open an unstuck, unlocked door on one side of the party's cell.",
  ),
  close_door: play(
    'Close a door',
    'Close',
    'close a door',
    "Close an open door on one side of the party's cell.",
  ),
  force_door: play(
    'Force a door',
    'Force',
    'force a door',
    'Have one member try to force a stuck door open with a Strength roll.',
  ),
  wedge_door: play(
    'Wedge a door',
    'Wedge',
    'wedge a door',
    "Drive an iron spike under a door so that it can't swing shut or be closed.",
  ),
  listen_at_door: play(
    'Listen at a door',
    'Listen',
    'listen at a door',
    'Have one member listen at a door for noise from the area beyond it.',
  ),
  pick_lock: play(
    'Pick a lock',
    'Pick lock',
    'pick a lock',
    'Have a thief pick the lock of a locked door. This takes one turn.',
  ),
  search: play(
    'Search',
    'Search',
    'search',
    "Search the party's cell for secret doors, room traps, or construction tricks. This takes one turn.",
  ),
  inspect_treasure: play(
    'Check treasure for traps',
    'Inspect',
    'check a treasure cache for traps',
    'Have a thief check a treasure cache for a trap. This takes one turn.',
  ),
  remove_treasure_trap: play(
    'Disarm a treasure trap',
    'Disarm',
    'disarm a treasure trap',
    'Have a thief disarm a trap that the party has already found on a cache. This takes one turn.',
  ),
  take_treasure: play(
    'Take treasure',
    'Take',
    'take treasure',
    "Empty a treasure cache or a pile of dropped goods into the party's packs. This takes one turn.",
  ),
  drop_items: play(
    'Drop items',
    'Drop',
    'drop items',
    "Drop items and coins from one member onto the party's cell, or behind a fleeing party.",
  ),
  give_items: play(
    'Give items',
    'Give',
    'give items',
    'Hand items and coins from one party member to another.',
  ),
  light_source: play(
    'Light a torch or lantern',
    'Light',
    'light a torch or lantern',
    'Light a torch or a lantern, or set fire to a flask of oil. This takes one round.',
  ),
  extinguish_source: play(
    'Put out a light',
    'Put out',
    'put out a light',
    'Put out every torch and lantern that one member has burning.',
  ),
  equip_item: play(
    'Equip an item',
    'Equip',
    'equip an item',
    "Wear armour or a ring, or wield a weapon, from a member's pack.",
  ),
  unequip_item: play(
    'Unequip an item',
    'Unequip',
    'take off an item',
    "Take off or put away an equipped item, returning it to the member's pack.",
  ),
  rest: play('Rest', 'Rest', 'rest', 'Rest the party for one turn, a night, or a full day.'),
  prepare_spells: play(
    'Prepare spells',
    'Prepare',
    'prepare spells',
    'Choose the spells that a caster memorizes, replacing the ones they had. This takes six turns.',
  ),
  learn_spell: play(
    'Learn a spell',
    'Learn',
    'learn a spell',
    "Add a spell to an arcane caster's spell book.",
  ),
  cast_spell: play(
    'Cast a spell',
    'Cast',
    'cast a spell',
    'Cast a memorized spell outside battle. This takes one round.',
  ),
  use_item: play(
    'Use a magic item',
    'Use',
    'use a magic item',
    'Drink a potion, read a scroll, or use a wand, staff, or rod. This takes one round.',
  ),
  use_stairs: play(
    'Use the stairs',
    'Take stairs',
    'use the stairs',
    "Take the stairs, trapdoor, chute, or other way between levels on the party's cell.",
  ),
  enter_dungeon: play(
    'Enter the dungeon',
    'Enter',
    'enter a dungeon',
    "Travel from town to a dungeon's entrance and start exploring.",
  ),
  travel_to_town: play(
    'Return to town',
    'Return',
    'return to town',
    "Travel from the dungeon's entrance back to town.",
  ),
  purchase_equipment: play('Buy equipment', 'Buy', 'buy equipment', 'Buy equipment in town for one member.'),
  sell_treasure: play(
    'Sell treasure',
    'Sell',
    'sell treasure',
    'Sell gems and jewellery in town at their full value.',
  ),
  purchase_healing: play(
    'Buy temple healing',
    'Buy healing',
    'buy healing',
    'Pay the temple to cast a healing service on one member.',
  ),
  parley: play(
    'Talk to the monsters',
    'Parley',
    'talk to the monsters',
    "Talk to the monsters and roll their reaction again, using the speaker's Charisma.",
  ),
  evade: play('Run away', 'Run', 'run from the monsters', 'Run from the encounter before a battle starts.'),
  engage_battle: play(
    'Start a battle',
    'Fight',
    'start a battle',
    'Attack the monsters that the party has met.',
  ),
  wait: play('Wait', 'Wait', 'wait', 'Hold for one round and let the monsters act on their bearing.'),
  turn_undead: play(
    'Turn undead',
    'Turn undead',
    'turn undead',
    'Present a holy symbol to drive off undead monsters before a battle starts. This takes one round.',
  ),
  resolve_battle_round: play(
    'Resolve the round',
    'Resolve',
    'resolve a battle round',
    'Resolve one battle round, with a declaration for each member who can act.',
  ),
  grant_item: referee(
    'Grant an item',
    'Grant item',
    'grant an item',
    "Put an item straight into a member's pack.",
  ),
  grant_coins: referee(
    'Grant coins',
    'Grant coins',
    'grant coins',
    "Put coins straight into a member's purse.",
  ),
  award_xp: referee(
    'Award experience',
    'Award XP',
    'award experience',
    'Give one character experience points, apart from what the game awards.',
  ),
  set_flag: referee(
    'Set a flag',
    'Set flag',
    'set a flag',
    'Set a game flag, such as one that records a lever pulled to open a portcullis.',
  ),
  spawn_monsters: referee(
    'Spawn monsters',
    'Spawn',
    'spawn monsters',
    'Create monsters at a distance from the party, in a new encounter or in the one under way.',
  ),
  spawn_npc_party: referee(
    'Spawn an NPC party',
    'Spawn party',
    'spawn an NPC party',
    'Generate a party of NPC adventurers and open an encounter with them.',
  ),
  set_door_state: referee(
    'Change a door',
    'Set door',
    'change a door',
    'Change the state of a door on any level of any dungeon.',
  ),
  place_party: referee(
    'Place the party',
    'Place party',
    'place the party',
    'Move the party straight to a dungeon cell or to town.',
  ),
  advance_time: referee('Advance time', 'Advance', 'advance time', 'Move the game clock forward.'),
  identify_item: referee(
    'Identify an item',
    'Identify',
    'identify an item',
    'Identify a magic item without the party having to use it.',
  ),
  roll_dice: referee(
    'Roll dice',
    'Roll',
    'roll dice',
    'Roll dice through the game, so that the roll is logged and can be replayed.',
  ),
  mark_trigger_fired: referee(
    'Mark a trigger fired',
    'Mark fired',
    'mark a trigger fired',
    'Record that an adventure trigger has fired.',
  ),
  add_journal_entry: referee(
    'Add a journal entry',
    'Add entry',
    'add a journal entry',
    "Add a line of story text to the party's journal.",
  ),
  record_note: referee(
    'Record a note',
    'Record',
    'record a note',
    'Write a note in the log. It has no effect on the game.',
  ),
  activate_quest: referee(
    'Activate a quest',
    'Activate',
    'activate a quest',
    "Put one of the adventure's quests into play.",
  ),
  reveal_objective: referee(
    'Reveal an objective',
    'Reveal',
    'reveal an objective',
    'Show the players a hidden objective of an active quest.',
  ),
  complete_objective: referee(
    'Complete an objective',
    'Complete',
    'complete an objective',
    'Mark one objective of an active quest as done.',
  ),
  complete_quest: referee(
    'Complete a quest',
    'Complete quest',
    'complete a quest',
    'Complete an active quest, and the adventure when that quest concludes it.',
  ),
  end_encounter: referee(
    'End the encounter',
    'End',
    'end the encounter',
    'Close the encounter when the party talks its way past the monsters or walks away.',
  ),
  remove_item: referee('Remove an item', 'Remove item', 'remove an item', 'Take an item away from a member.'),
  remove_coins: referee(
    'Remove coins',
    'Remove coins',
    'remove coins',
    "Take coins out of a member's purse.",
  ),
  add_member: referee(
    'Add a party member',
    'Add member',
    'add a party member',
    'Add a character to the party during play.',
  ),
  remove_member: referee(
    'Remove a party member',
    'Remove member',
    'remove a party member',
    'Take a member out of the party for good.',
  ),
};

export const COMMAND_TYPES: readonly string[] = Object.keys(COMMAND_INFO);

/** Text for a command that this module doesn't know, built from the words of its type. */
function fallbackInfo(type: string): CommandInfo {
  const words = prettifyId(type);
  return {
    label: capitalizeFirst(words),
    button: capitalizeFirst(words),
    phrase: words,
    description: `${capitalizeFirst(words)}.`,
    kind: 'play',
  };
}

/** Label, button text, description, and sentence phrase for a command type such as `open_door`. */
export function commandInfo(type: string): CommandInfo {
  return Object.hasOwn(COMMAND_INFO, type) ? (COMMAND_INFO[type] ?? fallbackInfo(type)) : fallbackInfo(type);
}

// Field text ------------------------------------------------------------------------------------------------

export interface FieldText {
  /** A label for a form control, in sentence case. */
  label: string;
  /** One or two sentences of help text. */
  help: string;
}

function field(label: string, help: string): FieldText {
  return { label, help };
}

/** Field text that applies to a field name in every command, unless the command overrides it. */
export const DEFAULT_FIELD_TEXT: Record<string, FieldText> = {
  direction: field('Direction', "Which side of the party's cell to use."),
  facing: field('Facing', 'The direction the party ends up facing.'),
  order: field('Marching order', 'Every party member exactly once, front rank first. Include the dead.'),
  character_id: field('Character', 'The party member who does this.'),
  recipient_id: field('Recipient', 'The party member who receives the goods.'),
  feature_id: field('Treasure', 'Which cache to use, or `pile` for goods that were dropped here.'),
  item_id: field('Item', 'The item to use. Magic items are named by the ID the party sees in a pack.'),
  item_ids: field('Items', 'The items to use. Repeat an item once for each unit.'),
  coins: field('Coins', 'How many coins of each kind.'),
  kind: field('Kind', 'Which kind to use.'),
  hidden: field(
    'Rest quietly',
    'Rest in an out-of-the-way place, which lowers the chance of wandering monsters.',
  ),
  selections: field('Spells', 'The spells to memorize. They replace what the caster had memorized.'),
  spell_id: field('Spell', 'Which spell to use.'),
  mode: field(
    'Spell mode',
    "Which of the spell's uses to cast. A spell with several uses, such as harm or heal, has one mode for each.",
  ),
  reversed: field(
    'Reversed form',
    'Cast the reversed form of the spell, such as cause light wounds for cure light wounds.',
  ),
  targets: field('Targets', 'Who or what the spell is aimed at: party members, monsters, or a place.'),
  target_id: field('Target', 'Who the item is used on.'),
  dungeon_id: field('Dungeon', 'Which dungeon.'),
  level_number: field('Level', 'Which level of the dungeon, counting from 1.'),
  x: field('Column', "The cell's column on the level's grid, counting from 0 at the west edge."),
  y: field('Row', "The cell's row on the level's grid, counting from 0 at the north edge."),
  quest_id: field('Quest', 'Which quest.'),
  objective_id: field('Objective', 'Which objective of the quest.'),
  quantity: field('Quantity', 'How many.'),
  amount: field('Amount', 'How many.'),
  text: field('Text', 'The words to record.'),
  key: field('Name', 'The name of the flag.'),
  value: field('Value', 'The value to set.'),
  distance_feet: field('Distance in feet', 'How far from the party, in feet.'),
  count_dice: field(
    'Number (dice)',
    'How many, as a dice expression such as 2d6. Set this or a fixed number, not both.',
  ),
  count_fixed: field(
    'Number (fixed)',
    'How many, as an exact number. Set this or a dice expression, not both.',
  ),
  template_id: field('Monster', 'Which kind of monster.'),
  party_kind: field('Party kind', 'Which table to build the party from.'),
  unit: field('Unit', 'The unit of time.'),
  n: field('Amount', 'How many units of time.'),
  expression: field('Dice', 'The roll in dice notation, such as 1d20, 3d6+2, or 2d6+1x10.'),
  narrative: field('Text for the log', 'What the referee wants to record about this. Players do not see it.'),
  trigger_id: field('Trigger', 'Which adventure trigger fired.'),
  location: field('Location', 'Where the party ends up.'),
  character: field('Character', 'The character who joins the party. It needs no ID yet.'),
  give_to: field(
    'Give belongings to',
    'The member who takes everything the leaving member carries. Leave it empty to let it all leave the game.',
  ),
  source: field('Source', 'A note about who or what issued the command.'),
  open: field('Open', 'Whether the door stands open. Leave it unchanged to keep the current state.'),
  wedged: field(
    'Wedged',
    'Whether an iron spike holds the door. Leave it unchanged to keep the current state.',
  ),
  discovered: field(
    'Found',
    'Whether the party has found the door. Leave it unchanged to keep the current state.',
  ),
  unlocked: field(
    'Unlocked',
    'Whether the lock has been undone. Leave it unchanged to keep the current state.',
  ),
  outcome: field('Outcome', 'How the encounter ended.'),
  resolve_area: field(
    'Mark the area resolved',
    "Mark the encounter's area as resolved, so its monsters don't appear when the party walks in again.",
  ),
  drop: field(
    'Drop behind the party',
    'What to scatter behind the party as it runs, to tempt the monsters to stop.',
  ),
  service: field('Service', 'Which temple service to buy.'),
  caster_level: field(
    'Temple cleric level',
    'The level of the cleric who casts the service. Leave it empty for the lowest level that can cast it.',
  ),
  declarations: field(
    'Declarations',
    'One declaration for each member who can act this round, and none for anyone else.',
  ),
};

/** Field text that differs from the default for one command. */
export const COMMAND_FIELD_TEXT: Record<string, Record<string, FieldText>> = {
  move_party: { direction: field('Direction', 'Which way to step. The party turns to face that way.') },
  turn_party: { facing: field('Facing', 'The direction to face. The party stays in its cell.') },
  open_door: {
    direction: field(
      'Door',
      "Which side of the party's cell the door is on. Choose a door the party has found.",
    ),
  },
  close_door: {
    direction: field(
      'Door',
      "Which side of the party's cell the door is on. Choose a door the party has found.",
    ),
  },
  force_door: {
    direction: field('Door', 'Which side of the cell the stuck door is on.'),
    character_id: field(
      'Who forces the door',
      'The member who tries. Strength sets the chance, so send the strongest member.',
    ),
  },
  wedge_door: {
    direction: field(
      'Door',
      'Which side of the cell the door is on. A wedged door stays as it is, open or shut.',
    ),
  },
  listen_at_door: {
    direction: field('Door', 'Which side of the cell the door is on.'),
    character_id: field(
      'Who listens',
      'The member who listens. Each member gets one attempt at each door, so send the best listener first.',
    ),
  },
  pick_lock: {
    direction: field('Door', 'Which side of the cell the locked door is on.'),
    character_id: field(
      'Who picks the lock',
      "A thief with thieves' tools. A thief who fails can try again only after gaining a level.",
    ),
  },
  search: {
    character_id: field(
      'Who searches',
      'The member who searches. Each member gets one attempt per cell for each kind of search.',
    ),
    kind: field(
      'Look for',
      'Secret doors, room traps, or construction tricks. Some classes are better at one kind than another.',
    ),
  },
  inspect_treasure: {
    character_id: field('Who inspects', 'A thief. Each thief gets one attempt per cache.'),
    feature_id: field('Cache', 'The cache to check for a trap.'),
  },
  remove_treasure_trap: {
    character_id: field('Who disarms the trap', 'A thief. A failed attempt can set the trap off.'),
    feature_id: field('Cache', 'The trapped cache to disarm. The party has to find the trap first.'),
  },
  take_treasure: {
    feature_id: field('Cache or pile', 'The cache to empty, or `pile` for goods dropped on this cell.'),
    recipient_id: field(
      'Who takes it',
      'One member to take everything, up to what they can carry. Leave it empty to share it among the living members.',
    ),
  },
  drop_items: {
    character_id: field('Who drops it', 'The member whose pack and purse the goods leave.'),
    item_ids: field('Items', 'What to drop, one unit per entry. Repeat an item to drop more than one.'),
    coins: field('Coins', 'Coins to drop with the items.'),
  },
  give_items: {
    character_id: field('From', 'The member handing the goods over.'),
    recipient_id: field('To', 'The member taking them. Both have to be alive and able to act.'),
    item_ids: field('Items', 'What changes hands, one unit per entry.'),
    coins: field('Coins', 'Coins to hand over.'),
  },
  light_source: {
    character_id: field(
      'Who lights it',
      'The member who strikes the light and carries it. The party loses the light if this member dies.',
    ),
    item_id: field('Light', 'A torch, a lantern, or a flask of oil.'),
  },
  extinguish_source: { character_id: field('Whose light', 'The member whose torches and lanterns go out.') },
  equip_item: {
    character_id: field(
      'Who equips it',
      'The member doing the equipping. Their class limits what they can wear and wield.',
    ),
    item_id: field('Item', "What to equip. It has to be in this member's pack."),
  },
  unequip_item: {
    character_id: field('Who takes it off', 'The member doing the unequipping.'),
    item_id: field('Item', 'What to take off or put away. It has to be equipped now.'),
  },
  rest: {
    kind: field(
      'How long',
      'One turn, a night, or a full day. A night is what casters need before they prepare spells.',
    ),
  },
  prepare_spells: {
    character_id: field(
      'Caster',
      'The caster who prepares spells. The party has to have slept since the caster last prepared.',
    ),
    selections: field(
      'Spells to memorize',
      'The spells to memorize. They replace what the caster had memorized.',
    ),
  },
  learn_spell: {
    character_id: field('Caster', 'The arcane caster whose spell book gets the spell.'),
    spell_id: field('Spell', 'The spell to write into the book.'),
  },
  cast_spell: {
    character_id: field(
      'Caster',
      'The caster. They need a memorized copy of the spell, and casting uses it up.',
    ),
    spell_id: field('Spell', 'The spell to cast.'),
  },
  use_item: {
    character_id: field('Who uses it', 'The member using the item. They have to carry it.'),
    item_id: field('Magic item', 'The magic item to use.'),
    target_id: field(
      'Target',
      'For a potion, the member who drinks it. For a wand, staff, or rod, the target of the effect.',
    ),
    spell_id: field('Spell on the scroll', 'Which spell to read, for a scroll with more than one.'),
    mode: field('Spell mode', "Which of the spell's uses to cast. Leave it empty for the first."),
    targets: field(
      'Spell targets',
      'Who or what the scroll spell is aimed at. Leave it empty to use the target above.',
    ),
  },
  enter_dungeon: { dungeon_id: field('Dungeon', 'Which dungeon to set out for.') },
  purchase_equipment: {
    character_id: field('Buyer', 'The member whose purse pays and whose pack receives the goods.'),
    item_ids: field('Items to buy', 'What to buy. Repeat an item to buy more than one lot.'),
  },
  sell_treasure: {
    item_ids: field(
      'Treasure to sell',
      'The gems and jewellery to sell. The coins go to the member who carries each one.',
    ),
  },
  purchase_healing: {
    character_id: field(
      'Who is treated',
      'The member to treat. Their purse pays first and the party covers the rest. They can be dead.',
    ),
    service: field('Service', 'Which temple service to buy.'),
  },
  parley: {
    character_id: field(
      'Speaker',
      'The member who talks. Their Charisma modifier applies, so send the best talker.',
    ),
  },
  evade: {
    drop: field(
      'Drop behind the party',
      'Treasure tempts intelligent monsters and food tempts animals. Dropped coins are lost.',
    ),
  },
  turn_undead: { character_id: field('Who presents the symbol', 'Usually a cleric.') },
  resolve_battle_round: {
    declarations: field(
      'Declarations',
      'One declaration for each member who can act this round, and none for anyone else.',
    ),
  },
  grant_item: {
    character_id: field('Receiver', 'The member who receives the item.'),
    item_id: field('Item', 'Which item to create, from the equipment or magic item catalog.'),
    quantity: field('Quantity', 'How many to place, counted as single items.'),
  },
  grant_coins: {
    character_id: field('Receiver', 'The member whose purse receives the coins.'),
    coins: field('Coins', 'The coins to add.'),
  },
  award_xp: {
    character_id: field('Receiver', 'The character who receives the experience.'),
    amount: field('Experience points', "The award before the class's adjustment for its prime requisite."),
  },
  set_flag: {
    key: field('Flag name', 'Any name you choose. Adventure triggers and gates read it.'),
    value: field('Value', 'A word, a number, or true or false.'),
  },
  spawn_monsters: {
    template_id: field('Monster', 'Which monster to spawn.'),
    count_dice: field(
      'Number (dice)',
      'How many, as a dice expression such as 2d6. Set this or a fixed number.',
    ),
    count_fixed: field('Number (fixed)', 'How many, as an exact number. Set this or a dice expression.'),
    distance_feet: field(
      'Distance in feet',
      'How far away the monsters appear. A new encounter opens at this distance.',
    ),
  },
  spawn_npc_party: {
    party_kind: field(
      'Party kind',
      'Basic parties are low-level adventurers and expert parties are higher-level.',
    ),
    count_dice: field(
      'Number (dice)',
      'How many adventurers, as a dice expression. Set this or a fixed number.',
    ),
    count_fixed: field(
      'Number (fixed)',
      'How many adventurers, as an exact number. Set this or a dice expression.',
    ),
    distance_feet: field('Distance in feet', 'How far away the party appears.'),
  },
  set_door_state: {
    dungeon_id: field('Dungeon', 'The dungeon the door is in. It need not be the one the party is in.'),
    level_number: field('Level', 'The level of the dungeon, counting from 1.'),
    x: field('Column', "The cell's column on the level's grid."),
    y: field('Row', "The cell's row on the level's grid."),
    direction: field('Side of the cell', "Which of the cell's four sides the door is on."),
  },
  place_party: { location: field('Where to', 'Town, or a dungeon cell with a level and a facing.') },
  advance_time: {
    n: field('How many', 'How many units to advance. Zero is allowed.'),
    unit: field('Unit', 'Rounds are 10 seconds, turns are 10 minutes, and days are 24 hours.'),
  },
  identify_item: {
    character_id: field(
      'Carrier',
      "The member who carries the item. A dead member's items can be identified too.",
    ),
    item_id: field('Magic item', 'The magic item to identify.'),
  },
  roll_dice: { expression: field('Dice', 'The roll in dice notation, such as 1d20, 3d6+2, or 2d6+1x10.') },
  mark_trigger_fired: {
    trigger_id: field('Trigger', 'The ID of the trigger that fired.'),
    narrative: field('Note', 'What to record about this firing. Players do not see it.'),
  },
  add_journal_entry: { text: field('Entry', 'The line to add, as the players will read it.') },
  record_note: {
    text: field('Note', 'The note to record. Players do not see it, and it changes nothing in the game.'),
  },
  activate_quest: { quest_id: field('Quest', 'Which quest to put into play.') },
  reveal_objective: {
    quest_id: field('Quest', 'The quest the objective belongs to. It has to be active.'),
    objective_id: field('Objective', 'Which hidden objective to show the players.'),
  },
  complete_objective: {
    quest_id: field('Quest', 'The quest the objective belongs to. It has to be active.'),
    objective_id: field(
      'Objective',
      'Which objective is done. A hidden objective is revealed as it completes.',
    ),
  },
  complete_quest: {
    quest_id: field('Quest', 'Which active quest to complete. You decide whether the objectives are done.'),
  },
  end_encounter: {
    outcome: field(
      'How it ended',
      'Parley if the party and monsters came to terms. Departed if the party walked away.',
    ),
  },
  remove_item: {
    character_id: field('Carrier', 'The member who loses the item.'),
    item_id: field('Item', 'Which item to take.'),
    quantity: field('Quantity', 'How many units of an ordinary item. It has to be 1 for a magic item.'),
  },
  remove_coins: {
    character_id: field('Payer', 'The member whose purse pays.'),
    coins: field('Coins', 'The coins to take. The purse needs at least this many of each kind.'),
  },
  add_member: {
    character: field(
      'Character',
      'The character who joins. It needs no ID yet, no conditions, and no identified magic items.',
    ),
  },
  remove_member: {
    character_id: field(
      'Member',
      'The member who leaves. They can be alive, dead, asleep, or turned to stone.',
    ),
    give_to: field(
      'Give belongings to',
      'The member who takes everything the leaving member carries. Leave it empty to let it all leave the game.',
    ),
  },
};

/** Text for the fields of a battle declaration, the entries of `resolve_battle_round.declarations`. */
export const DECLARATION_FIELD_TEXT: Record<string, FieldText> = {
  character_id: field('Member', 'Whose declaration this is.'),
  action: field('Action', 'What this member does this round.'),
  target_group_id: field('Target group', 'Which monster group the action is aimed at.'),
  weapon_id: field('Weapon', 'Which wielded weapon to attack with. Leave it empty to let the game choose.'),
  spell_id: field('Spell', 'Which spell to cast.'),
  spell_mode: field('Spell mode', "Which of the spell's uses to cast."),
  reversed: field('Reversed form', 'Cast the reversed form of the spell.'),
  targets: field(
    'Spell targets',
    'Who or what the spell is aimed at, when it does not target the whole group.',
  ),
  move: field('Move', 'How this member moves this round.'),
  replacement_id: field(
    'Trade places with',
    'A member to trade marching-order places with, for a fighting withdrawal or retreat made alone.',
  ),
  item_id: field('Item', 'The magic item to use, or the splash weapon to throw.'),
  gaze_defense: field(
    'Guard against a gaze',
    'Avert eyes or fight by a mirror. Either one costs a penalty to attack.',
  ),
  back_stab: field(
    'Back-stab',
    "A thief's attack on an unaware monster from behind, with a bonus to hit and doubled damage.",
  ),
};

/** Text for the fields of a party location (`place_party.location`). */
export const LOCATION_FIELD_TEXT: Record<string, FieldText> = {
  kind: field('Place', 'Town, or a dungeon cell.'),
  dungeon_id: field('Dungeon', 'Which dungeon.'),
  level_number: field('Level', 'Which level, counting from 1.'),
  position: field('Cell', 'The column and row of the cell.'),
  facing: field('Facing', 'The direction the party faces.'),
};

/** Text for the fields of a memorized spell (`prepare_spells.selections`). */
export const SELECTION_FIELD_TEXT: Record<string, FieldText> = {
  spell_id: field('Spell', 'Which spell to memorize.'),
  reversed: field(
    'Reversed form',
    'Memorize the reversed form. Only arcane casters choose this when memorizing.',
  ),
};

/** Text for the coin fields (`coins.pp` and the rest). */
export const COIN_FIELD_TEXT: Record<string, FieldText> = {
  pp: field('Platinum pieces', 'Each is worth 5 gold pieces.'),
  gp: field('Gold pieces', 'The standard coin.'),
  ep: field('Electrum pieces', 'Each is worth half a gold piece.'),
  sp: field('Silver pieces', 'Ten make a gold piece.'),
  cp: field('Copper pieces', 'A hundred make a gold piece.'),
};

/** Label and help text for one field of a command. Fields that no table lists read as their own words. */
export function commandFieldText(command: string, fieldName: string): FieldText {
  const specific = COMMAND_FIELD_TEXT[command];
  if (specific && Object.hasOwn(specific, fieldName))
    return specific[fieldName] ?? DEFAULT_FIELD_TEXT[fieldName] ?? fallbackField(fieldName);
  if (Object.hasOwn(DEFAULT_FIELD_TEXT, fieldName))
    return DEFAULT_FIELD_TEXT[fieldName] ?? fallbackField(fieldName);
  return fallbackField(fieldName);
}

function fallbackField(name: string): FieldText {
  const words = capitalizeFirst(prettifyId(name));
  return { label: words, help: `${words}.` };
}

/** True when a command has text for a field, either its own or the default. */
export function hasCommandFieldText(command: string, fieldName: string): boolean {
  return (
    Boolean(COMMAND_FIELD_TEXT[command] && Object.hasOwn(COMMAND_FIELD_TEXT[command], fieldName)) ||
    Object.hasOwn(DEFAULT_FIELD_TEXT, fieldName)
  );
}

const PARTY_KINDS: Record<string, string> = { basic: 'Basic (low level)', expert: 'Expert (higher level)' };
const DROP_OPTIONS: Record<string, string> = { none: 'Nothing', treasure: 'Treasure', food: 'Food' };
const GAZE_OPTIONS: Record<string, string> = { avert_eyes: 'Avert eyes', mirror: 'Fight by a mirror' };
const ON_SAVE: Record<string, string> = { negates: 'Negates the effect', half: 'Halves the effect' };

/** Label for one allowed value of an enumerated field, such as `night` for the `kind` of `rest`. */
export function commandFieldOptionLabel(command: string, fieldName: string, value: string): string {
  switch (fieldName) {
    case 'direction':
    case 'facing':
      return directionLabel(value);
    case 'kind':
      if (command === 'rest') return restKindLabel(value);
      if (command === 'search') return searchKindLabel(value);
      return capitalizeFirst(prettifyId(value));
    case 'drop':
      return DROP_OPTIONS[value] ?? capitalizeFirst(prettifyId(value));
    case 'service':
      return healingServiceLabel(value);
    case 'outcome':
      return encounterOutcomeLabel(value);
    case 'party_kind':
      return PARTY_KINDS[value] ?? capitalizeFirst(prettifyId(value));
    case 'unit':
      return timeUnitLabel(value);
    case 'action':
      return battleActionLabel(value);
    case 'move':
      return battleMoveLabel(value);
    case 'gaze_defense':
      return GAZE_OPTIONS[value] ?? capitalizeFirst(prettifyId(value));
    case 'on_save':
      return ON_SAVE[value] ?? capitalizeFirst(prettifyId(value));
    default:
      return capitalizeFirst(prettifyId(value));
  }
}
