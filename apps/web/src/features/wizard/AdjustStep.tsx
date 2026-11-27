import type { AbilityTables } from '@bxvtt/shared/bxapi';
import { abilityLabel } from '@bxvtt/shared/text';
import { useEffect, useRef } from 'react';
import type { ClassDetail } from '@/app';
import {
  Badge,
  Banner,
  Button,
  IconButton,
  Skeleton,
  Spinner,
  StatBox,
  cx,
  formatModifier,
  type BadgeTone,
} from '@/ui';
import { adjustedScores, type Adjustment } from './draft';
import { ABILITIES, headlineModifier, xpModifierFor, type Scores } from './tables';
import { tradeControls, tradeLead, tradeStatus, tradeStatusLabel, type TradeStatus } from './tradeControls';
import type { LimitsState } from './useAdjustmentLimits';
import styles from './wizard.module.css';

/** What the server said about the choices. */
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
 * What the server said about the trade. `failed` is a check that got no answer, such as when the server is
 * unreachable, which says nothing about the trade.
 */
export type TradeCheckState = CheckState | { status: 'failed' };

export interface AdjustStepProps {
  scores: Scores;
  adjustment: Adjustment;
  onChange: (adjustment: Adjustment) => void;
  detail: ClassDetail | null;
  /** Whether the class entry won't load, so the step shows its reasons without the prime requisite's name. */
  detailFailed?: boolean;
  tables: AbilityTables | null;
  /** The latest check of the trade. */
  check: TradeCheckState;
  /** bxapi's limits on the trade for the roll and the class. */
  limits: LimitsState;
  /** Reads the limits again after they failed to load. */
  onRetry: () => void;
  /** Whether the read after Try again is running. */
  retrying?: boolean;
  /** How many reads of the limits have failed, so the banner announces each failure. */
  failures?: number;
  /** The class the player chose. */
  classId: string | null;
}

const STATUS_TONES: Record<TradeStatus['kind'], BadgeTone> = {
  untraded: 'neutral',
  unspent: 'info',
  short: 'warning',
  checking: 'neutral',
  invalid: 'danger',
  complete: 'success',
  unchecked: 'neutral',
  unavailable: 'neutral',
};

/**
 * Step 3, optional: trade ability points. The step enables each control from bxapi's limits and shows the
 * reason when one is disabled. The rules engine checks each trade as the player makes it, and the step shows a
 * refusal that names a score next to that score.
 */
export function AdjustStep({
  scores,
  adjustment,
  onChange,
  detail,
  detailFailed = false,
  tables,
  check,
  limits,
  onRetry,
  retrying = false,
  failures = 0,
  classId,
}: AdjustStepProps) {
  const primes = detail?.prime_requisites ?? [];
  // The reasons name the prime requisite from the class entry, so the step waits for both before it shows any. If
  // the entry won't load, the reasons read without the name.
  const loaded = limits.status === 'ready' && (detail !== null || detailFailed) ? limits.limits : null;
  const input = { limits: loaded, scores, adjustment, classId, primes };
  const controls = tradeControls(input);
  const status = tradeStatus(limits, adjustment, check.status);
  const label = tradeStatusLabel(status);
  const byAbility = check.status === 'invalid' ? (check.byAbility ?? {}) : {};
  const general = status.kind === 'invalid' && check.status === 'invalid' ? check.sentences : [];
  const adjusted = adjustedScores(scores, adjustment);
  const before = detail ? xpModifierFor(detail, scores) : null;
  const after = detail ? xpModifierFor(detail, adjusted) : null;
  const traded = status.kind !== 'untraded';
  const unfinished = status.kind === 'unspent' || status.kind === 'short';
  // After Try again, focus moves from the banner to the lead sentence that replaces it.
  const lead = useRef<HTMLParagraphElement>(null);
  const focusLead = useRef(false);
  useEffect(() => {
    if (focusLead.current && loaded !== null) {
      focusLead.current = false;
      lead.current?.focus();
    }
  }, [loaded]);
  // A retry that fails again keeps focus on Try again, so a later load for another reason leaves focus alone.
  useEffect(() => {
    focusLead.current = false;
  }, [failures]);

  return (
    <div className={styles.stepBody}>
      {limits.status === 'failed' ? (
        <Banner
          tone="warning"
          title="Couldn't check which scores you can trade"
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              loading={retrying}
              onClick={() => {
                focusLead.current = true;
                onRetry();
              }}
            >
              Try again
            </Button>
          }
        >
          {/* A new node for each failure, so the alert announces a retry that fails again with the same text. */}
          <span key={failures}>{limits.detail}</span>
        </Banner>
      ) : (
        <p ref={lead} tabIndex={-1} className={styles.lead}>
          {loaded === null ? <Skeleton width="24em" /> : tradeLead({ ...input, limits: loaded })}
        </p>
      )}
      <div className={styles.adjustGrid} role="group" aria-label="Ability trades">
        {ABILITIES.map((ability) => {
          const change = (adjustment.raised[ability] ?? 0) - (adjustment.lowered[ability] ?? 0);
          const prime = primes.includes(ability);
          const value = adjusted[ability];
          const row = controls[ability];
          return (
            <div key={ability} className={cx(styles.adjustRow, change !== 0 && styles.adjustChanged)}>
              <span className={styles.adjustName}>
                {abilityLabel(ability)}
                {prime && <Badge tone="accent">Prime requisite</Badge>}
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
                  disabled={!row.lower.enabled}
                  disabledReason={row.lower.reason ?? undefined}
                  onClick={() => row.lower.next && onChange(row.lower.next)}
                />
                <span className={styles.adjustChange} aria-live="polite">
                  {change === 0 ? '0' : formatModifier(change)}
                </span>
                <IconButton
                  icon="plus"
                  label={`Raise ${abilityLabel(ability)}`}
                  size="sm"
                  variant="secondary"
                  disabled={!row.raise.enabled}
                  disabledReason={row.raise.reason ?? undefined}
                  onClick={() => row.raise.next && onChange(row.raise.next)}
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
          {status.kind === 'checking' && (
            <span className={styles.checking}>
              <Spinner size={14} label="" /> Checking the trade
            </span>
          )}
          {label !== null && <Badge tone={STATUS_TONES[status.kind]}>{label}</Badge>}
          {general.length > 0 && <span>{general.join(' ')}</span>}
          {status.kind === 'complete' && before !== null && after !== null && before !== after && (
            <span className={styles.muted}>
              Your experience modifier changes from {formatModifier(before)}% to {formatModifier(after)}%.
            </span>
          )}
        </div>
        {traded && (
          <Button
            variant={unfinished ? 'secondary' : 'ghost'}
            icon="undo"
            onClick={() => onChange({ lowered: {}, raised: {} })}
          >
            Reset scores
          </Button>
        )}
      </div>
    </div>
  );
}
