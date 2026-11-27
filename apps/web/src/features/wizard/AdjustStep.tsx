import type { AbilityTables } from '@bxvtt/shared/bxapi';
import { abilityLabel, classInSentence, classLabel, joinList } from '@bxvtt/shared/text';
import { useEffect, useRef } from 'react';
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

/**
 * What the step shows about the trade: what the server said, plus a trade the player is still making. A trade in
 * progress isn't a wrong choice, so it carries guidance about the next step and not a refusal.
 */
export type AdjustCheckState = CheckState | { status: 'in_progress'; guidance: string[] };

/** The element that says what to do next about a trade in progress. The Continue button points to it. */
export const ADJUST_GUIDANCE_ID = 'adjust-trade-guidance';

export interface AdjustStepProps {
  scores: Scores;
  adjustment: Adjustment;
  onChange: (adjustment: Adjustment) => void;
  detail: ClassDetail | null;
  tables: AbilityTables | null;
  check: AdjustCheckState;
  /**
   * How many times the player has tried to continue with the trade in progress. Each try moves focus to the
   * note that says to finish the trade or reset it, so a screen reader reads it again.
   */
  continueAttempts?: number;
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
export function AdjustStep({
  scores,
  adjustment,
  onChange,
  detail,
  tables,
  check,
  continueAttempts = 0,
}: AdjustStepProps) {
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
  const name = detail ? classInSentence(classLabel(detail.id)) : 'this class';
  const unfinished = traded && check.status === 'in_progress';
  const guidance = check.status === 'in_progress' ? check.guidance : [];
  const blockedNote = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (continueAttempts > 0) blockedNote.current?.focus();
  }, [continueAttempts]);

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
                  disabledReason={`A ${name} can't lower ${abilityLabel(ability)}.`}
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
        <div className={styles.adjustVerdict}>
          {/*
            The polite region announces each state as the player clicks. Guidance is an info banner, a status, so
            it never sounds like an error.
          */}
          <div aria-live="polite">
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
            {unfinished && (
              <Banner tone="info" title="Your ability trade isn't finished">
                <span id={ADJUST_GUIDANCE_ID}>{guidance.join(' ')}</span>
              </Banner>
            )}
            {traded && check.status === 'invalid' && (
              <Banner tone="warning" title="This ability trade isn't allowed">
                {general.length > 0
                  ? general.join(' ')
                  : 'Check the message beside each adjusted score above.'}
              </Banner>
            )}
          </div>
          {/* Outside the live region: focus moves here, so a screen reader reads it once. */}
          {unfinished && continueAttempts > 0 && (
            <p ref={blockedNote} tabIndex={-1} className={styles.adjustBlocked}>
              Finish the trade, or reset to your rolled scores, before you continue.
            </p>
          )}
        </div>
        {traded && (
          <Button
            variant={unfinished ? 'secondary' : 'ghost'}
            icon="undo"
            onClick={() => onChange({ lowered: {}, raised: {} })}
          >
            Reset to rolled scores
          </Button>
        )}
      </div>
    </div>
  );
}
