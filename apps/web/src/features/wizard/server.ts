/**
 * The wizard's questions to the server.
 *
 * bxapi keeps an ability roll's seed secret, and the roll's seed decides the hit points and the starting gold.
 * The preview route (`POST /api/characters/preview`) can't use a stored roll, so it would answer about different
 * scores. To check choices against the player's own roll, the wizard asks `POST /api/characters` for a *dry
 * run*: the real choices, plus one item to equip that the purchases don't include. bxapi runs creation in a fixed
 * order (class, adjustment, spells, hit points, languages, gold, purchases, then equipping), so every real choice
 * is checked before the extra item, and the extra item always stops creation with `character_invalid`. A failed
 * creation stores nothing and leaves the roll unused, as bxapi's spec states.
 */
import { isProblem, type BxvttClient } from '@bxvtt/shared/client';
import type { CharacterRequest, Problem, StoredCharacter } from '@bxvtt/shared/protocol';
import { describeRejections, emptyContext, itemName, type TextContext } from '@bxvtt/shared/text';
import { describeProblem } from '@/app';
import type { StepId } from './draft';
import { toParamMap } from './tables';

/** The item to equip that no purchase ever includes, which ends a dry run after every real check. */
export const DRY_RUN_SENTINEL = 'bxvtt-wizard-dry-run';

/** What a dry run found. */
export type DryRunResult =
  /** Every choice passed. */
  | { kind: 'ok' }
  /** A choice breaks a rule. */
  | { kind: 'invalid'; problem: Problem }
  /** The server stored a character after all. Treat it as created. */
  | { kind: 'created'; character: StoredCharacter };

/**
 * Asks the server whether a set of choices would make a character from the player's roll, storing nothing.
 *
 * @param api - The API client.
 * @param body - The choices.
 * @throws Any error other than `character_invalid`, such as a used roll or a network failure.
 */
export async function dryRun(api: BxvttClient, body: CharacterRequest): Promise<DryRunResult> {
  try {
    const character = await api.createCharacter({
      ...body,
      equip_item_ids: [...(body.equip_item_ids ?? []), DRY_RUN_SENTINEL],
    });
    return { kind: 'created', character };
  } catch (error) {
    if (!isProblem(error, 'character_invalid')) throw error;
    const problem = error.problem;
    if (problem.field === 'equip_item_ids' && problem.id === DRY_RUN_SENTINEL) return { kind: 'ok' };
    return { kind: 'invalid', problem };
  }
}

/** The result of {@link countGold}. */
export type GoldResult = { kind: 'gold'; gp: number } | { kind: 'invalid'; problem: Problem };

/**
 * Finds the starting gold that the roll gives these choices, by asking whether the gold covers a number of
 * 1 gp lots of an item and halving the range each time. Each question is a dry run, so nothing is stored.
 *
 * @param api - The API client.
 * @param body - The choices up to the outfit, without purchases.
 * @param probeItemId - An item that costs exactly 1 gp a lot, such as `torch`.
 * @returns The gold in gold pieces, or the problem that stopped creation before the gold roll.
 */
export async function countGold(
  api: BxvttClient,
  body: CharacterRequest,
  probeItemId: string,
): Promise<GoldResult> {
  const { purchases: _purchases, equip_item_ids: _equip, ...base } = body;
  /** Whether the gold covers `lots` gold pieces, or the problem that stops creation first. */
  const covers = async (lots: number): Promise<boolean | Problem> => {
    const result = await dryRun(api, { ...base, purchases: [{ item_id: probeItemId, quantity: lots }] });
    if (result.kind !== 'invalid') return true;
    const codes = result.problem.rejections?.map((r) => r.code) ?? [];
    if (codes.length > 0 && codes.every((code) => code === 'items.purchase.insufficient_funds')) return false;
    return result.problem;
  };
  const first = await covers(1);
  if (typeof first !== 'boolean') return { kind: 'invalid', problem: first };
  if (!first) return { kind: 'gold', gp: 0 };
  // `low` is always covered, and `high` never is.
  let low = 1;
  let high = 256;
  for (;;) {
    const answer = await covers(high);
    if (typeof answer !== 'boolean') return { kind: 'invalid', problem: answer };
    if (!answer) break;
    low = high;
    if (high >= 10_000) return { kind: 'gold', gp: high };
    high = Math.min(10_000, high * 2);
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    const answer = await covers(middle);
    if (typeof answer !== 'boolean') return { kind: 'invalid', problem: answer };
    if (answer) low = middle;
    else high = middle;
  }
  return { kind: 'gold', gp: low };
}

/** A refusal explained for the player, with the step that fixes it. */
export interface WizardProblem {
  /** The step to go back to, or `null` to stay. */
  step: StepId | null;
  title: string;
  sentences: string[];
}

function stepForCode(code: string): StepId {
  if (code.startsWith('creation.class.')) return 'class';
  if (code.startsWith('creation.adjustment.')) return 'adjust';
  if (code.startsWith('creation.languages.') || code.startsWith('magic.book.')) return 'identity';
  if (code.startsWith('items.')) return 'outfit';
  return 'review';
}

const STEP_TITLES: Record<StepId, string> = {
  roll: 'Roll new ability scores',
  class: 'This class needs a change',
  adjust: "The trade of ability points doesn't work",
  identity: 'A choice about who your character is needs a change',
  outfit: 'The shopping list needs a change',
  review: "The character couldn't be made",
};

/**
 * Explains a `character_invalid` problem: what is wrong in the game's terms, and the step that fixes it.
 *
 * @param problem - The problem document.
 * @param ctx - Names for the IDs in the rejections.
 */
export function explainInvalid(problem: Problem, ctx: TextContext = emptyContext()): WizardProblem {
  const rejections = problem.rejections ?? [];
  if (rejections.length > 0) {
    const first = rejections[0];
    const step = first ? stepForCode(first.code) : 'review';
    const sentences = describeRejections(
      rejections.map((r) => ({ code: r.code, params: toParamMap(r.params) })),
      ctx,
    );
    return { step, title: STEP_TITLES[step], sentences };
  }
  const id = typeof problem.id === 'string' ? problem.id : '';
  switch (problem.field) {
    case 'class_id':
      return {
        step: 'class',
        title: STEP_TITLES.class,
        sentences: ["The rules don't have that class. Pick one of the classes listed."],
      };
    case 'purchases':
      return {
        step: 'outfit',
        title: STEP_TITLES.outfit,
        sentences: [`The shop doesn't sell ${itemName(id, ctx)}. Take it out of your cart.`],
      };
    case 'equip_item_ids':
      return {
        step: 'outfit',
        title: STEP_TITLES.outfit,
        sentences: [`You chose to equip ${itemName(id, ctx)}, but your cart doesn't have it. Buy it first.`],
      };
    default:
      return {
        step: 'review',
        title: STEP_TITLES.review,
        sentences: ['The rules engine refused one of the choices. Check each step and try again.'],
      };
  }
}

/**
 * Explains any error from creating or checking a character.
 *
 * @param error - The value from a `catch`.
 * @param ctx - Names for the IDs in rejections.
 */
export function explainCreationError(error: unknown, ctx?: TextContext): WizardProblem {
  if (isProblem(error, 'character_invalid')) return explainInvalid(error.problem, ctx);
  if (isProblem(error, 'ability_roll_used')) {
    return {
      step: 'roll',
      title: 'These scores already made a character',
      sentences: ['Each roll makes one character. Roll new ability scores to make another.'],
    };
  }
  if (isProblem(error, 'not_found')) {
    return {
      step: 'roll',
      title: 'This server no longer has your roll',
      sentences: ['Roll new ability scores to start again.'],
    };
  }
  if (isProblem(error, 'validation_error')) {
    return {
      step: 'identity',
      title: "The name can't be used",
      sentences: ['Use 1 to 100 characters, with no tabs, line breaks, or text direction marks.'],
    };
  }
  const message = describeProblem(error);
  return { step: null, title: message.title, sentences: [message.detail] };
}
