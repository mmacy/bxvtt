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
    description: 'How carried weight sets movement rate.',
    defaultValue: 'basic',
    options: [
      { value: 'none', label: 'None', description: 'Everyone moves 120 feet a turn, whatever they carry.' },
      {
        value: 'basic',
        label: 'Basic',
        description: 'Worn armour and a significant load of treasure slow a character.',
      },
      {
        value: 'detailed',
        label: 'Detailed',
        description: 'The weight of armour, gear, and treasure adds up and sets movement rate.',
      },
    ],
  },
  {
    kind: 'select',
    key: 'xp_award_timing',
    label: 'Experience awards',
    description: 'When the party receives the experience it earns.',
    defaultValue: 'on_return',
    options: [
      {
        value: 'on_return',
        label: 'On returning to town',
        description: 'The tabletop rule: survivors receive experience once they are back in town.',
      },
      {
        value: 'immediate',
        label: 'As soon as it is earned',
        description: 'Suits a game where the party never goes home.',
      },
    ],
  },
  {
    kind: 'boolean',
    key: 'variable_weapon_damage',
    label: 'Variable weapon damage',
    description:
      'Each weapon deals the damage its description lists. Turn it off and every weapon deals 1d6.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'individual_initiative',
    label: 'Individual initiative',
    description: 'Every combatant rolls initiative, instead of one roll for each side.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'thac0_arithmetic',
    label: 'THAC0 arithmetic',
    description: 'The number to hit is THAC0 minus armour class, instead of the attack matrix.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'weapon_reload',
    label: 'Weapon reload',
    description: "A crossbow, or another weapon that must reload, can't fire two rounds in a row.",
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'hd5_counts_as_magical',
    label: 'Big monsters count as magical',
    description:
      'A monster of 5 Hit Dice or more can hurt creatures that only silver or magic weapons can harm.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'magic_item_death_save',
    label: 'Saving throws for magic items',
    description:
      'When a breath weapon or a similar effect kills a character, each of their magic items saves to survive it.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'deprivation_penalties',
    label: 'Hunger and thirst penalties',
    description: 'Going without food or water costs attack bonus, then movement, then hit points.',
    defaultValue: false,
  },
  {
    kind: 'boolean',
    key: 'aoe_friendly_fire',
    label: 'Area spells catch allies',
    description:
      'A spell such as fireball, cast at monsters in melee, can hit the party members fighting them.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'formation_width_limit',
    label: 'Passage width limits melee',
    description:
      'Only as many combatants fight side by side as the passage allows: two in a 10-foot corridor.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'failed_trap_removal_springs',
    label: 'A failed trap removal springs the trap',
    description: 'A thief who fails to remove a treasure trap sets it off.',
    defaultValue: true,
  },
  {
    kind: 'boolean',
    key: 'hp_reroll_at_first_level',
    label: 'Reroll low first-level hit points',
    description: 'A first-level hit die that comes up 1 or 2 is rolled again.',
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
            ? 'The game uses the standard B/X rules. Change a rule here before you start.'
            : `${changed === 1 ? 'One rule differs' : `${changed} rules differ`} from the standard.`}
        </p>
        {changed > 0 && (
          <Button size="sm" variant="ghost" icon="undo" disabled={disabled} onClick={() => onChange({})}>
            Use the standard rules
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
