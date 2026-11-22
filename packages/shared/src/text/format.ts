/**
 * Small formatters for numbers, lists, dice, coins, distances, and game time.
 *
 * Everything here is pure and has no knowledge of bxapi. The clock arithmetic follows osrlib's `GameClock`:
 * a round is 10 seconds, a turn is 60 rounds (10 minutes), and a day is 144 turns (8,640 rounds, 24 hours).
 */

export const SECONDS_PER_ROUND = 10;
export const ROUNDS_PER_TURN = 60;
export const TURNS_PER_DAY = 144;
export const ROUNDS_PER_DAY = ROUNDS_PER_TURN * TURNS_PER_DAY;

/** Return the string with its first letter in upper case. */
export function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** Return the string with its first letter in lower case. */
export function lowerFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

/** Turn an ID or enum value such as `magic_user` or `jade-idol` into plain words such as `magic user`. */
export function prettifyId(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const IRREGULAR_PLURALS: Record<string, string> = {
  thief: 'thieves',
  wolf: 'wolves',
  dwarf: 'dwarves',
  elf: 'elves',
  halfling: 'halflings',
  man: 'men',
  woman: 'women',
  child: 'children',
  ox: 'oxen',
  mouse: 'mice',
  louse: 'lice',
  goose: 'geese',
  tooth: 'teeth',
  foot: 'feet',
  cyclops: 'cyclopes',
  djinni: 'djinn',
  swine: 'swine',
  'magic-user': 'magic-users',
};

/**
 * Regular English plural of a noun or noun phrase. A phrase such as `flask of oil` pluralizes its head noun, and
 * a phrase with a trailing bonus such as `sword +1` pluralizes the noun before it: `swords +1`.
 */
export function pluralize(noun: string): string {
  const preposition = / (?:of|with|from|for|in|on) /.exec(noun);
  if (preposition && preposition.index > 0)
    return `${pluralize(noun.slice(0, preposition.index))}${noun.slice(preposition.index)}`;
  const bonus = /^(.*[A-Za-z])(\s+[+-]\d.*)$/.exec(noun);
  if (bonus?.[1] !== undefined && bonus[2] !== undefined) return `${pluralize(bonus[1])}${bonus[2]}`;
  const lastWord = /[A-Za-z-]+$/.exec(noun)?.[0] ?? noun;
  const irregular = IRREGULAR_PLURALS[lastWord.toLowerCase()];
  if (irregular)
    return `${noun.slice(0, noun.length - lastWord.length)}${/^[A-Z]/.test(lastWord) ? capitalizeFirst(irregular) : irregular}`;
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(?:[^f]fe|[lr]f)$/i.test(noun) && !/(roof|chef|belief)$/i.test(noun)) {
    return noun.replace(/fe$/i, 'ves').replace(/f$/i, 'ves');
  }
  return `${noun}s`;
}

const IRREGULAR_SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_PLURALS).map(([singular, plural]) => [plural, singular]),
);

/**
 * Singular of an English plural noun, the reverse of `pluralize` for the nouns that game names use: `torches`
 * gives `torch`, `spikes` gives `spike`, and `rations` gives `ration`. A word that isn't a plural comes back
 * unchanged.
 */
export function singularize(noun: string): string {
  const lastWord = /[A-Za-z-]+$/.exec(noun)?.[0];
  if (lastWord === undefined) return noun;
  const head = noun.slice(0, noun.length - lastWord.length);
  const lower = lastWord.toLowerCase();
  const irregular = IRREGULAR_SINGULARS[lower];
  if (irregular) return `${head}${irregular}`;
  if (/(?:ss|us|is)$/.test(lower) || !lower.endsWith('s')) return noun;
  if (/[^aeiou]ies$/.test(lower)) return `${head}${lastWord.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|zes|sses)$/.test(lower)) return `${head}${lastWord.slice(0, -2)}`;
  if (/(?:ives|lves|rves)$/.test(lower))
    return `${head}${lastWord.slice(0, -3)}${lower.endsWith('ives') ? 'fe' : 'f'}`;
  return `${head}${lastWord.slice(0, -1)}`;
}

/** Return `1 torch` or `3 torches`. Pass `plural` for an irregular plural such as `wolves`. */
export function count(n: number, singular: string, plural?: string): string {
  return `${formatInteger(n)} ${n === 1 ? singular : (plural ?? pluralize(singular))}`;
}

/** Format an integer with thousands separators, such as `1,500`. */
export function formatInteger(n: number): string {
  return Math.trunc(n).toLocaleString('en-US');
}

/** Return the ordinal of a whole number: `1st`, `2nd`, `3rd`, `4th`, `11th`, `21st`. */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[abs % 10] ?? 'th');
  return `${Math.trunc(n)}${suffix}`;
}

/** Join items into an English list: `a`, `a and b`, `a, b, and c`. Pass `or` for a choice. */
export function joinList(items: readonly string[], conjunction: 'and' | 'or' = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}

/** Return `a` or `an` for the noun phrase that follows. */
export function indefiniteArticle(phrase: string): 'a' | 'an' {
  const word = phrase.trim().toLowerCase();
  if (/^(uni|use|usu|uri|ute|eu|one)/.test(word)) return 'a';
  if (/^(hour|honest|heir)/.test(word)) return 'an';
  return /^[aeiou]/.test(word) ? 'an' : 'a';
}

/** Prefix a noun phrase with `a` or `an`. */
export function withArticle(phrase: string): string {
  return `${indefiniteArticle(phrase)} ${phrase}`;
}

/** Format a modifier with its sign: `+2`, `-1`, `+0`. */
export function signed(n: number): string {
  return n < 0 ? `-${Math.abs(n)}` : `+${n}`;
}

/** Format a distance in feet. `short` gives the B/X notation `30'`. */
export function formatFeet(feet: number, style: 'long' | 'short' = 'long'): string {
  return style === 'short'
    ? `${formatInteger(feet)}'`
    : `${formatInteger(feet)} ${Math.abs(feet) === 1 ? 'foot' : 'feet'}`;
}

/** Normalise a dice expression such as `2D6 + 1` to `2d6+1`. Return the input trimmed when it doesn't parse. */
export function formatDice(expression: string): string {
  const compact = expression.replace(/\s+/g, '').toLowerCase();
  return /^\d*d\d+([+-]\d+)?(x\d+)?$/.test(compact) ? compact : expression.trim();
}

/** Describe the arithmetic of a roll: `2d6+1: 4 + 5, +1 = 10`. */
export function formatDiceTotal(expression: string, rolls: readonly number[], total: number): string {
  const dice = rolls.length === 0 ? '' : rolls.join(' + ');
  const modifier = /([+-]\d+)(?:x\d+)?$/.exec(formatDice(expression));
  const modifierText = modifier ? `, ${modifier[1]}` : '';
  return `${formatDice(expression)}: ${dice}${modifierText} = ${total}`;
}

export type Coins = { pp?: number; gp?: number; ep?: number; sp?: number; cp?: number };

const COIN_ORDER = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;
const COIN_NAMES: Record<(typeof COIN_ORDER)[number], [string, string]> = {
  pp: ['platinum piece', 'platinum pieces'],
  gp: ['gold piece', 'gold pieces'],
  ep: ['electrum piece', 'electrum pieces'],
  sp: ['silver piece', 'silver pieces'],
  cp: ['copper piece', 'copper pieces'],
};

/** Name one coin denomination: `gp` becomes `gold pieces` (or `gold piece` when `amount` is 1). */
export function coinName(denomination: string, amount = 2): string {
  const names = COIN_NAMES[denomination as keyof typeof COIN_NAMES];
  if (!names) return denomination;
  return amount === 1 ? names[0] : names[1];
}

/** Format a purse or a coin quantity, highest denomination first. Short style gives `25 gp, 10 sp`. */
export function formatCoins(coins: Coins, style: 'short' | 'long' = 'short'): string {
  const parts: string[] = [];
  for (const denomination of COIN_ORDER) {
    const amount = coins[denomination] ?? 0;
    if (amount === 0) continue;
    parts.push(
      style === 'short'
        ? `${formatInteger(amount)} ${denomination}`
        : `${formatInteger(amount)} ${coinName(denomination, amount)}`,
    );
  }
  return parts.length === 0 ? (style === 'short' ? '0 gp' : 'no coins') : parts.join(', ');
}

/** Format a value in gold pieces: `120 gp`. */
export function formatGold(gp: number): string {
  return `${formatInteger(gp)} gp`;
}

/** Describe a span of real time in words: `30 minutes`, `1 hour 20 minutes`, `10 seconds`. */
export function formatRealTime(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const parts: string[] = [];
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (days > 0) parts.push(count(days, 'day'));
  if (hours > 0) parts.push(count(hours, 'hour'));
  if (minutes > 0) parts.push(count(minutes, 'minute'));
  if (rest > 0 || parts.length === 0) parts.push(count(rest, 'second'));
  return parts.slice(0, 2).join(' ');
}

export type TimeUnitName = 'round' | 'turn' | 'day';

/** Convert an amount in one game time unit to rounds. */
export function toRounds(amount: number, unit: TimeUnitName): number {
  if (unit === 'round') return amount;
  if (unit === 'turn') return amount * ROUNDS_PER_TURN;
  return amount * ROUNDS_PER_DAY;
}

/**
 * Describe a duration given in rounds, using the largest game units that fit: `3 turns (30 minutes)`,
 * `1 round (10 seconds)`, `2 days`, `1 turn and 5 rounds (10 minutes 50 seconds)`.
 */
export function formatDurationRounds(rounds: number): string {
  const total = Math.max(0, Math.round(rounds));
  const days = Math.floor(total / ROUNDS_PER_DAY);
  const turns = Math.floor((total % ROUNDS_PER_DAY) / ROUNDS_PER_TURN);
  const restRounds = total % ROUNDS_PER_TURN;
  const parts: string[] = [];
  if (days > 0) parts.push(count(days, 'day'));
  if (turns > 0) parts.push(count(turns, 'turn'));
  if (restRounds > 0 || parts.length === 0) parts.push(count(restRounds, 'round'));
  const text = joinList(parts);
  if (days > 0) return text;
  return `${text} (${formatRealTime(total * SECONDS_PER_ROUND)})`;
}

/** Describe `n` units of game time: `formatDuration(3, 'turn')` gives `3 turns (30 minutes)`. */
export function formatDuration(amount: number, unit: TimeUnitName): string {
  if (unit === 'day') return count(amount, 'day');
  return formatDurationRounds(toRounds(amount, unit));
}

export interface GameClockOptions {
  /** Include seconds, as in `Day 2, 10:40:20`. */
  seconds?: boolean;
  /** The hour of day at which the game clock reads zero. Defaults to 0, which is midnight at the start of day 1. */
  startHour?: number;
}

/**
 * Format the game clock as `Day 2, 10:40`. osrlib counts rounds from the start of the game and has no
 * time of day, so day 1 begins at round 0 and each day is 8,640 rounds. Pass `startHour` to shift the dial.
 */
export function formatGameClock(clockRounds: number, options: GameClockOptions = {}): string {
  const offsetRounds = Math.round(((options.startHour ?? 0) * 3600) / SECONDS_PER_ROUND);
  const total = Math.max(0, Math.round(clockRounds)) + offsetRounds;
  const day = Math.floor(total / ROUNDS_PER_DAY) + 1;
  const secondsIntoDay = (total % ROUNDS_PER_DAY) * SECONDS_PER_ROUND;
  const hours = Math.floor(secondsIntoDay / 3600);
  const minutes = Math.floor((secondsIntoDay % 3600) / 60);
  const seconds = secondsIntoDay % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  const clock = `${two(hours)}:${two(minutes)}`;
  return `Day ${day}, ${options.seconds ? `${clock}:${two(seconds)}` : clock}`;
}

/** Whole turns that have passed at a clock reading, as osrlib's `GameClock.turns` counts them. */
export function clockTurns(clockRounds: number): number {
  return Math.floor(clockRounds / ROUNDS_PER_TURN);
}

/** Whole days that have passed at a clock reading, as osrlib's `GameClock.days` counts them. */
export function clockDays(clockRounds: number): number {
  return Math.floor(clockRounds / ROUNDS_PER_DAY);
}
