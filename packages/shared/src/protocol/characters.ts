import { z } from 'zod';
import type {
  AbilityRoll,
  CharacterSummary,
  GeneratedCharacterResponse,
  HitPointRoll,
  RollResult,
  StoredCharacter,
} from '../bxapi';
import { Problem } from './problems';

/** The result of a character preview: `seed`, `character`, `derived`, and the creation `rolls`. */
export type CharacterPreview = GeneratedCharacterResponse;
export type { AbilityRoll, CharacterSummary, StoredCharacter };

/** Body of `POST /api/ability-rolls`. `seed` is accepted only when the server allows character seeds. */
export const AbilityRollRequest = z.strictObject({
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
/** Body of `POST /api/ability-rolls`. */
export type AbilityRollRequest = z.infer<typeof AbilityRollRequest>;

/** One starting purchase: an equipment ID and a number of purchase lots. */
const Purchase = z.looseObject({
  item_id: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(10_000).optional(),
});

/**
 * Body of `POST /api/characters` and `POST /api/characters/preview`: the choices bxapi's `POST /v1/characters`
 * accepts. The server checks the shape and passes the choices to bxapi, which checks the rules and answers with
 * a `character_invalid` problem when a choice breaks one. `POST /api/characters` accepts `seed` only when the
 * server allows character seeds. A preview ignores `ability_roll_id` and accepts `seed` on any server, because
 * it stores nothing and a stored character can't reuse its rolls.
 */
export const CharacterRequest = z.looseObject({
  name: z.string().min(1).max(100),
  class_id: z.string().min(1).max(100),
  alignment: z.enum(['lawful', 'neutral', 'chaotic']),
  ability_roll_id: z.string().max(64).optional(),
  adjustment: z.record(z.string(), z.unknown()).optional(),
  starting_spell_ids: z.array(z.string().max(100)).max(50).optional(),
  extra_languages: z.array(z.string().max(100)).max(50).optional(),
  purchases: z.array(Purchase).max(200).optional(),
  equip_item_ids: z.array(z.string().max(100)).max(200).optional(),
  hp_reroll_at_first_level: z.boolean().optional(),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
/** Body of `POST /api/characters` and `POST /api/characters/preview`. */
export type CharacterRequest = z.infer<typeof CharacterRequest>;

/**
 * Body of `POST /api/characters/check`: the same choices as `POST /api/characters`, with the `ability_roll_id`
 * of one of the user's stored rolls. The server checks the choices against that roll and stores nothing.
 */
export const CharacterCheckRequest = CharacterRequest.extend({
  ability_roll_id: z.string().min(1).max(64),
});
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

/**
 * Body of `POST /api/ability-rolls/{roll_id}/hit-points` and `POST /api/ability-rolls/{roll_id}/gold`: the
 * choices the hit point roll and the gold roll depend on. bxapi rolls hit points with the class's hit die, with
 * the first-level reroll when `hp_reroll_at_first_level` is `true`, and rolls the gold after them. A magic-user or
 * an elf also needs its first spell, because creation checks the starting spells before it rolls hit points. No
 * other choice changes either roll, so the body has no other members.
 */
export const StartingRollRequest = z.strictObject({
  class_id: z.string().min(1).max(100),
  hp_reroll_at_first_level: z.boolean().optional(),
  starting_spell_ids: z.array(z.string().max(100)).max(50).optional(),
});
/** Body of `POST /api/ability-rolls/{roll_id}/hit-points` and `POST /api/ability-rolls/{roll_id}/gold`. */
export type StartingRollRequest = z.infer<typeof StartingRollRequest>;

/**
 * Response of `GET /api/ability-rolls/{roll_id}/starting-rolls`: which starting rolls the player has made from an
 * ability roll. Rolling hit points fixes the class and the reroll option for the ability roll, so `class_id` and
 * `hp_reroll_at_first_level` are `null` until then. The response has no dice. To read them, send
 * `POST /api/ability-rolls/{roll_id}/hit-points` again, which returns the rolls already made.
 */
export const StartingRollsStatus = z.object({
  /** Whether a character was already created from the ability roll. */
  used: z.boolean(),
  /** The class the hit points were rolled for, or `null` before the player rolls them. */
  class_id: z.string().nullable(),
  /** The reroll option the hit points were rolled with, or `null` before the player rolls them. */
  hp_reroll_at_first_level: z.boolean().nullable(),
  /** Whether the player has rolled the starting gold. */
  gold_rolled: z.boolean(),
});
/** Response of `GET /api/ability-rolls/{roll_id}/starting-rolls`. */
export type StartingRollsStatus = z.infer<typeof StartingRollsStatus>;

/**
 * Response of `POST /api/ability-rolls/{roll_id}/hit-points` and `POST /api/ability-rolls/{roll_id}/gold`: the
 * starting rolls the player has made, with the dice bxapi rolled. A character created from the ability roll with
 * the same class and reroll option starts with these hit points and this gold.
 */
export interface StartingRolls {
  /** The class the hit points were rolled for. */
  class_id: string;
  /** The reroll option the hit points were rolled with. */
  hp_reroll_at_first_level: boolean;
  /** bxapi's hit point roll: every die in the order thrown (the last one counts), and the hit points. */
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
