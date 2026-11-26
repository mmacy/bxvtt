/**
 * The table's rules as the lobby shows them: which starting ruleset the table's ruleset matches, the names of
 * the rules, and how a character's creation rules differ from the table's. bxapi decides what every rule does.
 * This file only compares stored values and names them.
 */
import type {
  CreationRules,
  RosterEntry,
  Ruleset,
  StartingRuleset,
  StartingRulesetId,
  TableSettings,
} from '@bxvtt/shared/protocol';
import { RULESET_FIELDS } from '@bxvtt/shared/protocol';

/** The name of each starting ruleset. */
export const STARTING_RULESET_NAMES: Record<StartingRulesetId, string> = {
  standard: 'Standard B/X',
  creation_house_rules: 'Creation house rules',
};

/** The words the confirmation uses for each starting ruleset, inside a sentence and on its button. */
export const STARTING_RULESET_CONFIRM: Record<
  StartingRulesetId,
  { title: string; inSentence: string; confirm: string }
> = {
  standard: {
    title: 'Use standard B/X rules?',
    inSentence: 'standard B/X',
    confirm: 'Use standard B/X',
  },
  creation_house_rules: {
    title: 'Use creation house rules?',
    inSentence: 'creation house rules',
    confirm: 'Use creation house rules',
  },
};

/**
 * The starting ruleset whose every `Ruleset` field has the table's value, or `null` when none does. The reroll
 * limit and the sub-par setting aren't `Ruleset` fields, so they never change the match.
 *
 * @param ruleset - The table's ruleset.
 * @param startingRulesets - The starting rulesets from `GET /api/rulesets`.
 */
export function matchStartingRuleset(
  ruleset: Ruleset,
  startingRulesets: readonly StartingRuleset[],
): StartingRulesetId | null {
  const match = startingRulesets.find((starting) =>
    RULESET_FIELDS.every((field) => starting.ruleset[field] === ruleset[field]),
  );
  return match?.id ?? null;
}

/** The creation rules a new character at the table gets now, from the table's settings. */
export function tableCreationRules(settings: TableSettings): CreationRules {
  return {
    ability_score_method: settings.ruleset.ability_score_method,
    hp_reroll_at_first_level: settings.ruleset.hp_reroll_at_first_level,
    max_hp_at_first_level: settings.ruleset.max_hp_at_first_level,
    ability_score_rerolls: settings.ability_score_rerolls,
    sub_par_restart: settings.sub_par_restart,
  };
}

/** The creation rules in the order the settings list them, with the settings' label for each. */
const CREATION_RULE_LABELS: Array<{ key: keyof CreationRules; label: string }> = [
  { key: 'sub_par_restart', label: 'Sub-par characters' },
  { key: 'hp_reroll_at_first_level', label: 'Hit die reroll' },
  { key: 'ability_score_method', label: '4d6 drop lowest' },
  { key: 'ability_score_rerolls', label: 'Ability score rerolls' },
  { key: 'max_hp_at_first_level', label: 'Maximum hit points' },
];

/** A creation rule's value as the roster names it. */
function creationRuleValue(key: keyof CreationRules, rules: CreationRules): string {
  if (key === 'ability_score_rerolls') {
    const rerolls = rules.ability_score_rerolls;
    return rerolls === null ? 'Unlimited' : rerolls === 0 ? 'None' : String(rerolls);
  }
  if (key === 'ability_score_method') return rules.ability_score_method === '4d6_drop_lowest' ? 'On' : 'Off';
  return rules[key] ? 'On' : 'Off';
}

/**
 * The creation rules a character was built under that differ from the table's, each as "{Rule}: {value}" with
 * the character's value. Only the fields the character recorded count, so a character from before a rule
 * existed doesn't differ on it.
 *
 * @param character - The character's recorded creation rules.
 * @param table - The table's creation rules now.
 */
export function creationRuleDifferences(character: CreationRules, table: CreationRules): string[] {
  return CREATION_RULE_LABELS.filter(({ key }) => key in character && character[key] !== table[key]).map(
    ({ key, label }) => `${label}: ${creationRuleValue(key, character)}`,
  );
}

type BooleanRule = {
  [K in keyof Ruleset]: Ruleset[K] extends boolean ? K : never;
}[keyof Ruleset];

/** A rule for play that is on or off. */
export interface BooleanPlayRule {
  kind: 'boolean';
  key: BooleanRule;
  label: string;
  description: string;
}

type SelectRule = 'encumbrance' | 'xp_award_timing';

/** A rule for play with named values, each value one that bxapi's `Ruleset` allows for the rule. */
export type SelectPlayRule = {
  [K in SelectRule]: {
    kind: 'select';
    key: K;
    label: string;
    description: string;
    options: { value: Ruleset[K]; label: string; description: string }[];
  };
}[SelectRule];

/**
 * The ruleset change that gives a rule for play one of its named values, or `null` for a value the rule doesn't
 * list.
 *
 * @param rule - The rule.
 * @param value - The value the referee chose.
 */
export function selectRulePatch(rule: SelectPlayRule, value: string): Partial<Ruleset> | null {
  switch (rule.key) {
    case 'encumbrance': {
      const option = rule.options.find((o) => o.value === value);
      return option === undefined ? null : { encumbrance: option.value };
    }
    case 'xp_award_timing': {
      const option = rule.options.find((o) => o.value === value);
      return option === undefined ? null : { xp_award_timing: option.value };
    }
  }
}

/**
 * The ruleset change that switches a rule for play on or off.
 *
 * @param rule - The rule.
 * @param checked - Whether it's on.
 */
export function booleanRulePatch(rule: BooleanPlayRule, checked: boolean): Partial<Ruleset> {
  const patch: Partial<Ruleset> = {};
  patch[rule.key] = checked;
  return patch;
}

/**
 * The `Ruleset` switches that apply once a game starts, each with a sentence that says what it changes. The
 * meanings come from osrlib's `Ruleset` model, and the values from the table's stored ruleset.
 */
export const RULES_FOR_PLAY: Array<BooleanPlayRule | SelectPlayRule> = [
  {
    kind: 'select',
    key: 'encumbrance',
    label: 'Encumbrance',
    description: 'How carried weight affects movement rate.',
    options: [
      { value: 'none', label: 'None', description: 'Carried weight never slows a character down.' },
      {
        value: 'basic',
        label: 'Basic',
        description: 'Worn armour and heavy treasure slow a character down.',
      },
      {
        value: 'detailed',
        label: 'Detailed',
        description: "The total weight of a character's armour, gear, and treasure sets their movement rate.",
      },
    ],
  },
  {
    kind: 'select',
    key: 'xp_award_timing',
    label: 'Experience awards',
    description: 'When the party receives the experience it earns.',
    options: [
      {
        value: 'on_return',
        label: 'On return to town',
        description: 'Characters receive experience when the party returns to town alive, as B/X states.',
      },
      {
        value: 'immediate',
        label: 'Right away',
        description:
          'Characters receive experience as soon as they earn it, which suits an adventure with no trip back to town.',
      },
    ],
  },
  {
    kind: 'boolean',
    key: 'variable_weapon_damage',
    label: 'Variable weapon damage',
    description: 'Weapons roll their listed damage dice instead of 1d6 for every weapon.',
  },
  {
    kind: 'boolean',
    key: 'individual_initiative',
    label: 'Individual initiative',
    description: 'Every combatant rolls their own initiative, instead of one roll for each side.',
  },
  {
    kind: 'boolean',
    key: 'thac0_arithmetic',
    label: 'THAC0 arithmetic',
    description:
      "The roll to hit is THAC0 minus the target's armour class, instead of the number in the attack matrix.",
  },
  {
    kind: 'boolean',
    key: 'weapon_reload',
    label: 'Weapon reload',
    description: 'Crossbows and other slow-loading weapons must spend a round reloading between shots.',
  },
  {
    kind: 'boolean',
    key: 'hd5_counts_as_magical',
    label: 'Big monsters',
    description:
      'Monsters with 5 hit dice or more can hurt creatures that only silver or magic weapons harm.',
  },
  {
    kind: 'boolean',
    key: 'magic_item_death_save',
    label: 'Magic item saves',
    description:
      'When a breath weapon or another destructive effect kills a character, each of their magic items makes a saving throw to survive.',
  },
  {
    kind: 'boolean',
    key: 'deprivation_penalties',
    label: 'Hunger and thirst',
    description:
      'A character without food or water takes penalties to attacks, movement, and rest, and eventually loses hit points.',
  },
  {
    kind: 'boolean',
    key: 'aoe_friendly_fire',
    label: 'Friendly fire',
    description: 'An area spell cast at monsters in melee also hits the party members fighting them.',
  },
  {
    kind: 'boolean',
    key: 'formation_width_limit',
    label: 'Passage width',
    description: 'The width of a passage limits how many combatants can fight side by side.',
  },
  {
    kind: 'boolean',
    key: 'failed_trap_removal_springs',
    label: 'Failed trap removal',
    description: 'A thief who fails to remove a treasure trap springs it.',
  },
  {
    kind: 'boolean',
    key: 'back_stab_needs_both_skills',
    label: 'Back-stab from hiding',
    description:
      "A hiding thief's back-stab needs both the hide in shadows and the move silently roll to succeed, instead of either one.",
  },
];

/** The one mark a referee sees on a roster card, or `null` for a character rolled here under the table's rules. */
export interface RosterMark {
  label: 'Rules unknown' | 'Other table' | 'Different rules';
  /** How the badge reads: a warning when the rules differ, info for another table, neutral for unknown rules. */
  tone: 'neutral' | 'info' | 'warning';
  /** The tooltip's lines. */
  lines: string[];
}

/**
 * The mark a referee sees on a roster card. A card has at most one: unknown rules first, then a character rolled
 * at another table, then rules that differ from the table's.
 *
 * @param entry - The roster entry.
 * @param table - The table's creation rules now.
 */
export function rosterMark(
  entry: Pick<RosterEntry, 'name' | 'creation_rules' | 'rolled_at_other_table'>,
  table: CreationRules,
): RosterMark | null {
  if (entry.creation_rules === null) {
    return {
      label: 'Rules unknown',
      tone: 'neutral',
      lines: [`No creation rules were recorded for ${entry.name}.`],
    };
  }
  const differences = creationRuleDifferences(entry.creation_rules, table);
  if (entry.rolled_at_other_table) {
    return differences.length === 0
      ? {
          label: 'Other table',
          tone: 'info',
          lines: [
            `${entry.name}'s ability scores were rolled at another table, under the same creation rules as this one.`,
          ],
        }
      : {
          label: 'Other table',
          tone: 'warning',
          lines: [`${entry.name}'s ability scores were rolled at another table, with:`, ...differences],
        };
  }
  if (differences.length === 0) return null;
  return {
    label: 'Different rules',
    tone: 'warning',
    lines: [`${entry.name} was created with:`, ...differences],
  };
}
