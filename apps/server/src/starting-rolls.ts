import type { CharacterPreview } from '@bxvtt/shared/bxapi';
import type {
  AbilityRoll,
  CharacterRequest,
  StartingRollRequest,
  StartingRolls,
  StartingRollsStatus,
} from '@bxvtt/shared/protocol';
import { callBxapi } from './bxapi';
import type { Context } from './context';
import { strOrNull } from './db';
import { ApiError, notFound } from './errors';
import { now } from './ids';

/** The choices of a bxapi preview: creation's body without `ability_roll_id`, which the path names. */
export type PreviewChoices = Omit<CharacterRequest, 'ability_roll_id'>;

/** What the server records about an ability roll's starting rolls. */
interface RollState {
  /** The class the hit points were rolled for, or `null` before they're rolled. */
  classId: string | null;
  /** The reroll option the hit points were rolled with, or `null` before they're rolled. */
  hpReroll: boolean | null;
  /** Whether the gold is rolled. */
  goldRolled: boolean;
}

/** The choices that decide the hit points and the gold, and the ones that would reveal the gold. */
interface GuardedChoices {
  class_id: string;
  hp_reroll_at_first_level?: boolean;
  purchases?: readonly unknown[];
  equip_item_ids?: readonly unknown[];
}

/**
 * Keeps the starting rolls of each ability roll: the hit points and the gold that a character made from the roll
 * starts with. bxapi derives both from the roll's private seed, and its preview returns the same dice for the same
 * class and reroll option every time, so the server stores no dice. It records only that the player rolled them.
 *
 * Rolling hit points fixes the class and the reroll option for the ability roll, because the hit points and the
 * gold depend on both. Once they're fixed, the server refuses any request for another class or reroll option, so a
 * player can't roll again by changing the class. Until the gold is rolled, it refuses any request with purchases
 * or equipped items, because bxapi's answer to a purchase the gold can't cover reveals the gold.
 */
export class StartingRollKeeper {
  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Reads what the server records about a roll the user owns.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID.
   * @throws ApiError `not_found` when the user doesn't own the roll.
   */
  private state(rollId: string, userId: string): RollState {
    const row = this.ctx.db.get(
      'SELECT hp_class_id, hp_reroll, gold_rolled_at FROM ability_rolls WHERE id = ? AND owner_user_id = ?',
      rollId,
      userId,
    );
    if (row === undefined) notFound('ability roll', rollId);
    const classId = strOrNull(row, 'hp_class_id');
    return {
      classId,
      hpReroll: classId === null ? null : Number(row.hp_reroll) === 1,
      goldRolled: strOrNull(row, 'gold_rolled_at') !== null,
    };
  }

  /**
   * Asks bxapi for the character a roll and a set of choices would create. The preview stores nothing and leaves
   * the roll unused. It takes no idempotency key, because a key would make bxapi store the response.
   *
   * @param rollId - The ability roll ID.
   * @param choices - The choices.
   * @param requestId - The request ID, for bxapi's log.
   * @throws BxapiProblem `character_invalid`, `ability_roll_used`, or another bxapi failure.
   */
  preview(rollId: string, choices: PreviewChoices, requestId: string): Promise<CharacterPreview> {
    return this.ctx.bxapi.post<CharacterPreview>(
      `/v1/ability-rolls/${encodeURIComponent(rollId)}/preview`,
      choices,
      { requestId },
    );
  }

  /**
   * Refuses choices that the roll's starting rolls rule out: another class or reroll option than the hit points
   * were rolled with, and purchases or equipped items before the gold is rolled.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID, who owns the roll.
   * @param choices - The choices.
   * @throws ApiError `not_found`, `ability_roll_locked`, or `gold_not_rolled`.
   */
  guard(rollId: string, userId: string, choices: GuardedChoices): void {
    const state = this.state(rollId, userId);
    requireLock(state, choices.class_id, choices.hp_reroll_at_first_level === true);
    const shops = (choices.purchases?.length ?? 0) > 0 || (choices.equip_item_ids?.length ?? 0) > 0;
    if (shops && !state.goldRolled) {
      throw new ApiError(
        'gold_not_rolled',
        'Roll your starting gold before you buy or equip anything, so you know how much you have to spend.',
      );
    }
  }

  /**
   * Reads which starting rolls the user made from a roll.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID, who owns the roll.
   * @throws ApiError `not_found` or a bxapi failure.
   */
  async status(rollId: string, userId: string): Promise<StartingRollsStatus> {
    const state = this.state(rollId, userId);
    const roll = await callBxapi(
      () => this.ctx.bxapi.get<AbilityRoll>(`/v1/ability-rolls/${encodeURIComponent(rollId)}`),
      { passNotFound: true },
    );
    return {
      used: roll.used,
      class_id: state.classId,
      hp_reroll_at_first_level: state.hpReroll,
      gold_rolled: state.goldRolled,
    };
  }

  /**
   * Rolls the hit points for a roll the user owns, and fixes the class and the reroll option for the roll. When
   * the hit points are already rolled with the same choices, it returns the same dice.
   *
   * Two requests at once fix the choices once: the server asks bxapi first and then records the choices only
   * when none are recorded, so the second request either matches the first or gets `ability_roll_locked`.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID, who owns the roll.
   * @param body - The class, the reroll option, and an arcane caster's first spell.
   * @param requestId - The request ID, for bxapi's log.
   * @throws ApiError `not_found`, `ability_roll_locked`, `character_invalid`, `ability_roll_used`, or a bxapi
   *   failure.
   */
  async rollHitPoints(
    rollId: string,
    userId: string,
    body: StartingRollRequest,
    requestId: string,
  ): Promise<StartingRolls> {
    const reroll = body.hp_reroll_at_first_level === true;
    requireLock(this.state(rollId, userId), body.class_id, reroll);
    const preview = await this.previewRolls(rollId, body, requestId);
    this.ctx.db.run(
      'UPDATE ability_rolls SET hp_class_id = ?, hp_reroll = ?, hp_rolled_at = ? WHERE id = ? AND hp_class_id IS NULL',
      body.class_id,
      reroll ? 1 : 0,
      now(),
      rollId,
    );
    const state = this.state(rollId, userId);
    requireLock(state, body.class_id, reroll);
    return rollsOf(body, preview, state.goldRolled);
  }

  /**
   * Rolls the starting gold for a roll the user owns, after its hit points. When the gold is already rolled, it
   * returns the same dice.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID, who owns the roll.
   * @param body - The class and reroll option the hit points were rolled with, and an arcane caster's first spell.
   * @param requestId - The request ID, for bxapi's log.
   * @throws ApiError `not_found`, `hit_points_not_rolled`, `ability_roll_locked`, `character_invalid`,
   *   `ability_roll_used`, or a bxapi failure.
   */
  async rollGold(
    rollId: string,
    userId: string,
    body: StartingRollRequest,
    requestId: string,
  ): Promise<StartingRolls> {
    const state = this.state(rollId, userId);
    if (state.classId === null) {
      throw new ApiError(
        'hit_points_not_rolled',
        'Roll your hit points first. Starting gold comes after them.',
      );
    }
    requireLock(state, body.class_id, body.hp_reroll_at_first_level === true);
    const preview = await this.previewRolls(rollId, body, requestId);
    this.ctx.db.run(
      'UPDATE ability_rolls SET gold_rolled_at = ? WHERE id = ? AND gold_rolled_at IS NULL',
      now(),
      rollId,
    );
    return rollsOf(body, preview, true);
  }

  /** Previews the character with only the choices the rolls depend on, and placeholders for the rest. */
  private previewRolls(
    rollId: string,
    body: StartingRollRequest,
    requestId: string,
  ): Promise<CharacterPreview> {
    // The name and the alignment draw no dice. They're required, so the preview gets placeholders.
    const choices: PreviewChoices = { name: 'Adventurer', alignment: 'neutral', class_id: body.class_id };
    if (body.hp_reroll_at_first_level === true) choices.hp_reroll_at_first_level = true;
    if (body.starting_spell_ids !== undefined) choices.starting_spell_ids = body.starting_spell_ids;
    return callBxapi(() => this.preview(rollId, choices, requestId), { passNotFound: true });
  }
}

/**
 * Refuses a class or reroll option other than the ones the hit points were rolled with.
 *
 * @throws ApiError `ability_roll_locked`.
 */
function requireLock(state: RollState, classId: string, reroll: boolean): void {
  if (state.classId === null || (state.classId === classId && state.hpReroll === reroll)) return;
  throw new ApiError(
    'ability_roll_locked',
    'You rolled hit points for these ability scores with another class or reroll option, which fixed both. Keep them, or roll new ability scores to play another class.',
    { class_id: state.classId, hp_reroll_at_first_level: state.hpReroll === true },
  );
}

/** The starting rolls from a preview, with the gold only when the player rolled it. */
function rollsOf(body: StartingRollRequest, preview: CharacterPreview, goldRolled: boolean): StartingRolls {
  return {
    class_id: body.class_id,
    hp_reroll_at_first_level: body.hp_reroll_at_first_level === true,
    hit_point_roll: preview.rolls.hit_point_roll,
    gold_roll: goldRolled ? preview.rolls.gold_roll : null,
  };
}
