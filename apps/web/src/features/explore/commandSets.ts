/** The groups of exploring commands that the action bar, the map, and the scene panel handle themselves. */

/** The commands this bar, the map, and the scene panel give their own controls. */
export const CUSTOM_COMMANDS: ReadonlySet<string> = new Set([
  'move_party',
  'turn_party',
  'open_door',
  'close_door',
  'force_door',
  'wedge_door',
  'listen_at_door',
  'pick_lock',
  'search',
  'inspect_treasure',
  'remove_treasure_trap',
  'take_treasure',
  'light_source',
  'extinguish_source',
  'rest',
  'use_stairs',
  'travel_to_town',
]);

/** Commands the character sheet handles, which the bar's "Other" menu opens the sheet for. */
export const SHEET_COMMANDS: ReadonlySet<string> = new Set([
  'drop_items',
  'give_items',
  'equip_item',
  'unequip_item',
]);
