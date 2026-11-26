import type { CharacterCheck, CharacterCheckRequest, Problem, User } from '@bxvtt/shared/protocol';
import { BxapiProblem, toApiError } from './bxapi';
import type { BxapiProblemBody } from './bxapi';
import { problemBody } from './errors';
import type { StartingRollKeeper } from './starting-rolls';

/**
 * Checks character choices against a stored ability roll and its recorded rules without creating the character,
 * with one bxapi preview. The preview stores nothing and leaves the roll unused, and the check returns only whether the choices
 * pass, so it never reveals the hit points or the gold. The starting rolls decide which checks the server accepts:
 * see {@link StartingRollKeeper.guard}.
 */
export class CharacterChecker {
  /**
   * @param rolls - The starting rolls of each ability roll.
   */
  constructor(private readonly rolls: StartingRollKeeper) {}

  /**
   * Checks choices against a roll the user owns.
   *
   * @param user - The user, who owns the roll.
   * @param body - The choices, with `ability_roll_id`.
   * @param requestId - The request ID, for bxapi's log.
   * @throws ApiError `not_found`, `ability_roll_superseded`, `ability_roll_locked`, `gold_not_rolled`,
   *   `ability_roll_used`, `validation_error`, or a bxapi failure.
   */
  async check(user: User, body: CharacterCheckRequest, requestId: string): Promise<CharacterCheck> {
    const { ability_roll_id: rollId, ...choices } = body;
    const record = this.rolls.guard(rollId, user.id, body);
    try {
      await this.rolls.preview(record, choices, requestId);
      return { valid: true, problem: null };
    } catch (error) {
      if (error instanceof BxapiProblem && error.code === 'character_invalid') {
        return { valid: false, problem: toProblemDocument(error.body, requestId) };
      }
      throw toApiError(error, { passNotFound: true });
    }
  }
}

/** Turns bxapi's `character_invalid` problem into a bxvtt problem document with its extra members intact. */
function toProblemDocument(body: BxapiProblemBody, requestId: string): Problem {
  const {
    code,
    detail,
    status,
    type: _type,
    title: _title,
    request_id: _requestId,
    instance: _instance,
    ...extras
  } = body;
  return problemBody(status, code, detail, requestId, extras) as Problem;
}
