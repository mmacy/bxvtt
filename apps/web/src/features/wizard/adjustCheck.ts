import type { Problem } from '@bxvtt/shared/protocol';
import { describeTradeGuidance, emptyContext, isTradeInProgress, type TextContext } from '@bxvtt/shared/text';
import { toParamMap } from '@/app';
import type { AdjustCheckState } from './AdjustStep';
import { explainByAbility, oneReasonPerAbility } from './server';

const NOT_EVEN = 'creation.adjustment.reduction_not_even';

/**
 * Turns the refusal of an ability trade into what the step shows.
 *
 * A trade the player is still making (see `isTradeInProgress`) becomes guidance about the next step. Any other
 * refusal is a wrong choice and becomes a warning, so a refusal this code doesn't know is a warning. When a trade
 * has both kinds, the warning wins and shows the wrong choices alone, because the player fixes those first.
 *
 * @param problem - The `character_invalid` problem, which has a refusal for a step up to the trade.
 * @param ctx - Names for the IDs in the rejections.
 */
export function explainAdjustCheck(problem: Problem, ctx: TextContext = emptyContext()): AdjustCheckState {
  const rejections = oneReasonPerAbility(problem.rejections ?? []);
  const wrong = rejections.filter((r) => !isTradeInProgress(r.code));
  if (wrong.length > 0 || rejections.length === 0) {
    const split = explainByAbility(wrong.length > 0 ? { ...problem, rejections: wrong } : problem, ctx);
    return { status: 'invalid', sentences: split.general, byAbility: split.byAbility };
  }
  // The points that don't add up follow from a lowered amount that isn't even, so the odd amount comes first.
  const unfinished = rejections.some((r) => r.code === NOT_EVEN)
    ? rejections.filter((r) => r.code === NOT_EVEN)
    : rejections;
  const guidance = unfinished.map((r) =>
    describeTradeGuidance({ code: r.code, params: toParamMap(r.params) }, ctx),
  );
  return { status: 'in_progress', guidance: [...new Set(guidance)] };
}
