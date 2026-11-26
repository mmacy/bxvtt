import { z } from 'zod';
import type {
  DiceRollResponse,
  MonstersResponse,
  NpcPartyResponse,
  paths,
  RoomResponse,
  SpellTemplate,
  TreasureResponse,
} from '../bxapi';

export type {
  DiceRollResponse,
  MonstersResponse,
  NpcPartyResponse,
  RoomResponse,
  SpellTemplate,
  TreasureResponse,
};

/**
 * A spell ID in a path, such as `magic_missile` or an adventure's own `ember_dart`: letters, digits, `_`, `.`, and
 * `-`, at most 100 characters.
 */
export const SpellId = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);

/**
 * Path of `GET /api/tables/{table_id}/game/rules/spells/{spell_id}`. Any member of the table, player or referee,
 * may read it. It returns bxapi's `SpellTemplate` for a spell that the game's player view names in
 * `spell_names`, from the session's own catalog, so it answers for a spell the adventure bundles, which
 * `GET /api/rules/spells/{spell_id}` doesn't. A spell the player view doesn't name gets 404 `not_found`, as an ID
 * that no catalog has does. The response carries an `ETag`, and a request with a matching `If-None-Match` gets
 * 304.
 */
export const SessionSpellParams = z.object({ tableId: z.string(), spellId: SpellId });
/** Path of `GET /api/tables/{table_id}/game/rules/spells/{spell_id}`. */
export type SessionSpellParams = z.infer<typeof SessionSpellParams>;

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

/**
 * The catalogs that `GET /api/catalogs/{catalog}` serves whole: every full entry in one response, instead of one
 * `GET /api/rules/{catalog}/{id}` request per entry.
 */
export const FULL_CATALOGS = ['classes', 'equipment', 'monsters', 'spells', 'magic-items'] as const;
/** A catalog that `GET /api/catalogs/{catalog}` serves whole. */
export type FullCatalogName = (typeof FULL_CATALOGS)[number];
/** A catalog name, as a zod schema. */
export const FullCatalogNameSchema = z.enum(FULL_CATALOGS);

/** The body of a bxapi `GET` route's 200 response. */
type BxapiGetResponse<P extends keyof paths> = paths[P] extends {
  get: { responses: { 200: { content: { 'application/json': infer T } } } };
}
  ? T
  : never;

/** The full entry of each catalog, as bxapi's `GET /v1/rules/{catalog}/{id}` returns it. */
export interface FullCatalogEntries {
  classes: BxapiGetResponse<'/v1/rules/classes/{class_id}'>;
  equipment: BxapiGetResponse<'/v1/rules/equipment/{item_id}'>;
  monsters: BxapiGetResponse<'/v1/rules/monsters/{monster_id}'>;
  spells: BxapiGetResponse<'/v1/rules/spells/{spell_id}'>;
  'magic-items': BxapiGetResponse<'/v1/rules/magic-items/{item_id}'>;
}

/**
 * Response of `GET /api/catalogs/{catalog}`: every entry of one rules catalog, each exactly as
 * `GET /api/rules/{catalog}/{id}` returns it, in the order of bxapi's list. The response has an `ETag` and
 * `Cache-Control: private, max-age=3600`, and the server answers `If-None-Match` with 304 and gzips the body
 * for a client that accepts it.
 */
export interface FullCatalog<C extends FullCatalogName = FullCatalogName> {
  catalog: C;
  /** How many entries `items` holds. */
  total: number;
  items: FullCatalogEntries[C][];
}
