import type { FastifyInstance } from 'fastify';
import type {
  AbilityScoreRerolls,
  CreationRules,
  Ruleset,
  StartingRuleset,
  StartingRulesetList,
} from '@bxvtt/shared/protocol';
import { RulesetPatch, completeRuleset, osrlibDefaultRuleset } from '@bxvtt/shared/protocol';
import houseRules from '../rulesets/creation_house_rules.json' with { type: 'json' };
import type { Context } from './context';

/**
 * The `standard` starting ruleset: osrlib's defaults, which follow the SRD, with the SRD's optional first-level hit
 * die re-roll on. bxvtt turns the re-roll on by default, whereas osrlib leaves it off.
 */
export function standardRuleset(): Ruleset {
  return { ...osrlibDefaultRuleset(), hp_reroll_at_first_level: true };
}

/**
 * The `creation_house_rules` starting ruleset: osrlib's example `examples/rulesets/creation_house_rules.json` at
 * tag v2.9.0, which `apps/server/rulesets/` holds a verbatim copy of, with the first-level hit die re-roll on. A
 * field that the copy lacks takes osrlib's default.
 *
 * @throws ZodError at startup when the copy names a rule that bxapi doesn't know.
 */
export function houseRuleset(): Ruleset {
  return { ...completeRuleset(RulesetPatch.parse(houseRules)), hp_reroll_at_first_level: true };
}

/** Both starting rulesets, as `GET /api/rulesets` returns them. */
export function startingRulesets(): StartingRuleset[] {
  return [
    { id: 'standard', ruleset: standardRuleset() },
    { id: 'creation_house_rules', ruleset: houseRuleset() },
  ];
}

/**
 * The rules the server records on an ability roll when it's made: the table's whole ruleset and its two creation
 * settings at that moment. The server sends `ruleset` to bxapi for the roll's hit points, gold, checks, and
 * creation, so a later change to the table's settings never changes a roll.
 */
export interface RecordedRules {
  ruleset: Ruleset;
  ability_score_rerolls: AbilityScoreRerolls;
  sub_par_restart: boolean;
}

/**
 * Reads recorded rules from their JSON column, filling any field that bxapi added since with osrlib's default.
 *
 * @param text - The JSON.
 */
export function parseRecordedRules(text: string): RecordedRules {
  const raw = JSON.parse(text) as Partial<RecordedRules>;
  return {
    ruleset: completeRuleset(raw.ruleset),
    ability_score_rerolls: typeof raw.ability_score_rerolls === 'number' ? raw.ability_score_rerolls : null,
    sub_par_restart: raw.sub_par_restart === true,
  };
}

/**
 * The creation rules that recorded rules state: the ruleset fields that change character creation, and the two
 * creation settings.
 *
 * @param rules - The recorded rules.
 */
export function creationRulesOf(rules: RecordedRules): CreationRules {
  return {
    ability_score_method: rules.ruleset.ability_score_method,
    hp_reroll_at_first_level: rules.ruleset.hp_reroll_at_first_level,
    max_hp_at_first_level: rules.ruleset.max_hp_at_first_level,
    ability_score_rerolls: rules.ability_score_rerolls,
    sub_par_restart: rules.sub_par_restart,
  };
}

/**
 * Registers `GET /api/rulesets`, which any signed-in user may read.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerRulesetRoutes(app: FastifyInstance, ctx: Context): void {
  // Built once: both rulesets come from files that don't change while the server runs.
  const list: StartingRulesetList = { items: startingRulesets() };
  app.get('/api/rulesets', async (request) => {
    ctx.auth.user(request);
    return list;
  });
}
