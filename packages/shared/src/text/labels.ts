/**
 * Display labels for the closed sets of values that bxapi uses: session modes, conditions, abilities, saving
 * throws, alignments, classes, coins, item types, weapon qualities, door states, monster bearing, battle actions
 * and moves, directions, and time units.
 *
 * Every label is in sentence case. Each lookup accepts any string and falls back to the value's words
 * (`magic_user` becomes `Magic user`) so a value that bxapi adds later still reads as English.
 */

import catalog from './data/catalog.json' with { type: 'json' };
import { capitalizeFirst, coinName, lowerFirst, prettifyId } from './format';

function fallbackLabel(value: string): string {
  return capitalizeFirst(prettifyId(value));
}

function lookup<T extends { label: string }>(table: Record<string, T>, value: string): T | undefined {
  return Object.hasOwn(table, value) ? table[value] : undefined;
}

// Session modes ---------------------------------------------------------------------------------------------

export interface ModeInfo {
  label: string;
  description: string;
}

const SESSION_MODES: Record<string, ModeInfo> = {
  town: {
    label: 'In town',
    description: 'Shop, rest, visit the temple, and set out for a dungeon.',
  },
  exploring: { label: 'Exploring', description: 'The party is exploring a dungeon, one turn at a time.' },
  encounter: {
    label: 'Encounter',
    description: 'The party has met monsters and can talk, run, wait, or fight.',
  },
  battle: { label: 'Battle', description: 'The party is fighting, one 10-second round at a time.' },
  game_over: { label: 'Game over', description: 'Every party member has fallen.' },
  victory: { label: 'Victory', description: 'The party has completed the adventure.' },
};

export const SESSION_MODE_VALUES = Object.keys(SESSION_MODES);

/** Label for a session mode: `Exploring`. */
export function sessionModeLabel(mode: string): string {
  return lookup(SESSION_MODES, mode)?.label ?? fallbackLabel(mode);
}

/** One sentence that says what the party can do in a session mode. */
export function sessionModeDescription(mode: string): string {
  return lookup(SESSION_MODES, mode)?.description ?? `The game is in ${prettifyId(mode)} mode.`;
}

/** The session modes in the order a game passes through them, for listing several modes. */
export const SESSION_MODE_ORDER: readonly string[] = [
  'town',
  'exploring',
  'encounter',
  'battle',
  'game_over',
  'victory',
];

interface ModePhrases {
  /** When something happens in the mode, as an adverbial phrase: `while exploring`. */
  when: string;
  /** What the party is doing in the mode, as a verb phrase: `is exploring a dungeon`. */
  now: string;
}

const MODE_PHRASES: Record<string, ModePhrases> = {
  town: { when: 'in town', now: 'is in town' },
  exploring: { when: 'while exploring', now: 'is exploring a dungeon' },
  encounter: { when: 'during an encounter', now: 'is in an encounter' },
  battle: { when: 'during a battle', now: 'is in a battle' },
  game_over: { when: 'after the party has fallen', now: 'has fallen' },
  victory: { when: 'after the party has won the adventure', now: 'has won the adventure' },
};

/** When something happens in a session mode, as a phrase that ends a sentence: `while exploring`. */
export function sessionModeWhen(mode: string): string {
  return Object.hasOwn(MODE_PHRASES, mode)
    ? (MODE_PHRASES[mode]?.when ?? `in ${prettifyId(mode)} mode`)
    : `in ${prettifyId(mode)} mode`;
}

/** What the party is doing in a session mode, as a verb phrase after "The party": `is exploring a dungeon`. */
export function sessionModeNow(mode: string): string {
  return Object.hasOwn(MODE_PHRASES, mode)
    ? (MODE_PHRASES[mode]?.now ?? `is in ${prettifyId(mode)} mode`)
    : `is in ${prettifyId(mode)} mode`;
}

// Conditions ------------------------------------------------------------------------------------------------

export interface ConditionInfo {
  /** The state as an adjective, in sentence case: `Paralysed`. */
  label: string;
  /** What happens to a creature that gains the condition, as a verb phrase: `is paralysed`. */
  gained: string;
  /** What happens when it ends: `is no longer paralysed`. */
  removed: string;
  /** One sentence for a tooltip. */
  description: string;
}

const CONDITIONS: Record<string, ConditionInfo> = {
  paralysed: {
    label: 'Paralysed',
    gained: 'is paralysed',
    removed: 'is no longer paralysed',
    description: 'Unable to move or act. Melee attacks against this creature hit automatically.',
  },
  asleep: {
    label: 'Asleep',
    gained: 'falls asleep',
    removed: 'wakes up',
    description: 'Unaware and helpless. Melee attacks against this creature hit automatically.',
  },
  blind: {
    label: 'Blind',
    gained: 'is struck blind',
    removed: 'can see again',
    description: 'Unable to see or make attacks.',
  },
  charmed: {
    label: 'Charmed',
    gained: 'is charmed',
    removed: 'is no longer charmed',
    description: 'Regards the caster as a trusted friend and ally.',
  },
  petrified: {
    label: 'Petrified',
    gained: 'is turned to stone',
    removed: 'turns back to flesh',
    description: 'Turned to stone and unable to act.',
  },
  diseased: {
    label: 'Diseased',
    gained: 'falls ill with disease',
    removed: 'is cured of disease',
    description: 'Afflicted with a disease that blocks magical healing.',
  },
  exhausted: {
    label: 'Exhausted',
    gained: 'is exhausted',
    removed: 'is no longer exhausted',
    description: 'Worn out from fleeing, with a penalty to attack rolls, damage, and armour class.',
  },
  lycanthropy_incubation: {
    label: 'Lycanthropy incubating',
    gained: 'is infected with lycanthropy',
    removed: 'is no longer infected with lycanthropy',
    description: 'Infected with lycanthropy, which takes hold unless cured in time.',
  },
  averted_eyes: {
    label: 'Eyes averted',
    gained: 'looks away',
    removed: 'looks up again',
    description: 'Looking away from a gaze monster, taking a penalty to attack rolls.',
  },
  poisoned: {
    label: 'Poisoned',
    gained: 'is poisoned',
    removed: 'is no longer poisoned',
    description: 'Afflicted with poison that proves fatal unless neutralized.',
  },
  dead: { label: 'Dead', gained: 'dies', removed: 'returns to life', description: 'Slain.' },
  silenced: {
    label: 'Silenced',
    gained: 'is silenced',
    removed: 'can speak again',
    description: 'Unable to speak or cast spells.',
  },
  entangled: {
    label: 'Entangled',
    gained: 'is entangled',
    removed: 'breaks free',
    description: 'Held fast and unable to move.',
  },
  afraid: {
    label: 'Afraid',
    gained: 'is afraid',
    removed: 'is no longer afraid',
    description: 'Panicked and forced to flee.',
  },
  feebleminded: {
    label: 'Feebleminded',
    gained: 'is feebleminded',
    removed: 'is no longer feebleminded',
    description: 'Unable to think clearly, cast spells, or use magic items.',
  },
  invisible: {
    label: 'Invisible',
    gained: 'turns invisible',
    removed: 'becomes visible',
    description: 'Unseen by normal sight, penalizing attacks against this creature.',
  },
  turned: {
    label: 'Turned',
    gained: 'is turned and flees',
    removed: 'is no longer turned',
    description: "Driven back by a cleric's holy symbol.",
  },
  confused: {
    label: 'Confused',
    gained: 'is confused',
    removed: 'is no longer confused',
    description: 'Disoriented and acting unpredictably each round.',
  },
  weakened: {
    label: 'Weakened',
    gained: 'is weakened',
    removed: 'is no longer weakened',
    description: 'Drained of strength, fighting poorly and unable to heal.',
  },
};

export const CONDITION_VALUES = Object.keys(CONDITIONS);

function normalizeCondition(condition: string): string {
  return condition === 'paralyzed' ? 'paralysed' : condition;
}

/** Label for a condition: `Paralysed`. */
export function conditionLabel(condition: string): string {
  const key = normalizeCondition(condition);
  return lookup(CONDITIONS, key)?.label ?? fallbackLabel(key);
}

/** What a creature does on gaining the condition, as a verb phrase: `falls asleep`. */
export function conditionGained(condition: string): string {
  const key = normalizeCondition(condition);
  return lookup(CONDITIONS, key)?.gained ?? `is ${lowerFirst(prettifyId(key))}`;
}

/** What a creature does on losing the condition, as a verb phrase: `wakes up`. */
export function conditionRemoved(condition: string): string {
  const key = normalizeCondition(condition);
  return lookup(CONDITIONS, key)?.removed ?? `is no longer ${lowerFirst(prettifyId(key))}`;
}

/** One-sentence description of a condition. */
export function conditionDescription(condition: string): string {
  const key = normalizeCondition(condition);
  return lookup(CONDITIONS, key)?.description ?? `${fallbackLabel(key)}.`;
}

// Abilities and saving throws -------------------------------------------------------------------------------

const ABILITIES: Record<string, { label: string; short: string }> = {
  str: { label: 'Strength', short: 'STR' },
  int: { label: 'Intelligence', short: 'INT' },
  wis: { label: 'Wisdom', short: 'WIS' },
  dex: { label: 'Dexterity', short: 'DEX' },
  con: { label: 'Constitution', short: 'CON' },
  cha: { label: 'Charisma', short: 'CHA' },
};

export const ABILITY_VALUES = Object.keys(ABILITIES);

/** Name of an ability score: `Strength`, or `STR` with `style: 'short'`. */
export function abilityLabel(ability: string, style: 'full' | 'short' = 'full'): string {
  const entry = lookup(ABILITIES, ability);
  if (!entry) return style === 'short' ? ability.toUpperCase() : fallbackLabel(ability);
  return style === 'short' ? entry.short : entry.label;
}

const SAVES: Record<string, { label: string; short: string; versus: string }> = {
  death: { label: 'Death ray or poison', short: 'Death', versus: 'death ray or poison' },
  wands: { label: 'Magic wands', short: 'Wands', versus: 'magic wands' },
  paralysis: {
    label: 'Paralysis or turn to stone',
    short: 'Paralysis',
    versus: 'paralysis or turn to stone',
  },
  breath: { label: 'Dragon breath', short: 'Breath', versus: 'dragon breath' },
  spells: { label: 'Rods, staves, or spells', short: 'Spells', versus: 'rods, staves, or spells' },
};

export const SAVE_VALUES = Object.keys(SAVES);

/** Name of a saving throw category: `Paralysis or turn to stone`, or `Paralysis` with `style: 'short'`. */
export function saveLabel(category: string, style: 'full' | 'short' = 'full'): string {
  const entry = lookup(SAVES, category);
  if (!entry) return fallbackLabel(category);
  return style === 'short' ? entry.short : entry.label;
}

/** The saving throw as it reads after `save versus`: `dragon breath`. */
export function saveVersus(category: string): string {
  return lookup(SAVES, category)?.versus ?? prettifyId(category);
}

// Alignments, classes, languages ---------------------------------------------------------------------------

const ALIGNMENTS: Record<string, { label: string; description: string }> = {
  lawful: { label: 'Lawful', description: 'Believes in order, honour, and the common good.' },
  neutral: { label: 'Neutral', description: 'Seeks balance between law and chaos.' },
  chaotic: { label: 'Chaotic', description: 'Follows selfish desires and the strong.' },
};

export const ALIGNMENT_VALUES = Object.keys(ALIGNMENTS);

/** Label for an alignment: `Lawful`. */
export function alignmentLabel(alignment: string): string {
  return lookup(ALIGNMENTS, alignment)?.label ?? fallbackLabel(alignment);
}

/** One-sentence description of an alignment. */
export function alignmentDescription(alignment: string): string {
  return lookup(ALIGNMENTS, alignment)?.description ?? `${fallbackLabel(alignment)}.`;
}

const CLASS_NAMES: Record<string, string> = Object.fromEntries(
  catalog.classes.map((entry) => [entry.id, entry.name]),
);

/**
 * Name of a character class as a label, a heading, a badge, a card line, or a list or table entry: `Magic-User`.
 * Unknown IDs read as words. Inside a sentence, pass the name to `classInSentence`, which reads
 * `magic-user`.
 */
export function classLabel(classId: string): string {
  return Object.hasOwn(CLASS_NAMES, classId)
    ? (CLASS_NAMES[classId] ?? fallbackLabel(classId))
    : fallbackLabel(classId);
}

const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  catalog.languages.map((entry) => [entry.id, entry.name]),
);

/** Name of a language: `Elvish`. Alignment languages read as `Lawful alignment tongue`. */
export function languageLabel(languageId: string): string {
  if (languageId.startsWith('alignment_'))
    return `${fallbackLabel(languageId.slice('alignment_'.length))} alignment tongue`;
  return Object.hasOwn(LANGUAGE_NAMES, languageId)
    ? (LANGUAGE_NAMES[languageId] ?? fallbackLabel(languageId))
    : fallbackLabel(languageId);
}

// Coins ------------------------------------------------------------------------------------------------------

/** Name of a coin: `gp` becomes `Gold pieces`. Use `coinName` from the format helpers for the in-sentence form. */
export function coinLabel(denomination: string): string {
  return capitalizeFirst(coinName(denomination));
}

// Item types ------------------------------------------------------------------------------------------------

const ITEM_TYPES: Record<string, { label: string }> = {
  weapon: { label: 'Weapon' },
  armour: { label: 'Armour' },
  gear: { label: 'Gear' },
  ammunition: { label: 'Ammunition' },
  magic_item: { label: 'Magic item' },
  valuable: { label: 'Gem or jewellery' },
  gem: { label: 'Gem' },
  jewellery: { label: 'Jewellery' },
  potion: { label: 'Potion' },
  scroll: { label: 'Scroll' },
  ring: { label: 'Ring' },
  rod: { label: 'Rod' },
  staff: { label: 'Staff' },
  wand: { label: 'Wand' },
  sword: { label: 'Magic sword' },
  misc: { label: 'Miscellaneous magic item' },
};

/** Label for an item type or magic item category: `Weapon`, `Potion`. */
export function itemTypeLabel(itemType: string): string {
  return lookup(ITEM_TYPES, itemType)?.label ?? fallbackLabel(itemType);
}

// Weapon qualities ------------------------------------------------------------------------------------------

/** osrlib's weapon qualities, as the weapon table prints them. Each weapon template lists its qualities. */
const WEAPON_QUALITIES: Record<string, { label: string; description: string }> = {
  blunt: {
    label: 'Blunt',
    description:
      'A crushing weapon, not an edged one. Only an edged melee weapon kills a sleeping target with one hit.',
  },
  brace: {
    label: 'Brace',
    description: 'Deals double damage when the wielder sets it against a charging enemy.',
  },
  charge: { label: 'Charge', description: 'Deals double damage when the wielder charges with it.' },
  melee: { label: 'Melee', description: 'Strikes hand to hand, at melee reach.' },
  missile: {
    label: 'Missile',
    description: 'Shoots or is thrown at range. The range band sets the attack modifier.',
  },
  reload: {
    label: 'Reload',
    description: 'Requires a round to reload between shots when weapon reloading is enabled.',
  },
  slow: {
    label: 'Slow',
    description: 'Always acts last in the round, regardless of initiative.',
  },
  splash: {
    label: 'Splash',
    description:
      'Bursts on the target. A damaging hit deals its damage again at the start of the next round.',
  },
  two_handed: {
    label: 'Two-handed',
    description: 'Requires both hands and cannot be used with a shield.',
  },
};

export const WEAPON_QUALITY_VALUES = Object.keys(WEAPON_QUALITIES);

/** Label for a weapon quality: `Two-handed`. */
export function weaponQualityLabel(quality: string): string {
  return lookup(WEAPON_QUALITIES, quality)?.label ?? fallbackLabel(quality);
}

/** What a weapon quality does in a fight, in a sentence or two. */
export function weaponQualityDescription(quality: string): string {
  return lookup(WEAPON_QUALITIES, quality)?.description ?? `${fallbackLabel(quality)}.`;
}

// Doors and edges -------------------------------------------------------------------------------------------

const DOOR_STATES: Record<string, { label: string; description: string }> = {
  open: { label: 'Open', description: 'The door stands open.' },
  closed: { label: 'Closed', description: 'The door is shut but not locked.' },
  locked: { label: 'Locked', description: 'The door is locked. A thief can pick the lock.' },
  stuck: { label: 'Stuck', description: 'The door is stuck and must be forced open.' },
  wedged: {
    label: 'Wedged',
    description: 'Wedged with an iron spike so it cannot swing shut or be closed.',
  },
  secret: { label: 'Secret', description: 'The door is hidden until someone finds it.' },
  wall: { label: 'Wall', description: 'Solid wall.' },
  passage: { label: 'Open passage', description: 'Nothing blocks the way.' },
};

export const DOOR_STATE_VALUES = Object.keys(DOOR_STATES);

/** Label for a door state: `Stuck`. */
export function doorStateLabel(state: string): string {
  return lookup(DOOR_STATES, state)?.label ?? fallbackLabel(state);
}

/** One-sentence description of a door state. */
export function doorStateDescription(state: string): string {
  return lookup(DOOR_STATES, state)?.description ?? `${fallbackLabel(state)}.`;
}

/** Describe a door from the edge fields of the player view: `open`, `wedged`, `door_open`, `door_wedged`. */
export function doorStateFromEdge(edge: {
  kind: string;
  door_open?: boolean | null;
  door_wedged?: boolean | null;
}): string {
  if (edge.kind === 'wall') return 'wall';
  if (edge.kind === 'open') return 'passage';
  if (edge.door_wedged) return 'wedged';
  return edge.door_open ? 'open' : 'closed';
}

// Monster bearing -------------------------------------------------------------------------------------------

const STANCES: Record<string, { label: string; description: string; sentence: string }> = {
  attacks: {
    label: 'Attacking',
    description: 'The monsters attack at once.',
    sentence: 'The monsters attack.',
  },
  hostile: {
    label: 'Hostile',
    description: 'The monsters are hostile and will attack soon unless the party acts.',
    sentence: 'The monsters are hostile.',
  },
  uncertain: {
    label: 'Uncertain',
    description: 'The monsters have not decided how to act. Talking might change their mood.',
    sentence: 'The monsters are uncertain.',
  },
  indifferent: {
    label: 'Indifferent',
    description: 'The monsters take no interest in the party.',
    sentence: 'The monsters pay the party no mind.',
  },
  friendly: {
    label: 'Friendly',
    description: 'The monsters are friendly.',
    sentence: 'The monsters are friendly.',
  },
};

export const STANCE_VALUES = Object.keys(STANCES);

/** Label for the monsters' bearing: `Hostile`. */
export function stanceLabel(stance: string): string {
  return lookup(STANCES, stance)?.label ?? fallbackLabel(stance);
}

/** One sentence that describes what a bearing means for the party. */
export function stanceDescription(stance: string): string {
  return lookup(STANCES, stance)?.description ?? `${fallbackLabel(stance)}.`;
}

/** A narrated sentence about the bearing, such as `The monsters are hostile.` */
export function stanceSentence(stance: string): string {
  return lookup(STANCES, stance)?.sentence ?? `The monsters seem ${prettifyId(stance)}.`;
}

// Battle actions and moves ----------------------------------------------------------------------------------

const BATTLE_ACTIONS: Record<string, { label: string; description: string }> = {
  attack: { label: 'Attack', description: 'Strike or shoot at a monster group, closing in first if needed.' },
  cast: {
    label: 'Cast a spell',
    description: 'Cast a memorized spell. A caster cannot move in the round they cast.',
  },
  move: { label: 'Move', description: 'Move on the range track without attacking.' },
  use_item: {
    label: 'Use an item',
    description: 'Drink a potion, read a scroll, use a wand or staff, or throw a flask of oil.',
  },
  give_item: { label: 'Give an item', description: 'Hand an item to a party member within reach.' },
  turn_undead: { label: 'Turn undead', description: 'Present a holy symbol to drive off undead monsters.' },
  hide: {
    label: 'Hide',
    description: 'Slip into the shadows to set up a back-stab. The referee rolls in secret.',
  },
  hold: { label: 'Hold', description: 'Stay where you are and do nothing this round.' },
};

export const BATTLE_ACTION_VALUES = Object.keys(BATTLE_ACTIONS);

/** Label for a battle action: `Cast a spell`. */
export function battleActionLabel(action: string): string {
  return lookup(BATTLE_ACTIONS, action)?.label ?? fallbackLabel(action);
}

/** One-sentence description of a battle action. */
export function battleActionDescription(action: string): string {
  return lookup(BATTLE_ACTIONS, action)?.description ?? `${fallbackLabel(action)}.`;
}

const BATTLE_MOVES: Record<string, { label: string; description: string; past: string }> = {
  close: {
    label: 'Close in',
    description: 'Move toward a monster group, stopping 5 feet away.',
    past: 'closes in',
  },
  fighting_withdrawal: {
    label: 'Fighting withdrawal',
    description: 'Back away slowly while facing the monsters, at half the usual rate.',
    past: 'falls back',
  },
  retreat: {
    label: 'Retreat',
    description: 'Turn and run from the monsters at full speed.',
    past: 'retreats',
  },
};

export const BATTLE_MOVE_VALUES = Object.keys(BATTLE_MOVES);

/** Label for a battle move: `Fighting withdrawal`. */
export function battleMoveLabel(move: string): string {
  return lookup(BATTLE_MOVES, move)?.label ?? fallbackLabel(move);
}

/** One-sentence description of a battle move. */
export function battleMoveDescription(move: string): string {
  return lookup(BATTLE_MOVES, move)?.description ?? `${fallbackLabel(move)}.`;
}

/** The move as a verb phrase for narration: `falls back`. */
export function battleMoveVerb(move: string): string {
  return lookup(BATTLE_MOVES, move)?.past ?? `makes the ${prettifyId(move).toLowerCase()} move`;
}

// Directions and facings ------------------------------------------------------------------------------------

const DIRECTIONS: Record<string, { label: string; facing: string; opposite: string }> = {
  north: { label: 'North', facing: 'facing north', opposite: 'south' },
  east: { label: 'East', facing: 'facing east', opposite: 'west' },
  south: { label: 'South', facing: 'facing south', opposite: 'north' },
  west: { label: 'West', facing: 'facing west', opposite: 'east' },
};

export const DIRECTION_VALUES = Object.keys(DIRECTIONS);

/** Label for a direction: `North`. */
export function directionLabel(direction: string): string {
  return lookup(DIRECTIONS, direction)?.label ?? fallbackLabel(direction);
}

/** The facing as a phrase: `facing north`. */
export function facingLabel(facing: string): string {
  return lookup(DIRECTIONS, facing)?.facing ?? `facing ${prettifyId(facing)}`;
}

/** The opposite direction: `north` gives `south`. Unknown values come back unchanged. */
export function oppositeDirection(direction: string): string {
  return lookup(DIRECTIONS, direction)?.opposite ?? direction;
}

// Time, rests, and other small sets -------------------------------------------------------------------------

const TIME_UNITS: Record<string, { label: string; one: string; many: string }> = {
  round: { label: 'Rounds (10 seconds)', one: 'round', many: 'rounds' },
  turn: { label: 'Turns (10 minutes)', one: 'turn', many: 'turns' },
  day: { label: 'Days (24 hours)', one: 'day', many: 'days' },
};

export const TIME_UNIT_VALUES = Object.keys(TIME_UNITS);

/** Label for a game time unit, with its length: `Turns (10 minutes)`. */
export function timeUnitLabel(unit: string): string {
  return lookup(TIME_UNITS, unit)?.label ?? fallbackLabel(unit);
}

/**
 * The time unit as a noun for a count, in lower case: `timeUnitNoun('turn')` gives `turn`, and
 * `timeUnitNoun('turn', 3)` gives `turns`. Use `formatDuration` for a whole amount such as `3 turns (30 minutes)`.
 */
export function timeUnitNoun(unit: string, count = 1): string {
  const known = lookup(TIME_UNITS, unit);
  const one = known?.one ?? prettifyId(unit).toLowerCase();
  return count === 1 ? one : (known?.many ?? `${one}s`);
}

const REST_KINDS: Record<string, { label: string; description: string }> = {
  turn: {
    label: 'One turn',
    description: 'Rest for one turn (10 minutes) to avoid fatigue.',
  },
  night: {
    label: 'A night',
    description: 'Rest for a night so casters can prepare spells.',
  },
  day: {
    label: 'A full day',
    description: 'Rest for a full day to recover hit points.',
  },
};

/** Label for a rest length: `A night`. */
export function restKindLabel(kind: string): string {
  return lookup(REST_KINDS, kind)?.label ?? fallbackLabel(kind);
}

/** One-sentence description of a rest length. */
export function restKindDescription(kind: string): string {
  return lookup(REST_KINDS, kind)?.description ?? `${fallbackLabel(kind)}.`;
}

const SEARCH_KINDS: Record<string, { label: string; noun: string }> = {
  secret_doors: { label: 'Secret doors', noun: 'secret doors' },
  room_traps: { label: 'Room traps', noun: 'room traps' },
  construction: { label: 'Construction tricks', noun: 'construction tricks' },
  treasure_traps: { label: 'Treasure traps', noun: 'treasure traps' },
};

/** Label for a kind of search: `Secret doors`. */
export function searchKindLabel(kind: string): string {
  return lookup(SEARCH_KINDS, kind)?.label ?? fallbackLabel(kind);
}

/** The thing searched for, as a noun phrase: `secret doors`. */
export function searchKindNoun(kind: string): string {
  return lookup(SEARCH_KINDS, kind)?.noun ?? prettifyId(kind);
}

const HEALING_SERVICES: Record<string, { label: string; description: string }> = {
  cure_light_wounds: {
    label: 'Cure light wounds',
    description: 'Heals a few hit points and can cure paralysis.',
  },
  cure_serious_wounds: {
    label: 'Cure serious wounds',
    description: 'Heals more hit points than cure light wounds.',
  },
  cure_disease: { label: 'Cure disease', description: 'Cures a disease, including lycanthropy.' },
  neutralize_poison: {
    label: 'Neutralize poison',
    description: 'Removes poison, and can revive someone who died of it recently.',
  },
  remove_curse: {
    label: 'Remove curse',
    description: 'Lifts a curse and frees the bearer from cursed items they cannot remove.',
  },
  raise_dead: {
    label: 'Raise dead',
    description: 'Returns a dead character to life, if the body is whole and not long dead.',
  },
};

export const HEALING_SERVICE_VALUES = Object.keys(HEALING_SERVICES);

/** Label for a temple service: `Raise dead`. */
export function healingServiceLabel(service: string): string {
  return lookup(HEALING_SERVICES, service)?.label ?? fallbackLabel(service);
}

/** One-sentence description of a temple service. */
export function healingServiceDescription(service: string): string {
  return lookup(HEALING_SERVICES, service)?.description ?? `${fallbackLabel(service)}.`;
}

const ENCOUNTER_OUTCOMES: Record<string, { label: string; sentence: string }> = {
  victory: { label: 'Victory', sentence: 'The monsters are beaten.' },
  evaded: { label: 'Evaded', sentence: 'The party evaded the monsters.' },
  escaped: { label: 'Escaped', sentence: 'The party escaped the chase.' },
  turned: { label: 'Turned', sentence: 'The undead were driven off.' },
  parley: { label: 'Parley', sentence: 'The party and the monsters came to terms.' },
  departed: { label: 'Departed', sentence: 'The party walked away and the monsters let them go.' },
};

/** Label for how an encounter ended: `Escaped`. */
export function encounterOutcomeLabel(outcome: string): string {
  return lookup(ENCOUNTER_OUTCOMES, outcome)?.label ?? fallbackLabel(outcome);
}

/** A narrated sentence for how an encounter ended. */
export function encounterOutcomeSentence(outcome: string): string {
  return (
    lookup(ENCOUNTER_OUTCOMES, outcome)?.sentence ??
    `The encounter ended with the outcome ${prettifyId(outcome).toLowerCase()}.`
  );
}

/** Label for a light source: `torch` gives `Torch`. */
export function lightSourceLabel(source: string): string {
  return fallbackLabel(source === 'oil' ? 'pool of burning oil' : source);
}
