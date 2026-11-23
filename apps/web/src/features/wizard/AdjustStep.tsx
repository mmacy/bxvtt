import type { AbilityTables } from '@bxvtt/shared/bxapi';
import { abilityLabel, classLabel, joinList } from '@bxvtt/shared/text';
import type { ClassDetail } from '@/app';
import { Banner, Button, IconButton, Spinner, StatBox, cx, formatModifier } from '@/ui';
import { adjustedScores, hasAdjustment, type Adjustment } from './draft';
import { ABILITIES, headlineModifier, xpModifierFor, type Ability, type Scores } from './tables';
import styles from './wizard.module.css';

/** What the server said about the trade. */
export type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok' }
  | {
      status: 'invalid';
      sentences: string[];
      /** The refusals that name a score, keyed by ability, to show next to that score. */
      byAbility?: Partial<Record<string, string[]>>;
    };

export interface AdjustStepProps {
  scores: Scores;
  adjustment: Adjustment;
  onChange: (adjustment: Adjustment) => void;
  detail: ClassDetail | null;
  tables: AbilityTables | null;
  check: CheckState;
}

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
 * Step 3, optional: trade ability points. The rules engine checks each trade as the player makes it, and a
 * refusal that names a score shows next to that score.
 */
export function AdjustStep({ scores, adjustment, onChange, detail, tables, check }: AdjustStepProps) {
  const primes = detail?.prime_requisites ?? [];
  // The class entry states which scores the trade can't lower: `may_not_lower`, which bxapi documents as the
  // abilities the adjustment can't lower "besides the prime requisites". Every other limit (which scores can go
  // down or up, the rate, the floor and the cap) is the rules engine's to check, so those controls stay open
  // and the engine's refusal explains a trade it won't take.
  const fixed = detail?.may_not_lower ?? [];
  const cannotLower = (ability: Ability) => primes.includes(ability) || fixed.includes(ability);
  const byAbility = check.status === 'invalid' ? (check.byAbility ?? {}) : {};
  const general = check.status === 'invalid' ? check.sentences : [];
  const adjusted = adjustedScores(scores, adjustment);
  const before = detail ? xpModifierFor(detail, scores) : null;
  const after = detail ? xpModifierFor(detail, adjusted) : null;
  const traded = hasAdjustment(adjustment);
  const name = detail ? classLabel(detail.id).toLowerCase() : 'this class';

  return (
    <div className={styles.stepBody}>
      <p className={styles.lead}>
        In B/X, most classes can lower Strength, Intelligence, or Wisdom by 2 points to raise a prime
        requisite by 1, down to a minimum score of 9. For a {name}, your prime{' '}
        {primes.length === 1 ? 'requisite is' : 'requisites are'}{' '}
        {joinList(primes.map((a) => abilityLabel(a)))}. Skip this step if you want to keep your rolled scores.
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
              <span className={styles.adjustControls}>
                <IconButton
                  icon="minus"
                  label={`Lower ${abilityLabel(ability)}`}
                  size="sm"
                  variant="secondary"
                  disabled={change <= 0 && cannotLower(ability)}
                  title={
                    change <= 0 && cannotLower(ability)
                      ? `A ${name} can't lower ${abilityLabel(ability)}.`
                      : undefined
                  }
                  onClick={() => onChange(withChange(adjustment, ability, change - 1))}
                />
                <span className={styles.adjustChange} aria-live="polite">
                  {change === 0 ? '0' : formatModifier(change)}
                </span>
                <IconButton
                  icon="plus"
                  label={`Raise ${abilityLabel(ability)}`}
                  size="sm"
                  variant="secondary"
                  onClick={() => onChange(withChange(adjustment, ability, change + 1))}
                />
              </span>
              <span className={styles.adjustStat}>
                <StatBox
                  abbreviation={abilityLabel(ability, 'short')}
                  name={`${abilityLabel(ability)} after the trade`}
                  score={value}
                  modifier={tables ? headlineModifier(tables, ability, value) : undefined}
                  prime={prime}
                  size="sm"
                />
              </span>
              {(byAbility[ability] ?? []).length > 0 && (
                <p className={styles.adjustRefusal} role="status">
                  {(byAbility[ability] ?? []).join(' ')}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.adjustFooter}>
        <div className={styles.adjustVerdict} aria-live="polite">
          {!traded && (
            <span className={styles.muted}>No points traded. Your rolled scores are unchanged.</span>
          )}
          {traded && check.status === 'checking' && (
            <span className={styles.checking}>
              <Spinner size={14} label="" /> Checking ability trade
            </span>
          )}
          {traded && check.status === 'ok' && (
            <Banner tone="success" title="Valid ability trade">
              {before !== null && after !== null && before !== after
                ? `Your experience modifier changes from ${formatModifier(before)}% to ${formatModifier(after)}%.`
                : 'Your experience modifier stays the same.'}
            </Banner>
          )}
          {traded && check.status === 'invalid' && (
            <Banner tone="warning" title="This ability trade isn't allowed">
              {general.length > 0 ? general.join(' ') : 'Check the message beside each adjusted score above.'}
            </Banner>
          )}
        </div>
        {traded && (
          <Button variant="ghost" icon="undo" onClick={() => onChange({ lowered: {}, raised: {} })}>
            Reset to rolled scores
          </Button>
        )}
      </div>
    </div>
  );
}
