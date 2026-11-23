import type { Ruleset } from '@bxvtt/shared/bxapi';
import { Button, Select, Switch } from '@/ui';
import styles from './lobby.module.css';

/** The optional rules a referee can switch for a new game: a part of osrlib's `Ruleset`. */
export type RulesetChoices = Partial<Ruleset>;

type BooleanRule = {
  [K in keyof Ruleset]: Ruleset[K] extends boolean ? K : never;
}[keyof Ruleset];

interface BooleanOption {
  kind: 'boolean';
  key: BooleanRule;
  label: string;
  description: string;
  defaultValue: boolean;
}

interface SelectOption {
  kind: 'select';
  key: 'encumbrance' | 'xp_award_timing';
  label: string;
  description: string;
  defaultValue: string;
  options: { value: string; label: string; description: string }[];
}

/**
 * Each optional rule with a sentence that says what it changes. The meanings and defaults come from osrlib's
 * `Ruleset` model.
 */
export const OPTIONAL_RULES: Array<BooleanOption | SelectOption> = [
  {
    kind: 'select',
    key: 'encumbrance',
    label: 'Encumbrance',
    description: 'Choose how carried weight affects movement rate.',
    defaultValue: 'basic',
    options: [
      {
        value: 'none',
        label: 'None',
        description: 'Every character moves 120 feet per turn regardless of carried weight.',
      },
      {
        value: 'basic',
        label: 'Basic',
        description: 'Worn armour and heavy treasure slow a character down.',
      },
      {
        value: 'detailed',
        label: 'Detailed',
        description: 'Total coin weight of armour, gear, and treasure sets movement rate.',
      },
    ],
  },
  {
    kind: 'select',
    key: 'xp_award_timing',
    label: 'Experience awards',
    description: 'Choose when the party receives earned experience.',
    defaultValue: 'on_return',
    options: [
      {
        value: 'on_return',
        label: 'On returning to town',
        description: 'Survivors receive experience once they return to town, as in standard B/X.',
      },
      {
        value: 'immediate',
        label: 'As soon as it is earned',
        description: 'Characters receive experience right away, which fits delves that never return to town.',
      },
    ],
  },
  {
    kind: 'boolean',
    key: 'variable_weapon_damage',
    label: 'Variable weapon damage',
    description: 'Weapons roll their listed damage dice instead of 1d6 for every weapon.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'individual_initiative',
    label: 'Individual initiative',
    description: 'Each combatant rolls initiative individually instead of rolling once per side.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'thac0_arithmetic',
    label: 'THAC0 arithmetic',
    description: 'Calculate to-hit rolls with THAC0 minus armour class instead of the attack matrix.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'weapon_reload',
    label: 'Weapon reload',
    description: 'Crossbows and other slow-loading weapons must spend a round reloading between shots.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'hd5_counts_as_magical',
    label: 'Big monsters count as magical',
    description: 'Monsters with 5 hit dice or more can hit creatures harmed only by silver or magic weapons.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'magic_item_death_save',
    label: 'Saving throws for magic items',
    description:
      'When breath weapons or destructive effects kill a character, each of their magic items makes a saving throw to survive.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'deprivation_penalties',
    label: 'Hunger and thirst penalties',
    description: 'Going without food or water penalizes attacks, movement, and eventually hit points.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'aoe_friendly_fire',
    label: 'Area spells catch allies',
    description: 'Area spells such as fireball can hit party members engaged in melee with the target.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'formation_width_limit',
    label: 'Passage width limits melee',
    description:
      'Corridor width limits how many combatants can fight side by side, such as two abreast in a 10-foot passage.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'failed_trap_removal_springs',
    label: 'Failed trap removal springs the trap',
    description: 'A thief who fails to remove a treasure trap triggers it.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'hp_reroll_at_first_level',
    label: 'Reroll low first-level hit points',
    description: 'Reroll 1s and 2s on hit dice at character creation.',
    defaultValue: false,
  },
];

export interface OptionalRulesProps {
  /** The rules that differ from the defaults. */
  value: RulesetChoices;
  onChange: (value: RulesetChoices) => void;
  disabled?: boolean;
}

/** The optional rules for a new game, each with its effect in a sentence. */
export function OptionalRules({ value, onChange, disabled }: OptionalRulesProps) {
  const set = (key: keyof Ruleset, next: unknown, defaultValue: unknown) => {
    const copy: Record<string, unknown> = { ...value };
    if (next === defaultValue) delete copy[key];
    else copy[key] = next;
    onChange(copy as RulesetChoices);
  };
  const changed = Object.keys(value).length;
  return (
    <div className={styles.rules}>
      <div className={styles.rulesHeader}>
        <p className={styles.note}>
          {changed === 0
            ? 'Using standard B/X rules. Toggle any house rule below before starting.'
            : `${changed === 1 ? '1 rule differs' : `${changed} rules differ`} from standard B/X.`}
        </p>
        {changed > 0 && (
          <Button size="sm" variant="ghost" icon="undo" disabled={disabled} onClick={() => onChange({})}>
            Reset to standard rules
          </Button>
        )}
      </div>
      <ul className={styles.ruleList}>
        {OPTIONAL_RULES.map((rule) => (
          <li key={rule.key} className={styles.rule}>
            {rule.kind === 'boolean' ? (
              <Switch
                label={rule.label}
                description={rule.description}
                labelPosition="start"
                disabled={disabled}
                checked={(value[rule.key] as boolean | undefined) ?? rule.defaultValue}
                onCheckedChange={(checked) => set(rule.key, checked, rule.defaultValue)}
              />
            ) : (
              <div className={styles.ruleSelect}>
                <div>
                  <p className={styles.ruleLabel} id={`rule-${rule.key}`}>
                    {rule.label}
                  </p>
                  <p className={styles.ruleDescription}>
                    {rule.options.find(
                      (o) => o.value === ((value[rule.key] as string | undefined) ?? rule.defaultValue),
                    )?.description ?? rule.description}
                  </p>
                </div>
                <Select
                  aria-label={rule.label}
                  disabled={disabled}
                  value={(value[rule.key] as string | undefined) ?? rule.defaultValue}
                  options={rule.options.map((o) => ({ value: o.value, label: o.label }))}
                  onValueChange={(next) => set(rule.key, next, rule.defaultValue)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
