import { z } from 'zod';
import type { AbilityRoll, CharacterSummary, GeneratedCharacterResponse, StoredCharacter } from '../bxapi';
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
 * The server asks bxapi to create the character with the choices plus one item to equip that no purchase can
 * include. bxapi checks every choice in its documented order (class, adjustment, starting spells, hit points,
 * extra languages, gold, purchases, then equipping) and stops at the first choice that breaks a rule. The extra
 * item always stops creation after every real choice, so bxapi stores nothing and the roll stays unused.
 */
export const CharacterCheck = z.object({
  /** Whether every choice passed. Creating the character with the same body would then succeed. */
  valid: z.boolean(),
  /**
   * bxapi's `character_invalid` problem when a choice breaks a rule, with its `rejections`, or its `field`,
   * `index`, and `id`, intact. `null` when `valid` is `true`.
   */
  problem: Problem.nullable(),
  /**
   * The starting gold, in gold pieces, that the roll gives a character of `class_id` with the request's
   * `hp_reroll_at_first_level`, before any purchase. The hit point roll comes before the gold roll, so the
   * gold depends on the class's hit die and on the reroll option, and on nothing else. `null` when a choice
   * that comes before the gold roll (the class or the starting spells) breaks a rule.
   */
  gold_gp: z.number().int().nullable(),
});
/** Response of `POST /api/characters/check`. */
export type CharacterCheck = z.infer<typeof CharacterCheck>;

/** Response of `GET /api/characters`: the user's own stored characters, newest first. */
export const CharacterList = z.object({
  items: z.array(z.custom<CharacterSummary>()),
});
/** Response of `GET /api/characters`. */
export type CharacterList = z.infer<typeof CharacterList>;
