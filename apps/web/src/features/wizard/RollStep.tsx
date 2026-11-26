import type { AbilityTables, ClassSummary } from '@bxvtt/shared/bxapi';
import type { CreationRules } from '@bxvtt/shared/protocol';
import { abilityLabel, classLabel } from '@bxvtt/shared/text';
import { useEffect, useState } from 'react';
import { useReduceMotion } from '@/app';
import {
  Badge,
  Button,
  DiceRoll,
  Skeleton,
  StatBox,
  Tooltip,
  cx,
  formatDiceFormula,
  formatModifier,
  type RolledDie,
} from '@/ui';
import type { DraftRoll } from './draft';
import { ABILITIES, headlineModifier, modifierLines, readScores, type Ability, type Scores } from './tables';
import styles from './wizard.module.css';

/** How long the wizard waits between one ability's roll and the next, in milliseconds. */
const STAGGER_MS = 320;

/** How the ability scores are rolled: 3d6, or the 4d6 drop lowest house rule. */
export type AbilityScoreMethod = CreationRules['ability_score_method'];

/** What the reroll row offers for a roll, from the rules recorded on it and the server's count of rolls. */
export type RerollOffer =
  /** Nothing: the table allows no rerolls, as B/X is written, or the wizard hasn't read the roll's rules yet. */
  | { kind: 'none' }
  /** Start again: bxapi says the scores are sub-par, and the table lets the player discard them. */
  | { kind: 'sub_par' }
  /** Roll again, with the rerolls left, or `null` for no limit. At 0 the button stays, unavailable. */
  | { kind: 'reroll'; left: number | null };

/**
 * What the reroll row offers for a roll. bxapi decides whether the scores are sub-par, and the server counts the
 * rerolls left, so this only reads their answers.
 *
 * @param roll - The draft's roll.
 */
export function rerollOffer(roll: DraftRoll): RerollOffer {
  const rules = roll.rules;
  const left = roll.rerolls_left;
  if (rules === undefined || left === undefined) return { kind: 'none' };
  if (rules.sub_par_restart && roll.rolls?.sub_par === true) return { kind: 'sub_par' };
  // A table that allowed no rerolls when the player rolled shows nothing, unless the referee has allowed some since.
  if (rules.ability_score_rerolls === 0 && left === 0) return { kind: 'none' };
  return { kind: 'reroll', left };
}

/** Whether the offer lets the player roll new ability scores now. */
export function offersNewScores(offer: RerollOffer): boolean {
  return offer.kind === 'sub_par' || (offer.kind === 'reroll' && (offer.left === null || offer.left >= 1));
}

/**
 * The dice of one ability as the kit plays them: the three that count, in the order bxapi threw them, then the
 * die bxapi dropped, if any, marked.
 *
 * @param kept - The three dice that count.
 * @param dropped - The dropped die, from bxapi's `dropped`.
 */
export function abilityDice(kept: readonly number[], dropped: number | undefined): RolledDie[] {
  const dice: RolledDie[] = kept.map((value) => ({ sides: 6, value }));
  if (dropped !== undefined) dice.push({ sides: 6, value: dropped, dropped: true });
  return dice;
}

const REROLLS_LEFT_ID = 'wizard-rerolls-left';
const SUB_PAR_ID = 'wizard-sub-par';

export interface RollStepProps {
  roll: DraftRoll | null;
  /**
   * How the scores are rolled: the roll's recorded method, or before the first roll, the table's. It sets the
   * text and the placeholders.
   */
  method: AbilityScoreMethod;
  /** Whether to play the dice for this roll. Off for a roll restored from an earlier visit. */
  animate: boolean;
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
  faces,
  dropped,
  method,
  shown,
  animate,
  tables,
  onSettled,
}: {
  ability: Ability;
  score: number;
  /** The three d6 results that count for this ability, in the order bxapi rolled them. */
  faces: readonly [number, number, number] | undefined;
  /** The die bxapi dropped for this ability, or `undefined` for none. */
  dropped: number | undefined;
  method: AbilityScoreMethod;
  shown: boolean;
  animate: boolean;
  tables: AbilityTables | null;
  onSettled?: () => void;
}) {
  // A restored draft shows its scores before it has fetched the dice behind them. When the dice arrive, they
  // appear where they landed instead of rolling again.
  const [restored] = useState(shown && faces === undefined);
  const play = animate && !restored;
  const [settled, setSettled] = useState(!play);
  const modifier = tables ? headlineModifier(tables, ability, score) : undefined;
  const lines = tables ? modifierLines(tables, ability, score) : [];
  return (
    <div className={styles.abilityCell}>
      <div className={styles.diceSlot} aria-busy={shown && faces === undefined ? true : undefined}>
        {shown && faces ? (
          <div className={styles.diceLoading}>
            {/* The cell names the roll itself, so on a phone the formula can sit under the ability's name. */}
            <div className={styles.diceLoadingHeader} aria-hidden="true">
              <span className={styles.diceLoadingLabel}>{abilityLabel(ability)}</span>
              <span className={styles.diceLoadingFormula}>
                {formatDiceFormula(abilityDice(faces, dropped))}
              </span>
            </div>
            <DiceRoll
              dice={abilityDice(faces, dropped)}
              label={abilityLabel(ability)}
              // Four dice share the cell that three fill under 3d6, so each is smaller.
              size={dropped === undefined ? 34 : 26}
              hideTotal
              hideHeader
              highlightExtremes={false}
              animate={play}
              // On a phone, four dice sit in two rows of two, so the dropped die is always last, bottom right.
              diceClassName={dropped === undefined ? undefined : styles.fourDice}
              onSettled={() => {
                setSettled(true);
                onSettled?.();
              }}
            />
          </div>
        ) : shown ? (
          <div className={styles.diceLoading} aria-hidden="true">
            <div className={styles.diceLoadingHeader}>
              <span className={styles.diceLoadingLabel}>{abilityLabel(ability)}</span>
              <span className={styles.diceLoadingFormula}>
                {method === '4d6_drop_lowest' ? '4d6' : '3d6'}
              </span>
            </div>
            <div className={cx(styles.diceLoadingDice, method === '4d6_drop_lowest' && styles.fourDice)}>
              {Array.from({ length: method === '4d6_drop_lowest' ? 4 : 3 }, (_, index) => (
                <Skeleton
                  key={index}
                  shape="block"
                  width={method === '4d6_drop_lowest' ? 26 : 34}
                  height={method === '4d6_drop_lowest' ? 26 : 34}
                />
              ))}
            </div>
          </div>
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
  dice,
  dropped,
  method,
  play,
  tables,
  waiting = false,
  onSettled,
}: {
  scores: Scores | null;
  /** The dice that count for each score, from bxapi's roll. `null` until a restored draft has fetched them. */
  dice: Record<string, readonly [number, number, number]> | null;
  /** The die bxapi dropped for each score, empty for a 3d6 roll. */
  dropped: Record<string, number>;
  method: AbilityScoreMethod;
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
          faces={dice?.[ability]}
          dropped={dropped[ability]}
          method={method}
          shown={index < shownCount}
          animate={play}
          tables={tables}
          onSettled={() => onSettled?.(index)}
        />
      ))}
    </div>
  );
}

/**
 * Step 1: roll the ability scores in order, and see which classes the scores allow. The table's rules, as the
 * server recorded them on the roll, decide whether the player can roll again.
 */
export function RollStep({
  roll,
  method,
  animate,
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
        {/* The step description above gives the dice, and the footer holds Roll ability scores at every width. */}
        <p className={styles.lead}>
          {method === '4d6_drop_lowest'
            ? 'Each score stays where it falls, and you choose from the classes you qualify for.'
            : 'Under B/X rules, you keep each score where it falls and choose from the classes you qualify for.'}
        </p>
        <AbilityRow
          scores={null}
          dice={null}
          dropped={{}}
          method={method}
          play={false}
          tables={tables}
          waiting
        />
      </div>
    );
  }

  const scores = readScores(roll.scores);
  const eligible = new Set(roll.eligible_class_ids);
  const offer = rerollOffer(roll);

  return (
    <div className={styles.stepBody}>
      <AbilityRow
        key={roll.id}
        scores={scores}
        dice={roll.rolls?.rolls ?? null}
        dropped={roll.rolls?.dropped ?? {}}
        method={method}
        play={play}
        tables={tables}
        onSettled={onLanded}
      />

      {revealed && (
        <section className={styles.qualifies} aria-labelledby="wizard-qualifies">
          <h3 id="wizard-qualifies" className={styles.subTitle}>
            {eligible.size === 0 ? 'No classes available with this roll' : 'Classes this roll qualifies for'}
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

      {offer.kind === 'sub_par' && (
        <div className={styles.rerollRow}>
          <Button
            variant="secondary"
            icon="refresh"
            loading={rolling}
            aria-describedby={SUB_PAR_ID}
            onClick={onRoll}
          >
            Start again
          </Button>
          <Badge id={SUB_PAR_ID} tone="warning">
            Sub-par
          </Badge>
        </div>
      )}
      {offer.kind === 'reroll' && (
        <div className={styles.rerollRow}>
          <Button
            variant="secondary"
            icon="refresh"
            loading={rolling}
            disabled={offer.left === 0}
            disabledReason="You've used all the rerolls your table allows."
            aria-describedby={offer.left !== null && offer.left > 0 ? REROLLS_LEFT_ID : undefined}
            onClick={onRoll}
          >
            Roll again
          </Button>
          {offer.left !== null && offer.left > 0 && (
            <Badge id={REROLLS_LEFT_ID} tone="neutral">
              {offer.left} left
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
