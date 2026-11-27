import type { Problem } from '@bxvtt/shared/protocol';
import { emptyContext, type TextContext } from '@bxvtt/shared/text';
import type { CheckState } from './AdjustStep';
import { explainByAbility } from './server';

/**
 * Turns the refusal of an ability trade into what the step shows: each refusal that names a score beside that
 * score, and the rest for the whole trade.
 *
 * @param problem - The `character_invalid` problem, which has a refusal for a step up to the trade.
 * @param classId - The class the trade was checked for, which a class restriction names.
 * @param ctx - Names for the IDs in the rejections.
 */
export function explainAdjustCheck(
  problem: Problem,
  classId: string | null = null,
  ctx: TextContext = emptyContext(),
): CheckState {
  const split = explainByAbility(problem, ctx, classId);
  return { status: 'invalid', sentences: split.general, byAbility: split.byAbility };
}
