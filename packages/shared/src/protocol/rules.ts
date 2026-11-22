import { z } from 'zod';
import type {
  DiceRollResponse,
  MonstersResponse,
  NpcPartyResponse,
  RoomResponse,
  TreasureResponse,
} from '../bxapi';

export type { DiceRollResponse, MonstersResponse, NpcPartyResponse, RoomResponse, TreasureResponse };

/** A seed for a stateless roll: an integer from 0 to 2^53 - 1. */
const Seed = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/**
 * Body of `POST /api/dice/roll`: a dice expression, such as `2d6+1`, rolled through bxapi. The roll isn't
 * posted to the feed. To roll at the table, post `/roll 2d6+1` to the feed.
 */
export const DiceRollRequest = z.strictObject({
  expression: z.string().trim().min(1).max(100),
  times: z.number().int().min(1).max(100).optional(),
  seed: Seed.optional(),
});
/** Body of `POST /api/dice/roll`. */
export type DiceRollRequest = z.infer<typeof DiceRollRequest>;

/**
 * The generators a referee can run with `POST /api/tables/{table_id}/generate/{kind}`. Each takes the body of
 * bxapi's `POST /v1/generate/{kind}` and returns its response unchanged.
 */
export const GeneratorKind = z.enum(['treasure', 'npc-party', 'room', 'monsters', 'character']);
/** A generator a referee can run. */
export type GeneratorKind = z.infer<typeof GeneratorKind>;

/** Body of `POST /api/tables/{table_id}/generate/treasure`. */
export const TreasureGeneratorRequest = z.strictObject({
  treasure_type: z.string().min(1).max(2),
  tier: z.enum(['basic', 'expert']),
  seed: Seed.optional(),
});

/** Body of `POST /api/tables/{table_id}/generate/npc-party`. */
export const NpcPartyGeneratorRequest = z.strictObject({
  kind: z.enum(['basic', 'expert']),
  count: z.number().int().min(1).max(100),
  seed: Seed.optional(),
});

/** Body of `POST /api/tables/{table_id}/generate/room`. */
export const RoomGeneratorRequest = z.strictObject({
  level_number: z.number().int().min(1).max(1000),
  seed: Seed.optional(),
});

/** Body of `POST /api/tables/{table_id}/generate/monsters`. */
export const MonstersGeneratorRequest = z.strictObject({
  monster_id: z.string().min(1).max(100),
  count: z.number().int().min(1).max(100).optional(),
  seed: Seed.optional(),
});

/**
 * The rules catalog paths that `GET /api/rules/{path}` serves. Each is a read-only proxy for the bxapi path of
 * the same name under `/v1/rules/`, with the same query parameters and response. The server caches responses
 * and answers `If-None-Match` with 304.
 */
export const RULES_PATHS = [
  'classes',
  'classes/{class_id}',
  'monsters',
  'monsters/{monster_id}',
  'spells',
  'spells/{spell_id}',
  'equipment',
  'equipment/{item_id}',
  'magic-items',
  'magic-items/{item_id}',
  'languages',
  'tables',
  'tables/{name}',
  'commands',
  'commands/{command_type}',
  'license',
] as const;

/** The query parameters the rules proxy passes to bxapi. The server drops any other parameter. */
export const RULES_QUERY_PARAMETERS = [
  'q',
  'class_id',
  'level',
  'item_type',
  'category',
  'kind',
  'mode',
  'limit',
  'offset',
] as const;
