import { z } from 'zod';
import type {
  AbilityRoll as BxapiAbilityRoll,
  AdjustmentLimits as BxapiAdjustmentLimits,
  CharacterSummary,
  GeneratedCharacterResponse,
  HitPointRoll,
  RollResult,
  StoredCharacter,
} from '../bxapi';
import { Problem } from './problems';
import { CreationRules, RulesetPatch } from './rulesets';

/** The result of a character preview: `seed`, `character`, `derived`, and the creation `rolls`. */
export type CharacterPreview = GeneratedCharacterResponse;
export type { CharacterSummary, StoredCharacter };

/**
 * Body of `POST /api/tables/{table_id}/ability-rolls`. `seed` is accepted only when the server allows character
 * seeds.
 */
export const AbilityRollRequest = z.strictObject({
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
/** Body of `POST /api/tables/{table_id}/ability-rolls`. */
export type AbilityRollRequest = z.infer<typeof AbilityRollRequest>;

/**
 * Response of `POST /api/tables/{table_id}/ability-rolls` and `GET /api/ability-rolls/{roll_id}`: bxapi's ability
 * roll, with the table it was rolled at and the creation rules the server recorded on it.
 *
 * bxapi rolls the scores with the table's `ability_score_method` and reports in `rolls.sub_par` whether they're
 * sub-par. With `rules.sub_par_restart` on, a player whose newest open roll is sub-par may roll again even when
 * `rerolls_left` is 0, and the new roll discards the sub-par one without using a reroll.
 */
export interface AbilityRoll extends BxapiAbilityRoll {
  /** The table the roll belongs to. */
  table_id: string;
  /**
   * The creation rules recorded on the roll when it was made. The server rolls its hit points and gold, checks
   * its choices, and creates its character under these rules, whatever the table's settings say later.
   */
  rules: CreationRules;
  /**
   * How many more rolls the user may make at the table now, under the table's current reroll limit, or `null`
   * when the table has no limit. Each open roll (a roll that made no character and that a later character didn't
   * close) counts against `1 + ability_score_rerolls`.
   */
  rerolls_left: number | null;
}

/** One starting purchase: an equipment ID and a number of purchase lots. */
const Purchase = z.looseObject({
  item_id: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(10_000).optional(),
});

/**
 * The choices of a character, which bxapi's `POST /v1/characters` and its previews accept: the body of
 * `POST /api/characters` without `ability_roll_id`.
 */
export const CharacterChoices = z.looseObject({
  name: z.string().min(1).max(100),
  class_id: z.string().min(1).max(100),
  alignment: z.enum(['lawful', 'neutral', 'chaotic']),
  adjustment: z.record(z.string(), z.unknown()).optional(),
  starting_spell_ids: z.array(z.string().max(100)).max(50).optional(),
  extra_languages: z.array(z.string().max(100)).max(50).optional(),
  purchases: z.array(Purchase).max(200).optional(),
  equip_item_ids: z.array(z.string().max(100)).max(200).optional(),
});
/** The choices of a character. */
export type CharacterChoices = z.infer<typeof CharacterChoices>;

/**
 * Body of `POST /api/characters`: the choices bxapi's `POST /v1/characters` accepts, and the `ability_roll_id` of
 * one of the user's ability rolls at a table. The server checks the shape and passes the choices to bxapi with the
 * ruleset recorded on the roll, which checks the rules and answers with a `character_invalid` problem when a
 * choice breaks one. The server ignores any `ruleset`, `seed`, or `hp_reroll_at_first_level` in the body, because
 * the roll's recorded rules decide.
 */
export const CharacterRequest = CharacterChoices.extend({
  ability_roll_id: z.string().min(1).max(64),
});
/** Body of `POST /api/characters`. */
export type CharacterRequest = z.infer<typeof CharacterRequest>;

/**
 * Body of `POST /api/characters/preview`: the same choices without a roll, with an optional `ruleset` (only the
 * rules that differ from osrlib's defaults) and `seed`. The preview stores nothing, so it accepts `seed` on any
 * server and ignores `ability_roll_id`.
 */
export const CharacterPreviewRequest = CharacterChoices.extend({
  ability_roll_id: z.string().max(64).optional(),
  ruleset: RulesetPatch.optional(),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
/** Body of `POST /api/characters/preview`. */
export type CharacterPreviewRequest = z.infer<typeof CharacterPreviewRequest>;

/**
 * Body of `POST /api/characters/check`: the same body as `POST /api/characters`. The server checks the choices
 * against the roll and its recorded rules, and stores nothing.
 */
export const CharacterCheckRequest = CharacterRequest;
/** Body of `POST /api/characters/check`. */
export type CharacterCheckRequest = z.infer<typeof CharacterCheckRequest>;

/**
 * Response of `POST /api/characters/check`.
 *
 * The server asks bxapi to preview the character from the roll and the choices. The preview checks every choice
 * in the order creation does (class, adjustment, starting spells, hit points, extra languages, gold, purchases,
 * then equipping) and stops at the first choice that breaks a rule. It stores nothing and leaves the roll unused.
 * The response never carries the previewed character, its hit points, or its gold, so a check can't reveal a roll
 * the player hasn't made.
 */
export const CharacterCheck = z.object({
  /** Whether every choice passed. Creating the character with the same body would then succeed. */
  valid: z.boolean(),
  /**
   * bxapi's `character_invalid` problem when a choice breaks a rule, with its `rejections`, or its `field`,
   * `index`, and `id`, intact. `null` when `valid` is `true`.
   */
  problem: Problem.nullable(),
});
/** Response of `POST /api/characters/check`. */
export type CharacterCheck = z.infer<typeof CharacterCheck>;

/** Query of `GET /api/ability-rolls/{roll_id}/adjustment-limits`: the class to trade ability points for. */
export const AdjustmentLimitsQuery = z.strictObject({
  class_id: z.string().min(1).max(100),
});
/** Query of `GET /api/ability-rolls/{roll_id}/adjustment-limits`. */
export type AdjustmentLimitsQuery = z.infer<typeof AdjustmentLimitsQuery>;

/**
 * Response of `GET /api/ability-rolls/{roll_id}/adjustment-limits`: bxapi's `AdjustmentLimits` for the roll's
 * scores as rolled and the class. It states how far a trade can move each score, and the reason it stops there.
 * The limits don't depend on a trade, so one answer serves every trade on the roll and class.
 */
export const AdjustmentLimits = z.custom<BxapiAdjustmentLimits>();
/** Response of `GET /api/ability-rolls/{roll_id}/adjustment-limits`. */
export type AdjustmentLimits = BxapiAdjustmentLimits;

/**
 * Body of `POST /api/ability-rolls/{roll_id}/hit-points` and `POST /api/ability-rolls/{roll_id}/gold`: the
 * choices the hit point roll and the gold roll depend on. bxapi rolls hit points with the class's hit die under the
 * rules recorded on the ability roll, and rolls the gold after them. A magic-user or an elf also needs its first
 * spell, because creation checks the starting spells before it rolls hit points. No other choice changes either
 * roll, so the body has no other members.
 */
export const StartingRollRequest = z.strictObject({
  class_id: z.string().min(1).max(100),
  starting_spell_ids: z.array(z.string().max(100)).max(50).optional(),
});
/** Body of `POST /api/ability-rolls/{roll_id}/hit-points` and `POST /api/ability-rolls/{roll_id}/gold`. */
export type StartingRollRequest = z.infer<typeof StartingRollRequest>;

/**
 * Response of `GET /api/ability-rolls/{roll_id}/starting-rolls`: which starting rolls the player has made from an
 * ability roll. Rolling hit points fixes the class for the ability roll, so `class_id` is `null` until then. The
 * response has no dice. To read them, send `POST /api/ability-rolls/{roll_id}/hit-points` again, which returns the
 * rolls already made.
 */
export const StartingRollsStatus = z.object({
  /** Whether a character was already created from the ability roll. */
  used: z.boolean(),
  /** The class the hit points were rolled for, or `null` before the player rolls them. */
  class_id: z.string().nullable(),
  /** The creation rules recorded on the ability roll, which the hit points and the gold are rolled under. */
  rules: CreationRules,
  /** Whether the player has rolled the starting gold. */
  gold_rolled: z.boolean(),
});
/** Response of `GET /api/ability-rolls/{roll_id}/starting-rolls`. */
export type StartingRollsStatus = z.infer<typeof StartingRollsStatus>;

/**
 * Response of `POST /api/ability-rolls/{roll_id}/hit-points` and `POST /api/ability-rolls/{roll_id}/gold`: the
 * starting rolls the player has made, with the dice bxapi rolled. A character created from the ability roll with
 * the same class starts with these hit points and this gold.
 */
export interface StartingRolls {
  /** The class the hit points were rolled for. */
  class_id: string;
  /** The creation rules recorded on the ability roll, which the hit points and the gold were rolled under. */
  rules: CreationRules;
  /**
   * bxapi's hit point roll: every die in the order thrown (the last one counts), the hit points, and `maximized`
   * when the maximum hit points house rule set them.
   */
  hit_point_roll: HitPointRoll;
  /** bxapi's starting gold roll (3d6 times 10), or `null` before the player rolls it. */
  gold_roll: RollResult | null;
}

/** Response of `GET /api/characters`: the user's own stored characters, newest first. */
export const CharacterList = z.object({
  items: z.array(z.custom<CharacterSummary>()),
});
/** Response of `GET /api/characters`. */
export type CharacterList = z.infer<typeof CharacterList>;
