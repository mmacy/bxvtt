import type { ClassSummary, EquipmentSummary } from '@bxvtt/shared/bxapi';
import { abilityLabel, classLabel, itemNoun, joinList, emptyContext } from '@bxvtt/shared/text';
import { tokenClass, useRulesEntry, type ClassDetail } from '@/app';
import { Accordion, Badge, Checkbox, Skeleton, TokenPortrait, cx, formatModifier } from '@/ui';
import { requirementGap } from './RollStep';
import { xpModifierFor, type Scores } from './tables';
import styles from './wizard.module.css';

const RACES: Record<string, string> = {
  human: 'Human',
  dwarf: 'Demihuman: dwarf',
  elf: 'Demihuman: elf',
  halfling: 'Demihuman: halfling',
};

/** The class's armour rule, as its entry states it. */
export function armourText(detail: ClassDetail): string {
  const shields = detail.armour.shields_allowed ? 'shields allowed' : 'no shields';
  switch (detail.armour.kind) {
    case 'any':
      return `Any armour, ${shields}`;
    case 'leather_only':
      return `Leather armour only, ${shields}`;
    case 'none':
      return detail.armour.shields_allowed ? 'No armour, shields allowed' : 'No armour or shields';
    default:
      return `Armour as the class description says, ${shields}`;
  }
}

/** The class's weapon rule, as its entry states it. */
export function weaponText(detail: ClassDetail, equipment: readonly EquipmentSummary[] | null): string {
  const ctx = emptyContext();
  const names = detail.weapons.weapon_ids.map(
    (id) => equipment?.find((item) => item.id === id)?.name.toLowerCase() ?? itemNoun(id, ctx),
  );
  switch (detail.weapons.kind) {
    case 'any':
      return 'Any weapon';
    case 'allowed':
      return `Only ${joinList(names, 'or')}`;
    case 'forbidden':
      return `Any weapon except ${joinList(names, 'or')}`;
    default:
      return names.length > 0 ? joinList(names) : 'See the class description';
  }
}

interface CardProps {
  summary: ClassSummary;
  scores: Scores;
  eligible: boolean;
  selected: boolean;
  onSelect: () => void;
  equipment: readonly EquipmentSummary[] | null;
}

function ClassCard({ summary, scores, eligible, selected, onSelect, equipment }: CardProps) {
  const entry = useRulesEntry<ClassDetail>(`classes/${summary.id}`);
  const detail = entry.data;
  const gap = requirementGap(summary, scores);
  const xp = detail ? xpModifierFor(detail, scores) : null;
  const reqs = Object.entries(summary.requirements);
  const reasonId = `class-reason-${summary.id}`;
  return (
    <button
      type="button"
      className={cx(styles.classCard, selected && styles.classCardSelected)}
      aria-pressed={selected}
      disabled={!eligible}
      aria-describedby={!eligible ? reasonId : undefined}
      onClick={onSelect}
    >
      <span className={styles.classHead}>
        <TokenPortrait name={summary.name} characterClass={tokenClass(summary.id)} size={40} decorative />
        <span className={styles.classTitle}>
          <span className={styles.className}>{classLabel(summary.id)}</span>
          <span className={styles.classRace}>{RACES[summary.race] ?? summary.race}</span>
        </span>
        {selected && (
          <Badge tone="accent" icon="check">
            Chosen
          </Badge>
        )}
      </span>
      {!eligible && gap && (
        <span id={reasonId} className={styles.classReason}>
          Needs {gap}.
        </span>
      )}
      <dl className={styles.classFacts}>
        <div>
          <dt>Requires</dt>
          <dd>
            {reqs.length === 0
              ? 'Nothing'
              : reqs.map(([ability, minimum]) => `${abilityLabel(ability, 'short')} ${minimum}`).join(', ')}
          </dd>
        </div>
        <div>
          <dt>Prime requisite</dt>
          <dd>
            {summary.prime_requisites.map((a) => abilityLabel(a, 'short')).join(' and ')}
            {xp !== null && (
              <span className={cx(styles.xpMod, xp > 0 && styles.xpGood, xp < 0 && styles.xpBad)}>
                {xp === 0 ? ' · no XP change' : ` · ${formatModifier(xp)}% XP`}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Hit die</dt>
          <dd>d{summary.hit_die}</dd>
        </div>
        <div>
          <dt>Armour</dt>
          <dd>{detail ? armourText(detail) : <Skeleton width="8em" />}</dd>
        </div>
        <div>
          <dt>Weapons</dt>
          <dd>{detail ? weaponText(detail, equipment) : <Skeleton width="8em" />}</dd>
        </div>
        <div>
          <dt>Highest level</dt>
          <dd>{summary.max_level}</dd>
        </div>
      </dl>
      {detail && detail.abilities.length > 0 && (
        <span className={styles.abilityTags}>{detail.abilities.map((a) => a.name).join(' · ')}</span>
      )}
    </button>
  );
}

export interface ClassStepProps {
  classes: ClassSummary[] | null;
  scores: Scores;
  eligible: readonly string[];
  classId: string | null;
  onSelect: (classId: string) => void;
  hpReroll: boolean;
  onHpReroll: (value: boolean) => void;
  equipment: readonly EquipmentSummary[] | null;
}

/** Step 2: choose a class, with the facts a new player needs and the reason a class is out of reach. */
export function ClassStep({
  classes,
  scores,
  eligible,
  classId,
  onSelect,
  hpReroll,
  onHpReroll,
  equipment,
}: ClassStepProps) {
  const selected = useRulesEntry<ClassDetail>(classId ? `classes/${classId}` : null);
  if (classes === null) return <Skeleton shape="block" height={360} />;
  const sorted = [...classes].sort(
    (a, b) => Number(eligible.includes(b.id)) - Number(eligible.includes(a.id)),
  );
  return (
    <div className={styles.stepBody}>
      <div className={styles.classGrid} role="group" aria-label="Classes">
        {sorted.map((summary) => (
          <ClassCard
            key={summary.id}
            summary={summary}
            scores={scores}
            eligible={eligible.includes(summary.id)}
            selected={summary.id === classId}
            onSelect={() => onSelect(summary.id)}
            equipment={equipment}
          />
        ))}
      </div>
      {selected.data && (
        <section className={styles.classDetail} aria-labelledby="class-detail-title">
          <h3 id="class-detail-title" className={styles.subTitle}>
            What a {classLabel(selected.data.id).toLowerCase()} can do
          </h3>
          {selected.data.abilities.length === 0 ? (
            <p className={styles.muted}>
              A {classLabel(selected.data.id).toLowerCase()} has no special abilities and relies on armour,
              weapons, and hit points.
            </p>
          ) : (
            <Accordion
              type="multiple"
              items={selected.data.abilities.map((ability) => ({
                value: ability.tag,
                title: ability.name,
                content: <p className={styles.prose}>{ability.prose}</p>,
              }))}
            />
          )}
        </section>
      )}
      <Checkbox
        label="Reroll a first hit die of 1 or 2"
        description="An optional rule. Turn it on only if your referee plays with it."
        checked={hpReroll}
        onCheckedChange={onHpReroll}
      />
    </div>
  );
}
