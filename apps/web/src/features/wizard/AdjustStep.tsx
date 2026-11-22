import type { AbilityTables } from '@bxvtt/shared/bxapi';
import { abilityLabel, classLabel, joinList } from '@bxvtt/shared/text';
import type { ClassDetail } from '@/app';
import { Banner, Button, IconButton, Spinner, StatBox, cx, formatModifier } from '@/ui';
import { adjustedScores, hasAdjustment, type Adjustment } from './draft';
import { ABILITIES, headlineModifier, xpModifierFor, type Ability, type Scores } from './tables';
import styles from './wizard.module.css';

/** What the server said about the trade. */
export type CheckState =
  { status: 'idle' } | { status: 'checking' } | { status: 'ok' } | { status: 'invalid'; sentences: string[] };

export interface AdjustStepProps {
  scores: Scores;
  adjustment: Adjustment;
  onChange: (adjustment: Adjustment) => void;
  detail: ClassDetail | null;
  tables: AbilityTables | null;
  check: CheckState;
}

const LOWERABLE: readonly Ability[] = ['str', 'int', 'wis'];

/** The signed change the player made to one ability: negative when lowered. */
function changeOf(adjustment: Adjustment, ability: Ability): number {
  return (adjustment.raised[ability] ?? 0) - (adjustment.lowered[ability] ?? 0);
}

/** An adjustment with one ability's change set. */
export function withChange(adjustment: Adjustment, ability: Ability, change: number): Adjustment {
  const lowered = { ...adjustment.lowered };
  const raised = { ...adjustment.raised };
  delete lowered[ability];
  delete raised[ability];
  if (change < 0) lowered[ability] = -change;
  if (change > 0) raised[ability] = change;
  return { lowered, raised };
}

/**
 * Step 3, optional: trade ability points. B/X lets a character lower Strength, Intelligence, or Wisdom by 2 to
 * raise a prime requisite by 1. The server checks each trade as you make it.
 */
export function AdjustStep({ scores, adjustment, onChange, detail, tables, check }: AdjustStepProps) {
  const primes = detail?.prime_requisites ?? [];
  const fixed = detail?.may_not_lower ?? [];
  // The trade the step describes: Strength, Intelligence, and Wisdom go down, and prime requisites go up. The
  // controls offer only those moves, and the rules engine still checks every trade.
  const canLower = (ability: Ability) =>
    LOWERABLE.includes(ability) && !primes.includes(ability) && !fixed.includes(ability);
  const canRaise = (ability: Ability) => primes.includes(ability);
  const adjusted = adjustedScores(scores, adjustment);
  const before = detail ? xpModifierFor(detail, scores) : null;
  const after = detail ? xpModifierFor(detail, adjusted) : null;
  const traded = hasAdjustment(adjustment);
  const name = detail ? classLabel(detail.id).toLowerCase() : 'this class';

  return (
    <div className={styles.stepBody}>
      <p className={styles.lead}>
        You can lower Strength, Intelligence, or Wisdom by 2 points to raise a prime requisite by 1. For a{' '}
        {name}, the prime {primes.length === 1 ? 'requisite is' : 'requisites are'}{' '}
        {joinList(primes.map((a) => abilityLabel(a)))}. No score can drop below 9. This step is optional, so
        skip it to keep the scores you rolled.
      </p>
      <div className={styles.adjustGrid} role="group" aria-label="Ability trades">
        {ABILITIES.map((ability) => {
          const change = changeOf(adjustment, ability);
          const prime = primes.includes(ability);
          const value = adjusted[ability];
          return (
            <div key={ability} className={cx(styles.adjustRow, change !== 0 && styles.adjustChanged)}>
              <span className={styles.adjustName}>
                {abilityLabel(ability)}
                {prime && <span className={styles.primeMark}>Prime requisite</span>}
              </span>
              <span className={styles.adjustRolled} aria-label={`Rolled ${scores[ability]}`}>
                {scores[ability]}
              </span>
              {canLower(ability) || canRaise(ability) ? (
                <span className={styles.adjustControls}>
                  <IconButton
                    icon="minus"
                    label={`Lower ${abilityLabel(ability)}`}
                    size="sm"
                    variant="secondary"
                    disabled={canLower(ability) ? value - 2 < 9 : change <= 0}
                    onClick={() =>
                      onChange(withChange(adjustment, ability, change - (canLower(ability) ? 2 : 1)))
                    }
                  />
                  <span className={styles.adjustChange} aria-live="polite">
                    {change === 0 ? '0' : formatModifier(change)}
                  </span>
                  <IconButton
                    icon="plus"
                    label={`Raise ${abilityLabel(ability)}`}
                    size="sm"
                    variant="secondary"
                    disabled={canRaise(ability) ? value >= 18 : change >= 0}
                    onClick={() =>
                      onChange(withChange(adjustment, ability, change + (canRaise(ability) ? 1 : 2)))
                    }
                  />
                </span>
              ) : (
                <span className={cx(styles.adjustControls, styles.muted)}>Not traded</span>
              )}
              <StatBox
                abbreviation={abilityLabel(ability, 'short')}
                name={`${abilityLabel(ability)} after the trade`}
                score={value}
                modifier={tables ? headlineModifier(tables, ability, value) : undefined}
                prime={prime}
                size="sm"
              />
            </div>
          );
        })}
      </div>

      <div className={styles.adjustFooter}>
        <div className={styles.adjustVerdict} aria-live="polite">
          {!traded && <span className={styles.muted}>No points traded. Your scores stay as rolled.</span>}
          {traded && check.status === 'checking' && (
            <span className={styles.checking}>
              <Spinner size={14} label="" /> Checking the trade with the rules engine
            </span>
          )}
          {traded && check.status === 'ok' && (
            <Banner tone="success" title="The rules engine accepts this trade">
              {before !== null && after !== null && before !== after
                ? `Your experience bonus changes from ${formatModifier(before)}% to ${formatModifier(after)}%.`
                : 'Your experience bonus stays the same.'}
            </Banner>
          )}
          {traded && check.status === 'invalid' && (
            <Banner tone="warning" title="This trade breaks a rule">
              {check.sentences.join(' ')}
            </Banner>
          )}
        </div>
        {traded && (
          <Button variant="ghost" icon="undo" onClick={() => onChange({ lowered: {}, raised: {} })}>
            Keep the scores as rolled
          </Button>
        )}
      </div>
    </div>
  );
}
