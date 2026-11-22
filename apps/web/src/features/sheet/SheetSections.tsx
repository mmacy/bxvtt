/**
 * The parts of a character sheet that every sheet shares: the party member's sheet at the table, a stored
 * character's sheet in the lobby, and the finished character in the wizard. Each part draws bxapi's numbers and
 * computes nothing.
 */
import {
  abilityLabel,
  alignmentLabel,
  classLabel,
  conditionDescription,
  conditionLabel,
  formatFeet,
  languageLabel,
  saveLabel,
} from '@bxvtt/shared/text';
import type { ReactNode } from 'react';
import { tokenClass, useClassCatalog } from '@/app';
import {
  AcShield,
  ConditionChip,
  HpBar,
  ProgressBar,
  StatBox,
  Tooltip,
  TokenPortrait,
  formatModifier,
  type ConditionTone,
} from '@/ui';
import type { SheetModel } from './model';
import { RuleLink } from './RuleLink';
import styles from './sheet.module.css';

const ABILITY_ORDER = ['str', 'int', 'wis', 'dex', 'con', 'cha'] as const;

/** The prime requisites the class catalog lists for a class. */
export function usePrimeRequisites(classId: string): readonly string[] {
  const classes = useClassCatalog();
  return classes.data?.find((entry) => entry.id === classId)?.prime_requisites ?? [];
}

/** The `StatBox` modifier for each ability, from the modifiers bxapi reports. */
function headline(model: SheetModel, ability: string): number | undefined {
  switch (ability) {
    case 'str':
      return model.modifiers.melee;
    case 'wis':
      return model.modifiers.magicSave;
    case 'dex':
      return model.modifiers.missile;
    case 'con':
      return model.modifiers.hitPoints;
    case 'cha':
      return model.modifiers.reactions;
    default:
      return undefined;
  }
}

export interface SheetHeaderProps {
  model: SheetModel;
  /** The seat owner's player color. */
  color?: string;
  /** Who plays the character, shown under the class line. */
  controller?: ReactNode;
  /** Controls at the trailing edge. */
  actions?: ReactNode;
}

/** The sheet's heading: token, name, class and level, alignment, and who plays the character. */
export function SheetHeader({ model, color, controller, actions }: SheetHeaderProps) {
  const down = model.currentHp <= 0;
  const dead = model.conditions.includes('dead');
  return (
    <header className={styles.header}>
      <TokenPortrait
        name={model.name}
        characterClass={tokenClass(model.classId)}
        color={color}
        size={64}
        state={dead ? 'dead' : down ? 'unconscious' : 'normal'}
        decorative
      />
      <div className={styles.headerText}>
        <p className={styles.name}>{model.name}</p>
        <p className={styles.classLine}>
          Level {model.level}{' '}
          <RuleLink entry={{ kind: 'classes', id: model.classId }}>
            {classLabel(model.classId).toLowerCase()}
          </RuleLink>
          {[model.title, alignmentLabel(model.alignment)]
            .filter((part): part is string => Boolean(part))
            .map((part) => (
              <span key={part}>
                <span className="visually-hidden">{', '}</span>
                <span className={styles.dot} aria-hidden="true">
                  ·
                </span>
                {part}
              </span>
            ))}
        </p>
        {controller && <div className={styles.controller}>{controller}</div>}
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </header>
  );
}

/** Hit points, armour class, THAC0, attack bonus, and movement, in one row. */
export function VitalsRow({ model, hideHp = false }: { model: SheetModel; hideHp?: boolean }) {
  return (
    <div className={styles.vitals}>
      {!hideHp && (
        <div className={styles.hpBlock}>
          <span className={styles.vitalLabel}>Hit points</span>
          <HpBar current={model.currentHp} max={model.maxHp} />
        </div>
      )}
      <div className={styles.vital}>
        <AcShield value={model.armourClass} size="lg" />
        <span className={styles.vitalNote}>
          Ascending <span className={styles.num}>{model.armourClassAscending}</span>
        </span>
      </div>
      <Vital label="THAC0" value={String(model.thac0)} hint="The d20 roll needed to hit armour class 0." />
      <Vital
        label="Attack bonus"
        value={formatModifier(model.attackBonus)}
        hint="The bonus to an attack roll against ascending armour class."
      />
      {model.movementFeet !== null && (
        <Vital
          label="Movement"
          value={`${model.movementFeet}′`}
          hint={`${formatFeet(model.movementFeet)} a turn while exploring${
            model.encounterFeet !== null
              ? `, and ${formatFeet(model.encounterFeet)} a round in an encounter`
              : ''
          }.`}
          note={model.encounterFeet !== null ? `${model.encounterFeet}′ a round` : undefined}
        />
      )}
    </div>
  );
}

function Vital({ label, value, hint, note }: { label: string; value: string; hint: string; note?: string }) {
  return (
    <Tooltip content={hint}>
      <div className={styles.vital} tabIndex={0} role="group" aria-label={`${label} ${value}. ${hint}`}>
        <span className={styles.vitalValue} aria-hidden="true">
          {value}
        </span>
        <span className={styles.vitalLabel} aria-hidden="true">
          {label}
        </span>
        {note && (
          <span className={styles.vitalNote} aria-hidden="true">
            {note}
          </span>
        )}
      </div>
    </Tooltip>
  );
}

/** Experience points with progress to the next level. */
export function XpProgress({ model }: { model: SheetModel }) {
  const next = model.xpNextLevel;
  return (
    <div className={styles.xp}>
      <div className={styles.xpText}>
        <span className={styles.vitalLabel}>Experience</span>
        <span className={styles.num}>
          {model.xp.toLocaleString('en-US')}
          {typeof next === 'number' && (
            <span className={styles.muted}>
              {' '}
              of {next.toLocaleString('en-US')} for level {model.level + 1}
            </span>
          )}
          {next === null && <span className={styles.muted}> (highest level)</span>}
        </span>
        {model.xpModifierPct !== null && model.xpModifierPct !== 0 && (
          <span className={styles.muted}>{formatModifier(model.xpModifierPct)}% to experience earned</span>
        )}
      </div>
      {typeof next === 'number' && next > 0 && (
        <ProgressBar
          value={Math.min(model.xp, next)}
          max={next}
          label="Progress to the next level"
          tone="gold"
          size="sm"
        />
      )}
    </div>
  );
}

/** The six ability scores, each with the modifier bxapi reports for it. */
export function AbilityScores({ model }: { model: SheetModel }) {
  const primes = usePrimeRequisites(model.classId);
  return (
    <section className={styles.section} aria-labelledby="sheet-abilities">
      <h3 id="sheet-abilities" className={styles.sectionTitle}>
        Ability scores
      </h3>
      <div className={styles.abilities}>
        {ABILITY_ORDER.map((ability) => (
          <StatBox
            key={ability}
            abbreviation={abilityLabel(ability, 'short')}
            name={abilityLabel(ability)}
            score={model.scores[ability] ?? 0}
            modifier={headline(model, ability)}
            prime={primes.includes(ability)}
          />
        ))}
      </div>
      {model.effectiveStrength !== null && (
        <p className={styles.note}>
          Something this character wears sets their Strength to {model.effectiveStrength}. The melee and door
          numbers use it.
        </p>
      )}
    </section>
  );
}

/** What the ability scores do, as bxapi reports each modifier. */
export function ScoreModifiers({ model }: { model: SheetModel }) {
  const m = model.modifiers;
  const lines: Array<[string, string]> = [
    ['Melee attacks and damage', formatModifier(m.melee)],
    ['Open stuck doors', `${m.openDoors} in 6`],
    ['Missile attacks', formatModifier(m.missile)],
    ['Initiative', formatModifier(m.initiative)],
    ['Hit points per Hit Die', formatModifier(m.hitPoints)],
    ['Saving throws against magic', formatModifier(m.magicSave)],
    ['Reactions', formatModifier(m.reactions)],
  ];
  return (
    <section className={styles.section} aria-labelledby="sheet-modifiers">
      <h3 id="sheet-modifiers" className={styles.sectionTitle}>
        Modifiers
      </h3>
      <dl className={styles.modifierList}>
        {lines.map(([label, value]) => (
          <div key={label} className={styles.modifierRow}>
            <dt>{label}</dt>
            <dd className={styles.num}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The five saving throws. */
export function SavingThrows({ model }: { model: SheetModel }) {
  const order = ['death', 'wands', 'paralysis', 'breath', 'spells'];
  const keys = [
    ...order.filter((k) => k in model.saves),
    ...Object.keys(model.saves).filter((k) => !order.includes(k)),
  ];
  return (
    <section className={styles.section} aria-labelledby="sheet-saves">
      <h3 id="sheet-saves" className={styles.sectionTitle}>
        Saving throws
      </h3>
      <dl className={styles.saves}>
        {keys.map((key) => (
          <div key={key} className={styles.saveRow}>
            <dt>{saveLabel(key)}</dt>
            <dd className={styles.saveValue}>{model.saves[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const THIEF_SKILLS: Record<string, { label: string; inSix?: boolean }> = {
  climb_sheer_surfaces: { label: 'Climb sheer surfaces' },
  find_remove_treasure_traps: { label: 'Find or remove treasure traps' },
  hear_noise: { label: 'Hear noise', inSix: true },
  hide_in_shadows: { label: 'Hide in shadows' },
  move_silently: { label: 'Move silently' },
  open_locks: { label: 'Open locks' },
  pick_pockets: { label: 'Pick pockets' },
};

/** A thief's skills, when the character has any. */
export function ThiefSkills({ skills }: { skills: Record<string, number> }) {
  const entries = Object.entries(skills);
  if (entries.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="sheet-thief">
      <h3 id="sheet-thief" className={styles.sectionTitle}>
        Thief skills
      </h3>
      <dl className={styles.modifierList}>
        {entries.map(([key, value]) => {
          const info = THIEF_SKILLS[key];
          const label = info?.label ?? key.replaceAll('_', ' ');
          return (
            <div key={key} className={styles.modifierRow}>
              <dt>{label.charAt(0).toUpperCase() + label.slice(1)}</dt>
              <dd className={styles.num}>{info?.inSix ? `${value} in 6` : `${value}%`}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

const HARMFUL = new Set([
  'dead',
  'unconscious',
  'paralysed',
  'paralyzed',
  'petrified',
  'poisoned',
  'diseased',
  'blind',
  'held',
  'afraid',
  'feebleminded',
  'confused',
  'weakened',
  'asleep',
  'charmed',
  'cursed',
  'fatigued',
  'exhausted',
]);

/** The tone a condition chip takes. */
export function conditionTone(condition: string): ConditionTone {
  if (HARMFUL.has(condition)) return 'harm';
  if (condition === 'invisible' || condition === 'turned') return 'magic';
  return 'neutral';
}

/** The conditions on the character, or a calm line when there are none. */
export function Conditions({
  conditions,
  compact = false,
}: {
  conditions: readonly string[];
  compact?: boolean;
}) {
  if (conditions.length === 0) {
    return compact ? null : <p className={styles.muted}>No conditions.</p>;
  }
  return (
    <ul className={styles.chips} aria-label="Conditions">
      {conditions.map((condition) => (
        <li key={condition} title={conditionDescription(condition)}>
          <ConditionChip label={conditionLabel(condition)} tone={conditionTone(condition)} />
        </li>
      ))}
    </ul>
  );
}

/** The languages the character speaks. */
export function Languages({ languages }: { languages: readonly string[] }) {
  return (
    <section className={styles.section} aria-labelledby="sheet-languages">
      <h3 id="sheet-languages" className={styles.sectionTitle}>
        Languages
      </h3>
      <p className={styles.prose}>
        {languages.length === 0 ? 'None.' : languages.map((id) => languageLabel(id)).join(', ')}
      </p>
    </section>
  );
}
