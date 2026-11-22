import type { AbilityTables, ClassSummary } from '@bxvtt/shared/bxapi';
import type { AbilityRoll } from '@bxvtt/shared/protocol';
import { abilityLabel, classLabel } from '@bxvtt/shared/text';
import { useEffect, useState } from 'react';
import { useReduceMotion } from '@/app';
import { Badge, Button, DiceRoll, Icon, StatBox, Tooltip, formatModifier } from '@/ui';
import { facesForScore } from './dice';
import { ABILITIES, headlineModifier, modifierLines, readScores, type Ability, type Scores } from './tables';
import styles from './wizard.module.css';

/** How long the wizard waits between one ability's roll and the next, in milliseconds. */
const STAGGER_MS = 320;

export interface RollStepProps {
  roll: AbilityRoll | null;
  /** Whether to play the dice for this roll. Off for a roll restored from an earlier visit. */
  animate: boolean;
  rolls: number;
  rolling: boolean;
  onRoll: () => void;
  classes: ClassSummary[] | null;
  tables: AbilityTables | null;
  /** Called when every score of the roll has landed, so the wizard lets the player continue. */
  onRevealed?: (rollId: string) => void;
}

/** The reason a roll doesn't qualify for a class, from the class's requirements in the catalog. */
export function requirementGap(summary: ClassSummary, scores: Record<string, number>): string | null {
  const missing = Object.entries(summary.requirements).filter(
    ([ability, minimum]) => typeof minimum === 'number' && (scores[ability] ?? 0) < minimum,
  );
  if (missing.length === 0) return null;
  return missing
    .map(([ability, minimum]) => `${abilityLabel(ability)} ${minimum} (you rolled ${scores[ability] ?? 0})`)
    .join(' and ');
}

/** A short form of {@link requirementGap} for a badge: "needs CON 9". */
export function shortGap(summary: ClassSummary, scores: Record<string, number>): string | null {
  const missing = Object.entries(summary.requirements).filter(
    ([ability, minimum]) => typeof minimum === 'number' && (scores[ability] ?? 0) < minimum,
  );
  if (missing.length === 0) return null;
  return `needs ${missing.map(([ability, minimum]) => `${abilityLabel(ability, 'short')} ${minimum}`).join(' and ')}`;
}

function AbilityCell({
  ability,
  score,
  index,
  shown,
  animate,
  tables,
  onSettled,
}: {
  ability: Ability;
  score: number;
  index: number;
  shown: boolean;
  animate: boolean;
  tables: AbilityTables | null;
  onSettled?: () => void;
}) {
  const [settled, setSettled] = useState(!animate);
  const faces = facesForScore(score, index);
  const modifier = tables ? headlineModifier(tables, ability, score) : undefined;
  const lines = tables ? modifierLines(tables, ability, score) : [];
  return (
    <div className={styles.abilityCell}>
      <div className={styles.diceSlot}>
        {shown ? (
          <DiceRoll
            dice={faces.map((value) => ({ sides: 6, value }))}
            label={abilityLabel(ability)}
            size={34}
            hideTotal
            highlightExtremes={false}
            animate={animate}
            onSettled={() => {
              setSettled(true);
              onSettled?.();
            }}
          />
        ) : (
          <span className={styles.diceWaiting} aria-hidden="true">
            {abilityLabel(ability)}
          </span>
        )}
      </div>
      <div className={styles.statSlot} data-settled={shown && settled}>
        {shown && settled ? (
          <Tooltip
            content={
              lines.length > 0 ? (
                <span className={styles.tooltipLines}>
                  {lines.map((line) => (
                    <span key={line.label}>
                      {line.label}:{' '}
                      {line.signed && typeof line.value === 'number'
                        ? formatModifier(line.value)
                        : line.value}
                    </span>
                  ))}
                </span>
              ) : (
                abilityLabel(ability)
              )
            }
          >
            <span tabIndex={0} className={styles.statFocus}>
              <StatBox
                abbreviation={abilityLabel(ability, 'short')}
                name={abilityLabel(ability)}
                score={score}
                modifier={modifier}
                size="lg"
              />
            </span>
          </Tooltip>
        ) : (
          <span className={styles.statPlaceholder} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

/** The six scores, each revealed a moment after the one before when the roll plays. */
function AbilityRow({
  scores,
  play,
  tables,
  waiting = false,
  onSettled,
}: {
  scores: Scores | null;
  play: boolean;
  tables: AbilityTables | null;
  waiting?: boolean;
  onSettled?: (index: number) => void;
}) {
  const [shownCount, setShownCount] = useState(waiting ? 0 : play ? 1 : ABILITIES.length);
  useEffect(() => {
    if (!play) return;
    const timers = ABILITIES.slice(1).map((_, i) =>
      setTimeout(() => setShownCount(i + 2), STAGGER_MS * (i + 1)),
    );
    return () => timers.forEach(clearTimeout);
  }, [play]);
  return (
    <div className={styles.abilityRow}>
      {ABILITIES.map((ability, index) => (
        <AbilityCell
          key={ability}
          ability={ability}
          score={scores?.[ability] ?? 0}
          index={index}
          shown={index < shownCount}
          animate={play}
          tables={tables}
          onSettled={() => onSettled?.(index)}
        />
      ))}
    </div>
  );
}

/** Step 1: roll 3d6 for each ability, in order, and see which classes the scores allow. */
export function RollStep({
  roll,
  animate,
  rolls,
  rolling,
  onRoll,
  classes,
  tables,
  onRevealed,
}: RollStepProps) {
  const reduceMotion = useReduceMotion();
  // The scores that have landed for each roll. The classes the roll allows appear once all six have.
  const [landed, setLanded] = useState<{ rollId: string | null; indexes: readonly number[] }>({
    rollId: null,
    indexes: [],
  });
  const rollId = roll?.id ?? null;
  const revealed =
    rollId !== null &&
    (!(animate && !reduceMotion) || (landed.rollId === rollId && landed.indexes.length >= 6));
  useEffect(() => {
    if (revealed && rollId !== null) onRevealed?.(rollId);
  }, [revealed, rollId, onRevealed]);
  const onLanded = (index: number) =>
    setLanded((current) => {
      const base = current.rollId === rollId ? current.indexes : [];
      return base.includes(index) ? current : { rollId, indexes: [...base, index] };
    });
  const play = animate && !reduceMotion;

  if (!roll) {
    return (
      <div className={styles.stepBody}>
        <AbilityRow scores={null} play={false} tables={tables} waiting />
        <div className={styles.rollCall}>
          <p className={styles.lead}>
            The six scores, from Strength to Charisma, decide which classes you can choose, and you can't
            rearrange them.
          </p>
          <Button variant="primary" icon="dice" size="lg" loading={rolling} onClick={onRoll}>
            Roll ability scores
          </Button>
        </div>
      </div>
    );
  }

  const scores = readScores(roll.scores);
  const eligible = new Set(roll.eligible_class_ids);

  return (
    <div className={styles.stepBody}>
      <AbilityRow key={roll.id} scores={scores} play={play} tables={tables} onSettled={onLanded} />

      {revealed && (
        <section className={styles.qualifies} aria-labelledby="wizard-qualifies">
          <h3 id="wizard-qualifies" className={styles.subTitle}>
            {eligible.size === 0 ? 'This roll qualifies for no class' : 'Classes this roll qualifies for'}
          </h3>
          <ul className={styles.classBadges}>
            {(classes ?? []).map((summary) => {
              const ok = eligible.has(summary.id);
              const gap = scores ? shortGap(summary, scores) : null;
              return (
                <li key={summary.id}>
                  {ok ? (
                    <Badge tone="success" icon="check">
                      {classLabel(summary.id)}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" appearance="outline">
                      {gap ? `${classLabel(summary.id)}, ${gap}` : classLabel(summary.id)}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className={styles.rerollRow}>
        <Button variant="secondary" icon="refresh" loading={rolling} onClick={onRoll}>
          Roll again
        </Button>
        <p className={styles.calmNote}>
          <Icon name="info" size={14} />
          <span>
            The rules engine lets you roll as often as you like
            {rolls > 1 ? `, and you have rolled ${rolls} times` : ''}. Your referee may have a house rule,
            such as one roll only, so ask before you roll again.
          </span>
        </p>
      </div>
    </div>
  );
}
