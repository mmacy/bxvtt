import type { components } from '../bxapi';

/** Any event that a bxapi command outcome or event page can contain. */
export type GameEvent = components['schemas']['CommandOutcome']['events'][number];

/** A rejection from a refused command, or from a refused character creation step. */
export type GameRejection = components['schemas']['Rejection'];

/**
 * An event this version of the text layer doesn't know. bxapi can add event types before this module does, so
 * `describeEvent` accepts any object with an `event_type` and a `code`.
 */
export interface LooseEvent {
  event_type: string;
  code: string;
  visibility?: string;
  [key: string]: unknown;
}

/** What a line of the game log is about, for filtering. */
export type EventCategory =
  | 'movement'
  | 'exploration'
  | 'door'
  | 'encounter'
  | 'battle'
  | 'damage'
  | 'healing'
  | 'death'
  | 'magic'
  | 'item'
  | 'treasure'
  | 'xp'
  | 'quest'
  | 'journal'
  | 'time'
  | 'light'
  | 'town'
  | 'referee'
  | 'system';

export const EVENT_CATEGORIES: readonly EventCategory[] = [
  'movement',
  'exploration',
  'door',
  'encounter',
  'battle',
  'damage',
  'healing',
  'death',
  'magic',
  'item',
  'treasure',
  'xp',
  'quest',
  'journal',
  'time',
  'light',
  'town',
  'referee',
  'system',
];

/** How a line reads from the party's side of the table: neutral, good, bad, danger, or info. */
export type EventTone = 'neutral' | 'good' | 'bad' | 'danger' | 'info';

/** A hint for which icon to draw beside a line. The interface maps each name to a glyph. */
export type EventIcon =
  | 'step'
  | 'turn'
  | 'stairs'
  | 'door'
  | 'lock'
  | 'ear'
  | 'search'
  | 'trap'
  | 'torch'
  | 'monsters'
  | 'run'
  | 'sword'
  | 'shield'
  | 'arrow'
  | 'dice'
  | 'wound'
  | 'heart'
  | 'skull'
  | 'spell'
  | 'book'
  | 'holy'
  | 'scroll'
  | 'potion'
  | 'wand'
  | 'coins'
  | 'chest'
  | 'gem'
  | 'star'
  | 'level'
  | 'quest'
  | 'journal'
  | 'clock'
  | 'town'
  | 'referee'
  | 'info'
  | 'flag'
  | 'party'
  | 'rest'
  | 'food'
  | 'warning';

/** One line of the game log. */
export interface EventLine {
  /** The line as a referee would narrate it, in a sentence or two. */
  text: string;
  /** Dice and numbers behind the line (attack roll, target number, damage dice), for display on demand. */
  detail?: string;
  category: EventCategory;
  tone: EventTone;
  icon: EventIcon;
  /** IDs of the party members, monsters, and monster groups that the line is about, actor first. */
  actorIds: string[];
  /** The main number of the line, such as the damage dealt or the experience gained. */
  amount?: number;
  /** The event's code, such as `combat.attack.hit`. For filtering and tests, never for display. */
  code: string;
  /** The event's type, such as `attack_rolled`. */
  eventType: string;
  /** Who may see the event. A line with `referee` visibility must never reach a player. */
  visibility: 'player' | 'referee';
}
