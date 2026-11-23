import type { ClassSummary, EquipmentSummary } from '@bxvtt/shared/bxapi';
import {
  abilityLabel,
  classLabel,
  emptyContext,
  joinList,
  resolveItemNoun,
  withArticle,
} from '@bxvtt/shared/text';
import { tokenClass, type ClassDetail } from '@/app';
import { Accordion, Badge, Banner, Checkbox, Skeleton, TokenPortrait, cx, formatModifier } from '@/ui';
import { requirementGap } from './RollStep';
import { xpModifierFor, type Scores } from './tables';
import { RuleLink } from '../sheet/RuleLink';
import styles from './wizard.module.css';
import { useClassDetail } from '../sheet/catalogs';

const RACES: Record<string, string> = {
  human: 'Human',
  dwarf: 'Demihuman',
  elf: 'Demihuman',
  halfling: 'Demihuman',
};

/** A catalog title such as "Turning the Undead" in sentence case: "Turning the undead". */
export function sentenceCase(title: string): string {
  return title.charAt(0) + title.slice(1).toLowerCase();
}

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
      return `See class description for armour, ${shields}`;
  }
}

/** The class's weapon rule, as its entry states it. */
export function weaponText(detail: ClassDetail, equipment: readonly EquipmentSummary[] | null): string {
  const ctx = emptyContext();
  const names = detail.weapons.weapon_ids.map(
    (id) => resolveItemNoun(id, ctx, { name: equipment?.find((item) => item.id === id)?.name }).one,
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
  /** Whether rolled hit points fixed the class, so this card can't be chosen unless it's the chosen one. */
  locked: boolean;
  onSelect: () => void;
  equipment: readonly EquipmentSummary[] | null;
}

/** The id of the note that says why the class is fixed. */
const LOCK_NOTE_ID = 'class-lock-note';

function ClassCard({ summary, scores, eligible, selected, locked, onSelect, equipment }: CardProps) {
  const entry = useClassDetail(summary.id);
  const detail = entry.data;
  const gap = requirementGap(summary, scores);
  const xp = detail ? xpModifierFor(detail, scores) : null;
  const reqs = Object.entries(summary.requirements);
  const reasonId = `class-reason-${summary.id}`;
  const facts = `class-facts-${summary.id}`;
  // An unavailable card stays in the tab order, so a keyboard or screen reader user reaches it and hears why.
  const unavailable = !eligible || (locked && !selected);
  return (
    <button
      type="button"
      className={cx(styles.classCard, selected && styles.classCardSelected)}
      aria-pressed={selected}
      aria-disabled={unavailable || undefined}
      aria-labelledby={`class-name-${summary.id}`}
      aria-describedby={
        !eligible ? `${reasonId} ${facts}` : locked && !selected ? `${LOCK_NOTE_ID} ${facts}` : facts
      }
      onClick={() => {
        if (!unavailable) onSelect();
      }}
    >
      <span className={styles.classHead}>
        <TokenPortrait name={summary.name} characterClass={tokenClass(summary.id)} size={40} decorative />
        <span className={styles.classTitle}>
          <span id={`class-name-${summary.id}`} className={styles.className}>
            {classLabel(summary.id)}
          </span>
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
      <dl id={`class-facts-${summary.id}`} className={styles.classFacts}>
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
        <span className={styles.abilityTags}>
          {detail.abilities.map((a) => sentenceCase(a.name)).join(' · ')}
        </span>
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
  /**
   * Whether the player rolled hit points from these ability scores, which fixes `classId` and `hpReroll`. The
   * other classes and the reroll option are then unavailable.
   */
  locked?: boolean;
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
  locked = false,
}: ClassStepProps) {
  const selected = useClassDetail(classId ? classId : null);
  if (classes === null) return <Skeleton shape="block" height={360} />;
  const sorted = [...classes].sort(
    (a, b) => Number(eligible.includes(b.id)) - Number(eligible.includes(a.id)),
  );
  return (
    <div className={styles.stepBody}>
      {locked && classId && (
        <Banner
          tone="info"
          title={`Your class is fixed as ${withArticle(classLabel(classId).toLowerCase())}`}
        >
          <span id={LOCK_NOTE_ID}>
            You rolled hit points for these ability scores, which fixed your class and the reroll option. To
            play another class, select Start over and roll new ability scores.
          </span>
        </Banner>
      )}
      <div className={styles.classGrid} role="group" aria-label="Classes">
        {sorted.map((summary) => (
          <ClassCard
            key={summary.id}
            summary={summary}
            scores={scores}
            eligible={eligible.includes(summary.id)}
            selected={summary.id === classId}
            locked={locked}
            onSelect={() => onSelect(summary.id)}
            equipment={equipment}
          />
        ))}
      </div>
      {selected.data && (
        <section className={styles.classDetail} aria-labelledby="class-detail-title">
          <h3 id="class-detail-title" className={styles.subTitle}>
            What a{' '}
            <RuleLink entry={{ kind: 'classes', id: selected.data.id }}>
              {classLabel(selected.data.id).toLowerCase()}
            </RuleLink>{' '}
            can do
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
                title: sentenceCase(ability.name),
                content: <p className={styles.prose}>{ability.prose}</p>,
              }))}
            />
          )}
        </section>
      )}
      <Checkbox
        label="Reroll a first hit die of 1 or 2"
        description={
          locked
            ? 'Your hit points are rolled, so this option stays as it was when you rolled them.'
            : 'Enable this optional house rule only if your referee uses it at your table.'
        }
        checked={hpReroll}
        onCheckedChange={onHpReroll}
        disabled={locked}
      />
    </div>
  );
}
