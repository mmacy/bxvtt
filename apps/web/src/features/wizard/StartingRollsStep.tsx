import type { CreationRules, StartingRolls } from '@bxvtt/shared/protocol';
import { classLabel, count, joinList, withArticle } from '@bxvtt/shared/text';
import { useEffect, useRef } from 'react';
import { Banner, Button, DiceRoll, Die, Icon, Skeleton, formatModifier, type DieSides } from '@/ui';
import styles from './wizard.module.css';

const DIE_SIDES: readonly DieSides[] = [4, 6, 8, 10, 12, 20];

/** The kit's die for a class's hit die, or `null` when the kit has no such die. */
function dieFor(sides: number | null): DieSides | null {
  return DIE_SIDES.find((s) => s === sides) ?? null;
}

/** The id of the sentence that says what rolling hit points fixes. */
export const HIT_POINT_LOCK_NOTE_ID = 'wizard-hit-point-lock';
const GOLD_WAIT_NOTE_ID = 'wizard-gold-wait';

export interface StartingRollsStepProps {
  /** The class the hit points are rolled for. */
  classId: string;
  /** The class's hit die from the class catalog, such as 8 for a d8, or `null` while the catalog loads. */
  hitDie: number | null;
  /** The Constitution modifier to hit points from the abilities table, or `undefined` while the table loads. */
  conModifier: number | undefined;
  /** The creation rules recorded on the ability roll, which the hit points are rolled under. */
  rules: CreationRules | null;
  /** Whether the wizard offers Start over, because the table lets the player roll new ability scores. */
  canStartOver: boolean;
  /** The rolls the server recorded, with their dice, or `null` before the player rolls hit points. */
  rolls: StartingRolls | null;
  /** Whether the wizard is still reading the rolls from the server. */
  loading: boolean;
  /** The roll the server is making right now. */
  rolling: 'hit_points' | 'gold' | null;
  /** Which rolls to play, because the player just made them. A roll restored from the server lands at once. */
  animate: { hitPoints: boolean; gold: boolean };
  onRollHitPoints: () => void;
  onRollGold: () => void;
  /** Why the rolls couldn't be read, or `null`. */
  failure: string | null;
  onRetry: () => void;
}

/**
 * The hit points and gold step: the player rolls hit points with the class's hit die, or takes the maximum under
 * that house rule, then rolls starting gold, and sees the dice of each. bxapi rolls both, and every number here
 * comes from its answer or from the rules catalogs. Rolling hit points fixes the class for the ability scores.
 */
export function StartingRollsStep({
  classId,
  hitDie,
  conModifier,
  rules,
  canStartOver,
  rolls,
  loading,
  rolling,
  animate,
  onRollHitPoints,
  onRollGold,
  failure,
  onRetry,
}: StartingRollsStepProps) {
  const className = classLabel(classId).toLowerCase();
  const sides = dieFor(hitDie);
  const hp = rolls?.hit_point_roll ?? null;
  const gold = rolls?.gold_roll ?? null;
  const goldButton = useRef<HTMLButtonElement>(null);
  const goldResult = useRef<HTMLParagraphElement>(null);
  // A roll button goes away once its roll is made, so focus moves on to what the player does next: the gold
  // button after the hit points, and the gold result after the gold, which is just before Continue.
  const freshHitPoints = hp !== null && gold === null && animate.hitPoints;
  const freshGold = gold !== null && animate.gold;
  useEffect(() => {
    if (freshHitPoints) goldButton.current?.focus();
  }, [freshHitPoints]);
  useEffect(() => {
    if (freshGold) goldResult.current?.focus();
  }, [freshGold]);
  // With the maximum taken, the die's face doesn't count, so the dice the reroll set aside don't matter either.
  const maximized = hp?.maximized === true;
  const setAside = hp && !maximized ? hp.rolls.slice(0, -1) : [];
  const kept = hp ? (hp.rolls.at(-1) ?? null) : null;
  const maxRule = rules?.max_hp_at_first_level === true;
  const article = withArticle(className);

  if (failure !== null) {
    return (
      <Banner
        tone="warning"
        title="Couldn't read your rolls"
        actions={
          <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {failure}
      </Banner>
    );
  }
  if (loading) return <Skeleton shape="block" height={280} />;

  return (
    <div className={styles.startGrid}>
      <section className={styles.startPanel} aria-labelledby="wizard-hit-points">
        <h4 id="wizard-hit-points" className={styles.subTitle}>
          Hit points
        </h4>
        <dl className={styles.startFacts}>
          <div>
            <dt>Class</dt>
            <dd>{classLabel(classId)}</dd>
          </div>
          <div>
            <dt>Hit die</dt>
            <dd>{hitDie === null ? <Skeleton width="2em" /> : `d${hitDie}`}</dd>
          </div>
          <div>
            <dt>Constitution</dt>
            <dd>
              {conModifier === undefined ? (
                <Skeleton width="2em" />
              ) : conModifier === 0 ? (
                'No modifier'
              ) : (
                formatModifier(conModifier)
              )}
            </dd>
          </div>
          {maxRule ? (
            <div>
              <dt>Maximum hit points</dt>
              <dd>On</dd>
            </div>
          ) : (
            <div>
              <dt>Hit die reroll</dt>
              <dd>{rules?.hp_reroll_at_first_level === true ? 'On' : 'Off'}</dd>
            </div>
          )}
        </dl>
        {hp === null ? (
          <>
            <p id={HIT_POINT_LOCK_NOTE_ID} className={styles.calmNote}>
              <Icon name="info" size={14} />
              <span>
                {maxRule
                  ? `Taking the maximum fixes your class as ${article}, but you can still change your ability trade, identity, and equipment.`
                  : `Rolling hit points fixes your class as ${article}, but you can still change your ability trade, identity, and equipment.`}
                {canStartOver && ' To play another class afterward, start over with new ability scores.'}
              </span>
            </p>
            <div>
              <Button
                variant="primary"
                // The house rule exists so the die isn't rolled, so the button shows no dice.
                icon={maxRule ? undefined : 'dice'}
                loading={rolling === 'hit_points'}
                aria-describedby={HIT_POINT_LOCK_NOTE_ID}
                onClick={onRollHitPoints}
              >
                {maxRule ? 'Take the maximum' : 'Roll hit points'}
              </Button>
            </div>
          </>
        ) : (
          <div className={styles.startResultRow}>
            {setAside.length > 0 && (
              <div
                className={styles.setAside}
                role="group"
                aria-label={`Set aside by the hit die reroll: ${joinList(setAside.map(String))}`}
              >
                <span className={styles.setAsideLabel} aria-hidden="true">
                  Set aside
                </span>
                <span className={styles.setAsideDice} aria-hidden="true">
                  {setAside.map((value, index) =>
                    sides ? (
                      <Die key={index} sides={sides} value={value} size={32} decorative />
                    ) : (
                      <span key={index}>{value}</span>
                    ),
                  )}
                </span>
              </div>
            )}
            {maximized ? (
              sides === null ? (
                <Skeleton shape="block" width={44} height={44} />
              ) : (
                <div className={styles.setAside} role="group" aria-label="Maximum hit die">
                  <span className={styles.setAsideLabel} aria-hidden="true">
                    Maximum
                  </span>
                  <span className={styles.maxRow}>
                    {/* The face of the hit die's maximum is the die's size. */}
                    <Die sides={sides} value={sides} size={44} />
                    {/* The total, as a rolled die shows it, so the Constitution modifier is next to the die. */}
                    <span className={styles.maxTotal} aria-hidden="true">
                      {conModifier !== undefined && conModifier !== 0 && (
                        <span className={styles.maxEquals}>{formatModifier(conModifier)}</span>
                      )}
                      <span className={styles.maxEquals}>=</span>
                      <span className={styles.maxTotalValue}>{hp.hit_points}</span>
                    </span>
                  </span>
                </div>
              )
            ) : sides !== null && kept !== null ? (
              <DiceRoll
                dice={[{ sides, value: kept }]}
                modifier={conModifier ?? 0}
                total={hp.hit_points}
                label="Hit points"
                animate={animate.hitPoints}
              />
            ) : (
              <span className={styles.muted}>Rolled {kept}</span>
            )}
          </div>
        )}
        {hp !== null && (
          <p className={styles.startResult}>
            {setAside.length > 0 &&
              `Your hit die came up ${joinList(setAside.map(String))}, so you rolled again. `}
            You start with {count(hp.hit_points, 'hit point')}.
          </p>
        )}
      </section>

      <section className={styles.startPanel} aria-labelledby="wizard-gold">
        <h4 id="wizard-gold" className={styles.subTitle}>
          Starting gold
        </h4>
        {gold === null ? (
          <>
            <p id={GOLD_WAIT_NOTE_ID} className={styles.calmNote}>
              <Icon name="info" size={14} />
              <span>
                {hp !== null
                  ? 'Roll your starting gold, then spend it on weapons, armour, and gear in the next step.'
                  : maxRule
                    ? 'You roll your starting gold after you take your hit points.'
                    : 'You roll your starting gold after your hit points.'}
              </span>
            </p>
            <div>
              <Button
                ref={goldButton}
                variant={hp === null ? 'secondary' : 'primary'}
                icon="dice"
                disabled={hp === null}
                disabledReason={
                  maxRule
                    ? 'Take your hit points before you roll starting gold.'
                    : 'Roll your hit points before your starting gold.'
                }
                loading={rolling === 'gold'}
                // While the button waits for the hit points, its reason says what the note says.
                aria-describedby={hp === null ? undefined : GOLD_WAIT_NOTE_ID}
                onClick={onRollGold}
              >
                Roll starting gold
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.startResultRow}>
              {/* bxapi's roll gives each die's result but not its size. Starting gold is rolled on d6. */}
              <DiceRoll
                dice={gold.rolls.map((value) => ({ sides: 6, value }))}
                label="Starting gold"
                hideTotal
                animate={animate.gold}
              />
              <span className={styles.goldTimes} aria-hidden="true">
                {gold.modifier !== 0 && `${formatModifier(gold.modifier)} `}× {gold.multiplier} =
              </span>
              <span className={styles.goldBig}>
                <span className={styles.goldCoin} aria-hidden="true" />
                {gold.total}
                <span className={styles.goldUnit}>gp</span>
              </span>
            </div>
            <p ref={goldResult} tabIndex={-1} className={styles.startResult}>
              You start with {count(gold.total, 'gold piece')} to spend on equipment.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
