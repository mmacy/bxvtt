/**
 * The rules for the lower and raise controls of the ability trade step, from bxapi's `adjustment_limits`.
 *
 * bxapi states every limit: how far each score can go, the points a step of lowering takes and buys, and the most
 * points a trade buys. This module only compares the current trade with those numbers, so it decides nothing about
 * which scores a class can trade.
 */
import type { AdjustmentLimits } from '@bxvtt/shared/protocol';
import { count, describeRejection } from '@bxvtt/shared/text';
import { toParamMap } from '@/app';
import type { Adjustment } from './draft';
import { ABILITIES, type Ability, type Scores } from './tables';

/** One lower or raise control. */
export interface TradeControl {
  enabled: boolean;
  /** The trade after a click, or `null` when the control is disabled. */
  next: Adjustment | null;
  /** Why the control is disabled, or `null` when it's enabled or the limits are still loading. */
  reason: string | null;
}

/** The two controls of one ability. */
export interface TradeRow {
  lower: TradeControl;
  raise: TradeControl;
}

/** The points of a trade: bought by lowering, spent by raising, and the difference either way. */
export interface TradeBalance {
  bought: number;
  spent: number;
  /** The points bought and not yet spent. */
  unspent: number;
  /** The points spent beyond those bought. */
  short: number;
}

/**
 * bxapi's limits on the trade for one roll and class, as the step reads them. After a failure, `detail` is the
 * problem's title and detail from `describeProblem`, as one paragraph.
 */
export type LimitsState =
  | { status: 'loading' }
  | { status: 'ready'; limits: AdjustmentLimits }
  | { status: 'failed'; detail: string };

/** The status of the latest check of the trade. */
export type CheckStatus = 'idle' | 'checking' | 'ok' | 'invalid' | 'failed';

/**
 * What the step shows about the trade as a whole. `unavailable` is a trade the step can't count because the limits
 * failed to load, so only the check decides whether the player can continue with it. `unchecked` is a balanced
 * trade whose check got no answer, so the step shows no verdict for it.
 */
export type TradeStatus =
  | { kind: 'untraded' }
  | { kind: 'unspent'; points: number }
  | { kind: 'short'; points: number }
  | { kind: 'checking' }
  | { kind: 'invalid' }
  | { kind: 'complete' }
  | { kind: 'unchecked' }
  | { kind: 'unavailable'; check: CheckStatus };

/** The reason on a raise control while the trade has no point to spend. bxapi has no code for it. */
export const NO_POINT_REASON = 'Lower a score first to gain a point.';

/** What the rules read. */
export interface TradeInput {
  /** bxapi's limits, or `null` while they load or after they fail to load. */
  limits: AdjustmentLimits | null;
  /** The rolled scores. */
  scores: Scores;
  adjustment: Adjustment;
  /** The class the player chose, which names the class in a class restriction. */
  classId: string | null;
  /** The class's prime requisites, from its class entry. */
  primes: readonly string[];
}

const DISABLED: TradeControl = { enabled: false, next: null, reason: null };

/** An adjustment with one ability's lowered or raised amount set. An amount of 0 removes the ability. */
function withAmount(
  adjustment: Adjustment,
  side: keyof Adjustment,
  ability: Ability,
  amount: number,
): Adjustment {
  const map = { ...adjustment[side] };
  if (amount > 0) map[ability] = amount;
  else delete map[ability];
  return { ...adjustment, [side]: map };
}

function hasTrade(adjustment: Adjustment): boolean {
  return ABILITIES.some((a) => (adjustment.lowered[a] ?? 0) > 0 || (adjustment.raised[a] ?? 0) > 0);
}

/**
 * Whether bxapi's limits can produce a trade by whole steps of the controls: each lowered amount is a multiple of
 * `lower_step` that leaves the score at `lowest` or above, each raised amount is a multiple of `raise_step` that
 * leaves the score at `highest` or below, no ability is both lowered and raised, and neither the points bought
 * nor the points spent pass `max_points`. A trade that fits can still be unbalanced, because the player can finish
 * it with the controls.
 *
 * @param limits - bxapi's limits.
 * @param scores - The rolled scores.
 * @param adjustment - The trade.
 */
export function tradeFits(limits: AdjustmentLimits, scores: Scores, adjustment: Adjustment): boolean {
  for (const ability of ABILITIES) {
    const lowered = adjustment.lowered[ability] ?? 0;
    const raised = adjustment.raised[ability] ?? 0;
    if (lowered === 0 && raised === 0) continue;
    const entry = limits.abilities[ability];
    if (entry === undefined || lowered < 0 || raised < 0 || (lowered > 0 && raised > 0)) return false;
    if (lowered % limits.lower_step !== 0 || scores[ability] - lowered < entry.lowest) return false;
    if (raised % limits.raise_step !== 0 || scores[ability] + raised > entry.highest) return false;
  }
  const { bought, spent } = tradeBalance(limits, adjustment);
  return bought <= limits.max_points && spent <= limits.max_points;
}

/**
 * The trade to keep once the limits arrive: the trade itself when it fits them (see
 * [`tradeFits`][tradeFits]), or no trade. A draft saved by an earlier version of the step can hold a trade the
 * controls can't produce, such as Intelligence lowered by 1, which bxapi would refuse.
 *
 * @param limits - bxapi's limits.
 * @param scores - The rolled scores.
 * @param adjustment - The trade from the draft.
 * @returns The same object when it fits, so a caller can tell nothing changed.
 */
export function fitTrade(limits: AdjustmentLimits, scores: Scores, adjustment: Adjustment): Adjustment {
  return tradeFits(limits, scores, adjustment) ? adjustment : { lowered: {}, raised: {} };
}

/**
 * Counts the points of a trade: `raise_step` for each `lower_step` lowered, and the points raised.
 *
 * @param limits - bxapi's limits.
 * @param adjustment - The trade.
 */
export function tradeBalance(limits: AdjustmentLimits, adjustment: Adjustment): TradeBalance {
  let bought = 0;
  let spent = 0;
  for (const ability of ABILITIES) {
    bought += Math.floor((adjustment.lowered[ability] ?? 0) / limits.lower_step) * limits.raise_step;
    spent += adjustment.raised[ability] ?? 0;
  }
  return { bought, spent, unspent: Math.max(0, bought - spent), short: Math.max(0, spent - bought) };
}

/** Renders one of bxapi's reasons with the params the wizard merges in. */
function reasonText(
  reason: { code: string; params: Record<string, unknown> },
  merged: Record<string, number>,
  input: TradeInput,
): string {
  const params = { ...toParamMap(reason.params), ...merged };
  const [prime] = input.primes;
  const extra = {
    ...(input.primes.length === 1 && prime !== undefined ? { prime } : {}),
    ...(reason.code === 'creation.adjustment.class_restriction' && input.classId !== null
      ? { class: input.classId }
      : {}),
  };
  return describeRejection({ code: reason.code, params: { ...params, ...extra } });
}

/**
 * The lower and raise controls of every ability, by the spec's control rules. An undo is always enabled: the
 * raise control of a lowered ability gives back `lower_step`, and the lower control of a raised one takes back
 * `raise_step`. While the limits load or after they fail, every control is disabled with no reason.
 *
 * @param input - The limits, the rolled scores, the trade, and the class.
 */
export function tradeControls(input: TradeInput): Record<Ability, TradeRow> {
  const { limits, scores, adjustment } = input;
  const rows = {} as Record<Ability, TradeRow>;
  const balance = limits === null ? null : tradeBalance(limits, adjustment);
  for (const ability of ABILITIES) {
    const entry = limits?.abilities[ability];
    if (limits === null || balance === null || entry === undefined) {
      rows[ability] = { lower: DISABLED, raise: DISABLED };
      continue;
    }
    const lowered = adjustment.lowered[ability] ?? 0;
    const raised = adjustment.raised[ability] ?? 0;
    const score = scores[ability] - lowered + raised;

    let lower: TradeControl;
    if (raised > 0) {
      lower = {
        enabled: true,
        next: withAmount(adjustment, 'raised', ability, raised - limits.raise_step),
        reason: null,
      };
    } else if (
      score - limits.lower_step >= entry.lowest &&
      balance.bought + limits.raise_step <= limits.max_points
    ) {
      lower = {
        enabled: true,
        next: withAmount(adjustment, 'lowered', ability, lowered + limits.lower_step),
        reason: null,
      };
    } else {
      lower = {
        enabled: false,
        next: null,
        reason:
          score - limits.lower_step < entry.lowest
            ? // A score no trade can lower has no lowest to state, so its reason reads without one.
              reasonText(entry.lowest_reason, entry.can_lower ? { lowest: entry.lowest } : {}, input)
            : reasonText(limits.max_points_reason, {}, input),
      };
    }

    let raise: TradeControl;
    if (lowered > 0) {
      raise = {
        enabled: true,
        next: withAmount(adjustment, 'lowered', ability, lowered - limits.lower_step),
        reason: null,
      };
    } else if (score + limits.raise_step <= entry.highest && balance.unspent >= limits.raise_step) {
      raise = {
        enabled: true,
        next: withAmount(adjustment, 'raised', ability, raised + limits.raise_step),
        reason: null,
      };
    } else {
      raise = {
        enabled: false,
        next: null,
        reason:
          score + limits.raise_step > entry.highest
            ? // above_cap comes only where the cap stops the score, so its highest is the cap itself. No other
              // highest_reason reads the number.
              reasonText(
                entry.highest_reason,
                entry.highest_reason.code === 'creation.adjustment.above_cap'
                  ? { highest: entry.highest }
                  : {},
                input,
              )
            : // Lowering another score buys a point only while the trade has bought fewer than max_points.
              balance.bought + limits.raise_step > limits.max_points
              ? reasonText(limits.max_points_reason, {}, input)
              : NO_POINT_REASON,
      };
    }
    rows[ability] = { lower, raise };
  }
  return rows;
}

/**
 * The lead sentence once the limits load: the exchange rate, or, when no trade is possible, why.
 *
 * @param input - The limits, which must be loaded, and the class.
 */
export function tradeLead(input: TradeInput & { limits: AdjustmentLimits }): string {
  const { limits } = input;
  if (!limits.can_trade) return reasonText(limits.max_points_reason, {}, input);
  return `Lowering a score by ${limits.lower_step} raises a prime requisite by ${limits.raise_step}.`;
}

/**
 * What the step shows about the whole trade. The points the client counts come first, because a trade the player
 * hasn't balanced is still in progress, and bxapi refuses it only because the points don't add up. While the
 * limits load, a trade shows as being checked, because the step can't count its points yet.
 *
 * @param limits - bxapi's limits, as the step reads them.
 * @param adjustment - The trade.
 * @param check - The status of the latest check of the trade.
 */
export function tradeStatus(limits: LimitsState, adjustment: Adjustment, check: CheckStatus): TradeStatus {
  if (!hasTrade(adjustment)) return { kind: 'untraded' };
  if (limits.status === 'loading') return { kind: 'checking' };
  if (limits.status === 'failed') return { kind: 'unavailable', check };
  const balance = tradeBalance(limits.limits, adjustment);
  if (balance.unspent > 0) return { kind: 'unspent', points: balance.unspent };
  if (balance.short > 0) return { kind: 'short', points: balance.short };
  if (check === 'invalid') return { kind: 'invalid' };
  if (check === 'ok') return { kind: 'complete' };
  // The check got no answer, so nothing was refused. Continue runs the check again and says if it fails.
  if (check === 'failed') return { kind: 'unchecked' };
  return { kind: 'checking' };
}

/**
 * Whether the step asks bxapi to check the trade: a balanced trade once the limits load, or any trade when they
 * failed to load. An unbalanced trade needs no check, because its status comes from the points the step counts.
 *
 * @param limits - bxapi's limits, as the step reads them.
 * @param adjustment - The trade.
 */
export function tradeNeedsCheck(limits: LimitsState, adjustment: Adjustment): boolean {
  if (!hasTrade(adjustment)) return false;
  if (limits.status === 'failed') return true;
  if (limits.status === 'loading') return false;
  const balance = tradeBalance(limits.limits, adjustment);
  return balance.unspent === 0 && balance.short === 0;
}

/** The status badge's text, or `null` for a status the badge doesn't show. */
export function tradeStatusLabel(status: TradeStatus): string | null {
  switch (status.kind) {
    case 'unspent':
      return `${count(status.points, 'point')} to spend`;
    case 'short':
      return `${count(status.points, 'point')} short`;
    case 'invalid':
      return 'Not allowed';
    case 'complete':
      return 'Trade complete';
    default:
      return null;
  }
}

/**
 * Why Continue is disabled on the trade step: a reason, `{ reason: null }` to wait for a check, or `null` when the
 * player can continue.
 *
 * @param status - The trade's status.
 */
export function tradeContinueBlock(status: TradeStatus): { reason: string | null } | null {
  switch (status.kind) {
    case 'unspent':
      return { reason: 'Spend your points on a prime requisite, or reset your scores.' };
    case 'short':
      return { reason: 'Lower a score to pay for what you raised, or reset your scores.' };
    case 'invalid':
      return { reason: 'Change the trade, or reset your scores.' };
    case 'checking':
      return { reason: null };
    case 'unavailable':
      // The limits failed to load, so only the check can pass the trade.
      if (status.check === 'ok') return null;
      return status.check === 'invalid' || status.check === 'failed'
        ? { reason: 'Try again to check the trade, or reset your scores.' }
        : { reason: null };
    default:
      return null;
  }
}

/**
 * The label of the footer's primary button on the trade step. With no trade possible, skipping isn't a choice the
 * player has.
 *
 * @param limits - bxapi's limits, as the step reads them.
 * @param status - The trade's status.
 */
export function tradeContinueLabel(limits: LimitsState, status: TradeStatus): string {
  const noTrade = limits.status === 'ready' && !limits.limits.can_trade;
  return status.kind === 'untraded' && !noTrade ? 'Skip this step' : 'Continue';
}
