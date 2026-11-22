/**
 * The wizard's questions to the server. `POST /api/characters/check` checks the choices against the player's
 * own ability roll and reports the roll's starting gold, storing nothing and leaving the roll unused, so the
 * wizard asks it at each step and before it creates the character.
 */
import { isProblem, type BxvttClient } from '@bxvtt/shared/client';
import type { CharacterCheck, CharacterRequest, Problem } from '@bxvtt/shared/protocol';
import {
  describeRejections,
  emptyContext,
  itemPhrase,
  resolveItemNoun,
  type TextContext,
} from '@bxvtt/shared/text';
import { describeProblem, toParamMap } from '@/app';
import type { StepId } from './draft';

/**
 * Checks a set of choices against the roll they name.
 *
 * @param api - The API client.
 * @param body - The choices, with `ability_roll_id`.
 * @throws `not_found` for a roll the user doesn't have, `ability_roll_used`, or `rate_limited`.
 */
export function checkChoices(api: BxvttClient, body: CharacterRequest): Promise<CharacterCheck> {
  const { ability_roll_id: rollId, ...rest } = body;
  return api.checkCharacter({ ...rest, ability_roll_id: rollId ?? '' });
}

/** A refusal explained for the player, with the step that fixes it. */
export interface WizardProblem {
  /** The step to go back to, or `null` to stay. */
  step: StepId | null;
  title: string;
  sentences: string[];
}

function phrase(id: string, ctx: TextContext): string {
  return itemPhrase(resolveItemNoun(id, ctx));
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
        sentences: [`The shop doesn't sell ${phrase(id, ctx)}. Take it out of your cart.`],
      };
    case 'equip_item_ids':
      return {
        step: 'outfit',
        title: STEP_TITLES.outfit,
        sentences: [`You chose to equip ${phrase(id, ctx)}, but your cart doesn't have it. Buy it first.`],
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
  // A failure that never reached the rules engine loses nothing: the draft stays in this browser.
  const kept = ['server_unavailable', 'network', 'invalid_response', 'rate_limited', 'bxapi_unavailable'];
  return {
    step: null,
    title: message.title,
    sentences: kept.includes(message.code) ? [message.detail, 'Your choices are kept.'] : [message.detail],
  };
}
