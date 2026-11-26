import type { AbilityRoll as BxapiAbilityRoll } from '@bxvtt/shared/bxapi';
import type { AbilityRoll, AbilityRollRequest, User } from '@bxvtt/shared/protocol';
import { BxapiProblem, callBxapi } from './bxapi';
import type { Context } from './context';
import type { Row } from './db';
import { str, strOrNull } from './db';
import { ApiError, notFound } from './errors';
import { now } from './ids';
import type { RecordedRules } from './rulesets';
import { creationRulesOf, parseRecordedRules } from './rulesets';

/** What the server records about one of a user's ability rolls at a table. */
export interface RollRecord {
  id: string;
  ownerUserId: string;
  tableId: string;
  /** The rules recorded when the roll was made. */
  rules: RecordedRules;
  /** Whether bxapi reported the roll's scores as sub-par. */
  subPar: boolean;
  /** The character made from the roll, or `null`. */
  characterId: string | null;
  /** Whether a character made from another roll closed this one. */
  closed: boolean;
  /** The class the hit points were rolled for, or `null` before they're rolled. */
  classId: string | null;
  /** Whether the gold is rolled. */
  goldRolled: boolean;
}

/** Reads a roll row. */
function recordOf(row: Row): RollRecord {
  return {
    id: str(row, 'id'),
    ownerUserId: str(row, 'owner_user_id'),
    tableId: str(row, 'table_id'),
    rules: parseRecordedRules(str(row, 'rules_json')),
    subPar: Number(row.sub_par) === 1,
    characterId: strOrNull(row, 'character_id'),
    closed: strOrNull(row, 'closed_at') !== null,
    classId: strOrNull(row, 'hp_class_id'),
    goldRolled: strOrNull(row, 'gold_rolled_at') !== null,
  };
}

/**
 * Keeps the ability rolls of each table and enforces the table's reroll limit, which is table policy rather than a
 * game rule. bxapi rolls the dice and decides whether the scores are sub-par. The server records who rolled, at
 * which table, under which rules, and whether a character came from the roll.
 *
 * A user's open rolls at a table are the rolls that made no character and that weren't closed. Unless the table
 * has no limit, a user may have at most `1 + ability_score_rerolls` open rolls at a table. Creating a character
 * closes the user's other open rolls there, and only the newest open roll can make a character.
 */
export class AbilityRollStore {
  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Reads one of the user's rolls at a table the user is still a member of. A roll from before the server tied
   * rolls to tables counts as one the user doesn't have.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID.
   * @throws ApiError `not_found`.
   */
  record(rollId: string, userId: string): RollRecord {
    const row = this.ctx.db.get(
      `SELECT a.* FROM ability_rolls a JOIN members m ON m.table_id = a.table_id AND m.user_id = a.owner_user_id
       WHERE a.id = ? AND a.owner_user_id = ? AND a.rules_json IS NOT NULL`,
      rollId,
      userId,
    );
    if (row === undefined) notFound('ability roll', rollId);
    return recordOf(row);
  }

  /**
   * Lists a user's open rolls at a table, newest first.
   *
   * @param tableId - The table ID.
   * @param userId - The user ID.
   */
  open(tableId: string, userId: string): RollRecord[] {
    return this.ctx.db
      .all(
        `SELECT * FROM ability_rolls
         WHERE table_id = ? AND owner_user_id = ? AND character_id IS NULL AND closed_at IS NULL
           AND rules_json IS NOT NULL
         ORDER BY created_at DESC, rowid DESC`,
        tableId,
        userId,
      )
      .map(recordOf);
  }

  /**
   * Reads a roll that may make a character, roll starting rolls, or check choices: the user's newest open roll at
   * its table.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID.
   * @throws ApiError `not_found`, `ability_roll_used` for a roll that made a character or that a later character
   *   or a sub-par restart closed, or `ability_roll_superseded` for an open roll that isn't the user's newest.
   */
  current(rollId: string, userId: string): RollRecord {
    const record = this.record(rollId, userId);
    if (record.characterId !== null || record.closed) {
      throw new ApiError(
        'ability_roll_used',
        'You already made a character from these ability scores. Each roll of ability scores makes one character. Roll new ability scores to make another.',
      );
    }
    const newest = this.newest(record.tableId, userId);
    if (newest === null || newest.id !== record.id) {
      throw new ApiError(
        'ability_roll_superseded',
        'You rolled newer ability scores. Only your newest ability scores count, so continue with those.',
        { roll_id: newest?.id ?? null },
      );
    }
    return record;
  }

  /**
   * Reads a user's newest open roll at a table.
   *
   * @param tableId - The table ID.
   * @param userId - The user ID.
   * @returns The roll, or `null` when the user has no open roll there.
   */
  newest(tableId: string, userId: string): RollRecord | null {
    return this.open(tableId, userId)[0] ?? null;
  }

  /**
   * Reads a user's newest open roll at a table from bxapi, as `GET /api/tables/{table_id}/ability-rolls/current`
   * returns it. A wizard that lost its draft uses it to get back to the roll.
   *
   * @param tableId - The table ID. The caller checks membership.
   * @param userId - The user ID.
   * @throws ApiError `not_found` when the user has no open roll at the table, or a bxapi failure.
   */
  async readNewest(tableId: string, userId: string): Promise<AbilityRoll> {
    const newest = this.newest(tableId, userId);
    if (newest === null) notFound('ability roll', 'current');
    return this.read(newest.id, userId);
  }

  /**
   * How many more rolls a user may make at a table now, or `null` when the table has no limit.
   *
   * @param tableId - The table ID.
   * @param userId - The user ID.
   */
  rerollsLeft(tableId: string, userId: string): number | null {
    const limit = this.ctx.tables.settings(tableId).ability_score_rerolls;
    if (limit === null) return null;
    return Math.max(0, 1 + limit - this.open(tableId, userId).length);
  }

  /**
   * Decides whether a user may roll at a table now, and which open roll the new roll discards.
   *
   * A sub-par newest open roll whose recorded rules allow the sub-par restart doesn't count against the limit, and
   * the new roll closes it. Otherwise the user may roll while they have fewer than `1 + ability_score_rerolls` open
   * rolls.
   *
   * @returns The ID of the roll to close, or `null`.
   * @throws ApiError `ability_rerolls_used`.
   */
  private admit(tableId: string, userId: string): string | null {
    const limit = this.ctx.tables.settings(tableId).ability_score_rerolls;
    const open = this.open(tableId, userId);
    const newest = open[0];
    const restart = newest !== undefined && newest.subPar && newest.rules.sub_par_restart ? newest.id : null;
    const counted = open.length - (restart === null ? 0 : 1);
    if (limit !== null && counted >= 1 + limit) {
      throw new ApiError(
        'ability_rerolls_used',
        "You've used all your rerolls. Continue with the ability scores you rolled last, or ask the referee to allow another reroll.",
        { ability_score_rerolls: limit, roll_id: newest?.id ?? null },
      );
    }
    return restart;
  }

  /**
   * Rolls ability scores for a member at a table, under the table's ruleset, and records the table's rules on the
   * roll.
   *
   * @param tableId - The table ID. The caller checks membership.
   * @param user - The member.
   * @param body - The request, with an optional seed.
   * @param requestId - The request ID, for bxapi's log.
   * @throws ApiError `ability_rerolls_used`, or a bxapi failure.
   */
  async roll(tableId: string, user: User, body: AbilityRollRequest, requestId: string): Promise<AbilityRoll> {
    this.admit(tableId, user.id);
    const settings = this.ctx.tables.settings(tableId);
    const rules: RecordedRules = {
      ruleset: settings.ruleset,
      ability_score_rerolls: settings.ability_score_rerolls,
      sub_par_restart: settings.sub_par_restart,
    };
    const roll = await callBxapi(() =>
      this.ctx.bxapi.post<BxapiAbilityRoll>(
        '/v1/ability-rolls',
        { ...body, ruleset: rules.ruleset },
        { requestId },
      ),
    );
    // Another roll may have landed while bxapi rolled, so the limit is checked again where the roll is recorded.
    this.ctx.db.transaction(() => {
      const restart = this.admit(tableId, user.id);
      if (restart !== null) {
        this.ctx.db.run('UPDATE ability_rolls SET closed_at = ? WHERE id = ?', now(), restart);
      }
      this.ctx.db.run(
        `INSERT INTO ability_rolls (id, owner_user_id, created_at, table_id, rules_json, sub_par)
         VALUES (?, ?, ?, ?, ?, ?)`,
        roll.id,
        user.id,
        now(),
        tableId,
        JSON.stringify(rules),
        roll.rolls.sub_par ? 1 : 0,
      );
    });
    return this.withRecord(roll, this.record(roll.id, user.id));
  }

  /**
   * Reads one of the user's rolls from bxapi, with its table and recorded rules.
   *
   * @param rollId - The ability roll ID.
   * @param userId - The user ID.
   * @throws ApiError `not_found`, or a bxapi failure.
   */
  async read(rollId: string, userId: string): Promise<AbilityRoll> {
    const record = this.record(rollId, userId);
    const roll = await callBxapi(
      () => this.ctx.bxapi.get<BxapiAbilityRoll>(`/v1/ability-rolls/${encodeURIComponent(rollId)}`),
      { passNotFound: true },
    );
    return this.withRecord(roll, record);
  }

  /**
   * Records that a character was made from a roll, and closes the user's other open rolls at its table.
   *
   * @param record - The roll.
   * @param characterId - The character made from it.
   */
  markUsed(record: RollRecord, characterId: string): void {
    this.ctx.db.run('UPDATE ability_rolls SET character_id = ? WHERE id = ?', characterId, record.id);
    this.ctx.db.run(
      `UPDATE ability_rolls SET closed_at = ?
       WHERE table_id = ? AND owner_user_id = ? AND character_id IS NULL AND closed_at IS NULL`,
      now(),
      record.tableId,
      record.ownerUserId,
    );
  }

  /**
   * Runs a bxapi call that uses a roll, and closes the roll when bxapi answers that the roll is used although the
   * server recorded no character from it. That happens when bxapi created the character but the server never
   * heard back, such as after a timeout. Without the close, the open roll would count against the limit forever
   * and the player could neither use it nor roll again.
   *
   * @param record - The roll.
   * @param call - The bxapi call.
   * @throws The call's error, unchanged.
   */
  async closingIfUsed<T>(record: RollRecord, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof BxapiProblem && error.code === 'ability_roll_used') {
        this.ctx.db.run(
          'UPDATE ability_rolls SET closed_at = ? WHERE id = ? AND character_id IS NULL AND closed_at IS NULL',
          now(),
          record.id,
        );
      }
      throw error;
    }
  }

  private withRecord(roll: BxapiAbilityRoll, record: RollRecord): AbilityRoll {
    return {
      ...roll,
      table_id: record.tableId,
      rules: creationRulesOf(record.rules),
      rerolls_left: this.rerollsLeft(record.tableId, record.ownerUserId),
    };
  }
}
