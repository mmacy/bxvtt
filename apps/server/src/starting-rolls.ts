import type { AdjustmentLimits, CharacterPreview } from '@bxvtt/shared/bxapi';
import type {
  AbilityRoll,
  CharacterChoices,
  StartingRollRequest,
  StartingRolls,
  StartingRollsStatus,
} from '@bxvtt/shared/protocol';
import type { AbilityRollStore, RollRecord } from './ability-rolls';
import { callBxapi } from './bxapi';
import type { Context } from './context';
import { ApiError } from './errors';
import { now } from './ids';
import { creationRulesOf } from './rulesets';

/** The choices of a bxapi preview: creation's body without `ability_roll_id`, which the path names. */
export type PreviewChoices = CharacterChoices;

/** The choices that decide the hit points and the gold, and the ones that would reveal the gold. */
interface GuardedChoices {
  class_id: string;
  purchases?: readonly unknown[];
  equip_item_ids?: readonly unknown[];
}

/**
 * The body bxapi gets for a roll's preview or creation: the choices with the roll's recorded ruleset. Any rule a
 * client sent, and a seed, which bxapi refuses beside a roll, fall away.
 *
 * @param choices - The choices.
 * @param record - The roll.
 */
export function bxapiChoices(choices: PreviewChoices, record: RollRecord): Record<string, unknown> {
  const {
    ruleset: _ruleset,
    seed: _seed,
    hp_reroll_at_first_level: _reroll,
    ability_roll_id: _roll,
    ...rest
  } = choices;
  return { ...rest, ruleset: record.rules.ruleset };
}

/**
 * Keeps the starting rolls of each ability roll: the hit points and the gold that a character made from the roll
 * starts with. bxapi derives both from the roll's private seed, and its preview returns the same dice for the same
 * class and ruleset every time, so the server stores no dice. It records only that the player rolled them. The
 * ruleset is the one recorded on the roll, so a change to the table's settings never changes a roll's dice.
 *
 * Rolling hit points fixes the class for the ability roll, because the hit points and the gold depend on it. Once
 * it's fixed, the server refuses any request for another class, so a player can't roll again by changing the
 * class. Until the gold is rolled, it refuses any request with purchases or equipped items, because bxapi's answer
 * to a purchase the gold can't cover reveals the gold.
 */
export class StartingRollKeeper {
  /**
   * @param ctx - The server's services.
   * @param rolls - The table ability rolls.
   */
  constructor(
    private readonly ctx: Context,
    private readonly rolls: AbilityRollStore,
  ) {}

  /**
   * Asks bxapi for the character a roll and a set of choices would create, under the roll's recorded ruleset. The
   * preview stores nothing and leaves the roll unused. It takes no idempotency key, because a key would make bxapi
   * store the response.
   *
   * @param record - The ability roll.
   * @param choices - The choices.
   * @param requestId - The request ID, for bxapi's log.
   * @throws BxapiProblem `character_invalid`, `ability_roll_used`, or another bxapi failure.
   */
  preview(record: RollRecord, choices: PreviewChoices, requestId: string): Promise<CharacterPreview> {
    return this.rolls.closingIfUsed(record, () =>
      this.ctx.bxapi.post<CharacterPreview>(
        `/v1/ability-rolls/${encodeURIComponent(record.id)}/preview`,
        bxapiChoices(choices, record),
        { requestId },
      ),
    );
  }

  /**
   * Reads the user's roll that may make a character, and refuses choices that its starting rolls rule out: another
   * class than the hit points were rolled for, and purchases or equipped items before the gold is rolled.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID, who owns the roll.
   * @param choices - The choices.
   * @returns The roll.
   * @throws ApiError `not_found`, `ability_roll_used`, `ability_roll_superseded`, `ability_roll_locked`, or
   *   `gold_not_rolled`.
   */
  guard(rollId: string, userId: string, choices: GuardedChoices): RollRecord {
    const record = this.rolls.current(rollId, userId);
    requireLock(record, choices.class_id);
    const shops = (choices.purchases?.length ?? 0) > 0 || (choices.equip_item_ids?.length ?? 0) > 0;
    if (shops && !record.goldRolled) {
      throw new ApiError(
        'gold_not_rolled',
        'Roll your starting gold before you buy or equip anything, so you know how much you have to spend.',
      );
    }
    return record;
  }

  /**
   * Reads bxapi's limits on the ability score trade for a roll and a class. The limits depend only on the scores as
   * rolled and the class, so the trade step reads them once. Pass a roll that [`guard`][guard] accepted for the
   * class, which refuses another class than the hit points fixed, as it does for a check.
   *
   * @param record - The user's newest open roll, from `guard`.
   * @param classId - The class.
   * @throws ApiError `ability_roll_used`, `character_invalid` for a class bxapi doesn't know or that the scores
   *   don't qualify for, or a bxapi failure.
   */
  adjustmentLimits(record: RollRecord, classId: string): Promise<AdjustmentLimits> {
    return callBxapi(
      () =>
        this.rolls.closingIfUsed(record, () =>
          this.ctx.bxapi.get<AdjustmentLimits>(
            `/v1/ability-rolls/${encodeURIComponent(record.id)}/adjustment-limits`,
            { class_id: classId },
          ),
        ),
      { passNotFound: true },
    );
  }

  /**
   * Reads which starting rolls the user made from a roll.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID, who owns the roll.
   * @throws ApiError `not_found` or a bxapi failure.
   */
  async status(rollId: string, userId: string): Promise<StartingRollsStatus> {
    const record = this.rolls.record(rollId, userId);
    const roll = await callBxapi(
      () => this.ctx.bxapi.get<AbilityRoll>(`/v1/ability-rolls/${encodeURIComponent(rollId)}`),
      { passNotFound: true },
    );
    return {
      // A roll is used when bxapi made a character from it, when the server recorded one, or when the server
      // closed it because the user made a character from another roll or discarded it as sub-par.
      used: roll.used || record.closed || record.characterId !== null,
      class_id: record.classId,
      rules: creationRulesOf(record.rules),
      gold_rolled: record.goldRolled,
    };
  }

  /**
   * Rolls the hit points for the user's newest open roll, under its recorded rules, and fixes the class for the
   * roll. When the hit points are already rolled for the same class, it returns the same dice.
   *
   * Two requests at once fix the class once: the server asks bxapi first and then records the class only when none
   * is recorded, so the second request either matches the first or gets `ability_roll_locked`.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID, who owns the roll.
   * @param body - The class, and an arcane caster's first spell.
   * @param requestId - The request ID, for bxapi's log.
   * @throws ApiError `not_found`, `ability_roll_superseded`, `ability_roll_locked`, `character_invalid`,
   *   `ability_roll_used`, or a bxapi failure.
   */
  async rollHitPoints(
    rollId: string,
    userId: string,
    body: StartingRollRequest,
    requestId: string,
  ): Promise<StartingRolls> {
    const record = this.rolls.current(rollId, userId);
    requireLock(record, body.class_id);
    const preview = await this.previewRolls(record, body, requestId);
    this.ctx.db.run(
      'UPDATE ability_rolls SET hp_class_id = ?, hp_rolled_at = ? WHERE id = ? AND hp_class_id IS NULL',
      body.class_id,
      now(),
      rollId,
    );
    const after = this.rolls.record(rollId, userId);
    requireLock(after, body.class_id);
    return rollsOf(after, body, preview, after.goldRolled);
  }

  /**
   * Rolls the starting gold for the user's newest open roll, after its hit points. When the gold is already
   * rolled, it returns the same dice.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID, who owns the roll.
   * @param body - The class the hit points were rolled for, and an arcane caster's first spell.
   * @param requestId - The request ID, for bxapi's log.
   * @throws ApiError `not_found`, `ability_roll_superseded`, `hit_points_not_rolled`, `ability_roll_locked`,
   *   `character_invalid`, `ability_roll_used`, or a bxapi failure.
   */
  async rollGold(
    rollId: string,
    userId: string,
    body: StartingRollRequest,
    requestId: string,
  ): Promise<StartingRolls> {
    const record = this.rolls.current(rollId, userId);
    if (record.classId === null) {
      throw new ApiError(
        'hit_points_not_rolled',
        'Roll your hit points first. Starting gold comes after them.',
      );
    }
    requireLock(record, body.class_id);
    const preview = await this.previewRolls(record, body, requestId);
    this.ctx.db.run(
      'UPDATE ability_rolls SET gold_rolled_at = ? WHERE id = ? AND gold_rolled_at IS NULL',
      now(),
      rollId,
    );
    return rollsOf(record, body, preview, true);
  }

  /** Previews the character with only the choices the rolls depend on, and placeholders for the rest. */
  private previewRolls(
    record: RollRecord,
    body: StartingRollRequest,
    requestId: string,
  ): Promise<CharacterPreview> {
    // The name and the alignment draw no dice. They're required, so the preview gets placeholders.
    const choices: PreviewChoices = { name: 'Adventurer', alignment: 'neutral', class_id: body.class_id };
    if (body.starting_spell_ids !== undefined) choices.starting_spell_ids = body.starting_spell_ids;
    return callBxapi(() => this.preview(record, choices, requestId), { passNotFound: true });
  }
}

/**
 * Refuses a class other than the one the hit points were rolled for.
 *
 * @throws ApiError `ability_roll_locked`.
 */
function requireLock(record: RollRecord, classId: string): void {
  if (record.classId === null || record.classId === classId) return;
  throw new ApiError(
    'ability_roll_locked',
    'You rolled hit points for these ability scores, which fixed your class. To play another class, roll new ability scores.',
    { class_id: record.classId },
  );
}

/** The starting rolls from a preview, with the gold only when the player rolled it. */
function rollsOf(
  record: RollRecord,
  body: StartingRollRequest,
  preview: CharacterPreview,
  goldRolled: boolean,
): StartingRolls {
  return {
    class_id: body.class_id,
    rules: creationRulesOf(record.rules),
    hit_point_roll: preview.rolls.hit_point_roll,
    gold_roll: goldRolled ? preview.rolls.gold_roll : null,
  };
}
