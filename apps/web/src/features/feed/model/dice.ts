/**
 * Dice expressions as bxapi reads them, for the dice tray and for drawing a roll. bxapi rolls every die. This
 * module only reads an expression back so the feed knows which die to draw, and builds expressions from the tray.
 *
 * bxapi's grammar is `[count]d<sides>[+|-<modifier>][x|×|*<multiplier>]`, with one kind of die per expression.
 */
import type { RollEntry } from '@bxvtt/shared/protocol';
import type { DieSides, RolledDie } from '@/ui';

/** The dice the tray offers, in the order it shows them. */
export const TRAY_DICE: readonly DieSides[] = [4, 6, 8, 10, 12, 20, 100];

/** The most dice of one kind the tray builds. bxapi accepts up to 999. */
export const TRAY_MAX_COUNT = 99;

/** The largest modifier the tray offers, either way. */
export const TRAY_MAX_MODIFIER = 99;

/** The most dice the feed draws as faces. A larger roll shows its numbers instead. */
export const MAX_DRAWN_DICE = 12;

/** A parsed dice expression. */
export interface DiceExpression {
  count: number;
  sides: number;
  modifier: number;
  multiplier: number;
}

const EXPRESSION = /^(\d*)d(\d+|%)(?:([+-])(\d+))?(?:[x×*](\d+))?$/i;

/**
 * Reads a dice expression, such as `2d6+1`, `d%`, or `3d6x10`. It accepts what bxapi accepts and returns `null`
 * for anything else, so the composer can catch a typo before the server does.
 *
 * @param text - The expression.
 */
export function parseDiceExpression(text: string): DiceExpression | null {
  const match = EXPRESSION.exec(text.trim());
  if (!match) return null;
  const [, countText = '', sidesText = '', sign, modifierText, multiplierText] = match;
  const count = countText === '' ? 1 : Number(countText);
  const sides = sidesText === '%' ? 100 : Number(sidesText);
  if (!Number.isInteger(count) || count < 1 || count > 999) return null;
  if (!Number.isInteger(sides) || sides < 2) return null;
  const modifier = modifierText === undefined ? 0 : Number(modifierText) * (sign === '-' ? -1 : 1);
  const multiplier = multiplierText === undefined ? 1 : Number(multiplierText);
  if (multiplier < 1) return null;
  return { count, sides, modifier, multiplier };
}

/** Writes an expression the way a player would type it: `2d6+1`, `d20`, `1d100`. */
export function formatExpression(expression: DiceExpression): string {
  let text = `${expression.count}d${expression.sides}`;
  if (expression.modifier > 0) text += `+${expression.modifier}`;
  if (expression.modifier < 0) text += `-${Math.abs(expression.modifier)}`;
  if (expression.multiplier !== 1) text += `x${expression.multiplier}`;
  return text;
}

function isDrawable(sides: number): sides is DieSides {
  return (TRAY_DICE as readonly number[]).includes(sides);
}

/** What the feed shows for one roll entry: the dice to draw, the modifier, the multiplier, and the total. */
export interface RollView {
  expression: DiceExpression | null;
  /** Every die value bxapi rolled, in order. */
  values: number[];
  /** The dice as faces, when the kit can draw them and there aren't too many. */
  drawn: RolledDie[] | null;
  modifier: number;
  multiplier: number;
  total: number;
  /** `20` or `1` when the roll is a single d20 that came up 20 or 1. */
  natural: 20 | 1 | null;
}

/**
 * Describes a roll entry for display, from the server's numbers. It reads the die size from the expression,
 * because bxapi's roll result lists only the values.
 *
 * @param entry - The roll entry.
 */
export function rollView(entry: Pick<RollEntry, 'expression' | 'rolls' | 'total'>): RollView {
  const expression = parseDiceExpression(entry.expression);
  const first = entry.rolls[0];
  const values = first?.rolls ?? [];
  const modifier = first?.modifier ?? expression?.modifier ?? 0;
  const multiplier = first?.multiplier ?? expression?.multiplier ?? 1;
  const sides = expression?.sides;
  const drawn =
    sides !== undefined && isDrawable(sides) && values.length > 0 && values.length <= MAX_DRAWN_DICE
      ? values.map((value) => ({ sides, value }))
      : null;
  let natural: 20 | 1 | null = null;
  if (sides === 20 && values.length === 1) {
    if (values[0] === 20) natural = 20;
    else if (values[0] === 1) natural = 1;
  }
  return { expression, values, drawn, modifier, multiplier, total: entry.total, natural };
}

/**
 * A sentence for a screen reader: "Sam rolled 2d6+1 for damage: 4 and 3, plus 1, total 8."
 *
 * @param name - Who rolled.
 * @param entry - The roll entry.
 */
export function rollSentence(
  name: string,
  entry: Pick<RollEntry, 'expression' | 'rolls' | 'total' | 'comment'>,
): string {
  const view = rollView(entry);
  const parts: string[] = [];
  if (view.values.length > 1) parts.push(joinNumbers(view.values));
  else if (view.values.length === 1 && (view.modifier !== 0 || view.multiplier !== 1))
    parts.push(String(view.values[0]));
  if (view.modifier > 0) parts.push(`plus ${view.modifier}`);
  if (view.modifier < 0) parts.push(`minus ${Math.abs(view.modifier)}`);
  if (view.multiplier !== 1) parts.push(`times ${view.multiplier}`);
  parts.push(`total ${view.total}`);
  const comment = entry.comment.trim();
  const natural = view.natural !== null ? ` A natural ${view.natural}.` : '';
  return `${name} rolled ${entry.expression}${comment ? ` ${comment}` : ''}: ${parts.join(', ')}.${natural}`;
}

function joinNumbers(values: readonly number[]): string {
  if (values.length <= 2) return values.join(' and ');
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

/** The dice tray's choice: one kind of die, a count, and a modifier. */
export interface TrayState {
  sides: DieSides | null;
  count: number;
  modifier: number;
}

export const EMPTY_TRAY: TrayState = { sides: null, count: 0, modifier: 0 };

/**
 * Adds a die to the tray. A die of the kind already chosen adds one more. A different kind starts over with one
 * die of that kind, because bxapi rolls one kind of die per expression.
 */
export function addDie(tray: TrayState, sides: DieSides): TrayState {
  if (tray.sides === sides) return { ...tray, count: Math.min(TRAY_MAX_COUNT, tray.count + 1) };
  return { ...tray, sides, count: 1 };
}

/** The tray's expression, or `null` while it has no dice. */
export function trayExpression(tray: TrayState): string | null {
  if (tray.sides === null || tray.count < 1) return null;
  return formatExpression({ count: tray.count, sides: tray.sides, modifier: tray.modifier, multiplier: 1 });
}
