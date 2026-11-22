import { z } from 'zod';
import type { AbilityRoll, CharacterSummary, GeneratedCharacterResponse, StoredCharacter } from '../bxapi';

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
 * a `character_invalid` problem when a choice breaks one. `seed` is accepted only when the server allows
 * character seeds. A preview ignores `ability_roll_id`.
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

/** Response of `GET /api/characters`: the user's own stored characters, newest first. */
export const CharacterList = z.object({
  items: z.array(z.custom<CharacterSummary>()),
});
/** Response of `GET /api/characters`. */
export type CharacterList = z.infer<typeof CharacterList>;
