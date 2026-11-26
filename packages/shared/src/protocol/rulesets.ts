import { z } from 'zod';
import type { Ruleset } from '../bxapi';
import rulesetSchema from '../bxapi/ruleset.json' with { type: 'json' };

export type { Ruleset };

/** The name of a `Ruleset` field. */
export type RulesetField = keyof Ruleset;

/** One `Ruleset` field, as `npm run gen:bxapi` reads it from bxapi's OpenAPI `Ruleset` schema. */
interface RulesetFieldSpec {
  type: string;
  enum?: string[];
  default: unknown;
}

/**
 * Every `Ruleset` field with its type, its allowed values, and its default, from `bxapi/ruleset.json`, which
 * `npm run gen:bxapi` writes from bxapi's OpenAPI document. The protocol checks rulesets against these, so a
 * field that bxapi adds needs only a new `gen:bxapi` run.
 */
const FIELDS: Record<string, RulesetFieldSpec> = rulesetSchema.fields;

/** The names of the `Ruleset` fields, in bxapi's order. */
export const RULESET_FIELDS = Object.keys(FIELDS) as RulesetField[];

/**
 * Checks one `Ruleset` value.
 *
 * @param name - The field name.
 * @param value - The value.
 * @returns `null` when the value fits, or what is wrong with it.
 */
function fieldProblem(name: string, value: unknown): string | null {
  const field = FIELDS[name];
  if (field === undefined) return 'is not a rule bxapi knows';
  if (field.type === 'boolean') return typeof value === 'boolean' ? null : 'must be true or false';
  const values = field.enum ?? [];
  return typeof value === 'string' && values.includes(value)
    ? null
    : `must be one of ${values.map((option) => `"${option}"`).join(', ')}`;
}

/** Whether a value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Some `Ruleset` fields: every key is a `Ruleset` field, and each value is that field's type or one of its values.
 * `PATCH /api/tables/{table_id}` takes it as `settings.ruleset` and merges it into the table's ruleset.
 */
export const RulesetPatch = z
  .custom<Partial<Ruleset>>(isRecord, { message: 'must be an object of rules' })
  .superRefine((value, ctx) => {
    for (const [name, rule] of Object.entries(value)) {
      const problem = fieldProblem(name, rule);
      if (problem !== null) ctx.addIssue({ code: 'custom', path: [name], message: problem });
    }
  });
/** Some `Ruleset` fields. */
export type RulesetPatch = z.infer<typeof RulesetPatch>;

/** A whole `Ruleset`: a {@link RulesetPatch} that sets every field. */
export const RulesetSchema = RulesetPatch.superRefine((value, ctx) => {
  for (const name of RULESET_FIELDS) {
    if (!(name in value)) ctx.addIssue({ code: 'custom', path: [name], message: 'is missing' });
  }
}).transform((value) => value as Ruleset);

/**
 * osrlib's default `Ruleset`, which is the SRD as written: the `default` of each field in bxapi's OpenAPI
 * `Ruleset` schema.
 */
export function osrlibDefaultRuleset(): Ruleset {
  return RulesetSchema.parse(Object.fromEntries(RULESET_FIELDS.map((name) => [name, FIELDS[name]?.default])));
}

/**
 * Fills a stored ruleset with osrlib's defaults: a field that bxapi added after the ruleset was stored takes its
 * default, and a field that bxapi dropped, or a value it no longer accepts, falls away.
 *
 * @param stored - The stored ruleset.
 */
export function completeRuleset(stored: unknown): Ruleset {
  const ruleset: Record<string, unknown> = { ...osrlibDefaultRuleset() };
  if (isRecord(stored)) {
    for (const name of RULESET_FIELDS) {
      if (name in stored && fieldProblem(name, stored[name]) === null) ruleset[name] = stored[name];
    }
  }
  return RulesetSchema.parse(ruleset);
}

/**
 * The house rule for ability score rerolls: how many times a player may roll new ability scores at a table after
 * the first roll, from 0 to 99, or `null` for no limit.
 */
export const AbilityScoreRerolls = z.number().int().min(0).max(99).nullable();
/** The number of ability score rerolls a table allows, or `null` for no limit. */
export type AbilityScoreRerolls = z.infer<typeof AbilityScoreRerolls>;

/** The value of a `Ruleset` field, checked against bxapi's schema. */
function rulesetValue<K extends RulesetField>(name: K) {
  return z.custom<Ruleset[K]>((value) => fieldProblem(name, value) === null, {
    message: fieldProblem(name, undefined) ?? 'is not valid',
  });
}

/**
 * The creation rules a character was built under: the `Ruleset` fields that change character creation, and the
 * table's two creation settings. The server records them on each ability roll when it's made, and on the character
 * created from it, whatever the table's settings say later.
 */
export const CreationRules = z.object({
  /** How the ability scores were rolled: `3d6`, or the `4d6_drop_lowest` house rule. */
  ability_score_method: rulesetValue('ability_score_method'),
  /** The SRD's optional rule: a first-level hit die of 1 or 2 is rolled again. */
  hp_reroll_at_first_level: rulesetValue('hp_reroll_at_first_level'),
  /** The house rule: a first-level character's hit die counts as its maximum. */
  max_hp_at_first_level: rulesetValue('max_hp_at_first_level'),
  /** How many rerolls of the ability scores the table allowed, or `null` for no limit. */
  ability_score_rerolls: AbilityScoreRerolls,
  /** The SRD's optional rule: a player may discard a sub-par roll and roll again, outside the reroll limit. */
  sub_par_restart: z.boolean(),
});
/** The creation rules a character was built under. */
export type CreationRules = z.infer<typeof CreationRules>;

/** The two starting rulesets a referee picks from. */
export const StartingRulesetId = z.enum(['standard', 'creation_house_rules']);
/** A starting ruleset's ID. */
export type StartingRulesetId = z.infer<typeof StartingRulesetId>;

/** A starting ruleset: a whole `Ruleset` that a referee can apply to a table and then change rule by rule. */
export const StartingRuleset = z.object({
  id: StartingRulesetId,
  ruleset: z.custom<Ruleset>(),
});
/** A starting ruleset. */
export type StartingRuleset = z.infer<typeof StartingRuleset>;

/**
 * Response of `GET /api/rulesets`: the starting rulesets, `standard` then `creation_house_rules`.
 *
 * - `standard` is osrlib's defaults, which follow the SRD, with the SRD's optional first-level hit die re-roll on.
 * - `creation_house_rules` is osrlib's example ruleset `examples/rulesets/creation_house_rules.json`, which turns
 *   on 4d6 drop lowest and maximum hit points at first level, with the same re-roll on.
 *
 * A client finds the starting ruleset a table's ruleset matches, if any, by comparing every field.
 */
export const StartingRulesetList = z.object({ items: z.array(StartingRuleset) });
/** Response of `GET /api/rulesets`. */
export type StartingRulesetList = z.infer<typeof StartingRulesetList>;
