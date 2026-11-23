/**
 * The wizard's questions to the server. `POST /api/characters/check` checks the choices against the player's
 * own ability roll, storing nothing and leaving the roll unused, so the wizard asks it at each step and before it
 * creates the character.
 */
import { isProblem, type BxvttClient } from '@bxvtt/shared/client';
import type { CharacterCheck, CharacterRequest, Problem } from '@bxvtt/shared/protocol';
import {
  classLabel,
  describeRejections,
  emptyContext,
  itemPhrase,
  resolveItemNoun,
  withArticle,
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

/** Codes that say an ability can't move in that direction at all. */
const BLOCKED = new Set([
  'creation.adjustment.not_lowerable',
  'creation.adjustment.prime_requisite_lowered',
  'creation.adjustment.class_restriction',
  'creation.adjustment.raise_not_prime_requisite',
]);

/**
 * Drops the lesser reasons for an ability that can't be traded at all, so "Dexterity can't be lowered" isn't
 * followed by advice on how far to lower it.
 */
export function oneReasonPerAbility<R extends { code: string; params: Record<string, unknown> }>(
  rejections: readonly R[],
): R[] {
  const blocked = new Set(
    rejections.filter((r) => BLOCKED.has(r.code)).map((r) => String(r.params.ability ?? '')),
  );
  return rejections.filter(
    (r) =>
      BLOCKED.has(r.code) ||
      !r.code.startsWith('creation.adjustment.') ||
      !blocked.has(String(r.params.ability ?? '')),
  );
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
  class: 'Choose an eligible class',
  adjust: 'Check your ability score adjustments',
  identity: 'Check your character details',
  hp_gold: 'Roll your hit points and gold',
  outfit: 'Check your starting equipment',
  review: "Couldn't create character",
};

/**
 * Explains a `character_invalid` problem: what is wrong in the game's terms, and the step that fixes it.
 *
 * @param problem - The problem document.
 * @param ctx - Names for the IDs in the rejections.
 */
export function explainInvalid(problem: Problem, ctx: TextContext = emptyContext()): WizardProblem {
  const rejections = oneReasonPerAbility(problem.rejections ?? []);
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
        sentences: ['Choose one of the available classes.'],
      };
    case 'purchases':
      return {
        step: 'outfit',
        title: STEP_TITLES.outfit,
        sentences: [`You can't buy ${phrase(id, ctx)} here. Remove it from your cart.`],
      };
    case 'equip_item_ids':
      return {
        step: 'outfit',
        title: STEP_TITLES.outfit,
        sentences: [
          `You chose to equip ${phrase(id, ctx)}, which isn't in your cart. Add it to your cart first.`,
        ],
      };
    default:
      return {
        step: 'review',
        title: STEP_TITLES.review,
        sentences: ['One of your choices is not valid for this character. Review each step and try again.'],
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
      title: 'You already used this ability roll',
      sentences: ['Each ability roll can create one character. Roll new ability scores to create another.'],
    };
  }
  if (isProblem(error, 'not_found')) {
    return {
      step: 'roll',
      title: 'Your ability roll expired',
      sentences: ['Roll new ability scores to continue.'],
    };
  }
  if (isProblem(error, 'ability_roll_locked')) {
    const classId = error.problem.class_id;
    return {
      step: 'class',
      title: 'Your class is fixed for these ability scores',
      sentences: [
        classId === undefined
          ? 'You already rolled hit points for these ability scores, which fixed your class and the reroll option.'
          : `You already rolled hit points as ${withArticle(classLabel(classId).toLowerCase())}, which fixed your class and the reroll option.`,
        'To play another class, select Start over and roll new ability scores.',
      ],
    };
  }
  if (isProblem(error, 'hit_points_not_rolled')) {
    return {
      step: 'hp_gold',
      title: 'Roll your hit points first',
      sentences: ['You roll your starting gold after your hit points.'],
    };
  }
  if (isProblem(error, 'gold_not_rolled')) {
    return {
      step: 'hp_gold',
      title: 'Roll your starting gold first',
      sentences: ['Roll your starting gold so you know how much you can spend, then choose your equipment.'],
    };
  }
  if (isProblem(error, 'validation_error')) {
    return {
      step: 'identity',
      title: 'Enter a valid character name',
      sentences: ['Use 1 to 100 characters without tabs, line breaks, or text direction marks.'],
    };
  }
  const message = describeProblem(error);
  // A failure that never reached the server loses nothing: the draft stays in this browser.
  const kept = ['server_unavailable', 'network', 'invalid_response', 'rate_limited', 'bxapi_unavailable'];
  return {
    step: null,
    title: message.title,
    sentences: kept.includes(message.code)
      ? [message.detail, 'Your draft is still saved in this browser.']
      : [message.detail],
  };
}

/**
 * Splits the refusals of a trade of ability points by the score each names, so each reason shows next to its
 * score, and the rest (such as points that don't add up) show once for the whole trade.
 *
 * @param problem - The `character_invalid` problem.
 * @param ctx - Names for the IDs in the rejections.
 */
export function explainByAbility(
  problem: Problem,
  ctx: TextContext = emptyContext(),
): { byAbility: Partial<Record<string, string[]>>; general: string[] } {
  const byAbility: Partial<Record<string, string[]>> = {};
  const general: string[] = [];
  for (const rejection of oneReasonPerAbility(problem.rejections ?? [])) {
    const [sentence] = describeRejections(
      [{ code: rejection.code, params: toParamMap(rejection.params) }],
      ctx,
    );
    if (!sentence) continue;
    const ability = rejection.params.ability;
    if (typeof ability === 'string') (byAbility[ability] ??= []).push(sentence);
    else general.push(sentence);
  }
  return { byAbility, general };
}
