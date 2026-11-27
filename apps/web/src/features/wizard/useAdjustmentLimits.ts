import type { AdjustmentLimits } from '@bxvtt/shared/protocol';
import { useCallback, useEffect, useState } from 'react';
import { describeProblem, getApi } from '@/app';
import type { LimitsState } from './tradeControls';

export type { LimitsState } from './tradeControls';

/**
 * Reads the trade limits once for a roll and a class, while `enabled`. The limits depend on nothing else, so the
 * answer holds until the roll or the class changes, including when the player leaves the step and comes back. A
 * failure stays until `retry`, and while the read after `retry` runs, the state stays `failed` with `retrying`
 * true, so the step can keep its Try again button, and the focus on it, until the answer arrives.
 *
 * @param rollId - The ability roll, or `null` before one exists.
 * @param classId - The class, or `null` before the player chooses one.
 * @param enabled - Whether to read now, such as while the trade step is open.
 * @param onRefusal - Handles a refusal that ends the roll, such as a newer roll. Returns whether it did.
 * @param onLoaded - Called with each answer as it arrives, with the roll and the class it answers for.
 * @returns The state, whether a retry is running, how many reads have failed, and `retry`, which reads the limits
 *   again after a failure.
 */
export function useAdjustmentLimits(
  rollId: string | null,
  classId: string | null,
  enabled: boolean,
  onRefusal: (error: unknown) => boolean,
  onLoaded?: (limits: AdjustmentLimits, rollId: string, classId: string) => void,
): { state: LimitsState; retrying: boolean; failures: number; retry: () => void } {
  const key = rollId !== null && classId !== null ? `${rollId}:${classId}` : null;
  const [answer, setAnswer] = useState<{ key: string; state: LimitsState } | null>(null);
  // The key and attempt of a retry that is running, so a retry for another roll or class counts for nothing.
  const [retryFor, setRetryFor] = useState<{ key: string; attempt: number } | null>(null);
  // How many reads have failed, so the step can announce a retry that fails with the same text.
  const [failures, setFailures] = useState(0);
  const current = answer !== null && answer.key === key ? answer.state : null;
  const retrying = retryFor !== null && retryFor.key === key;
  const attempt = retrying ? retryFor.attempt : 0;
  const wanted = enabled && key !== null && (current === null || retrying);

  useEffect(() => {
    if (!wanted || key === null || rollId === null || classId === null) return;
    let cancelled = false;
    getApi()
      .getAdjustmentLimits(rollId, { class_id: classId })
      .then(
        (limits) => {
          if (cancelled) return;
          setAnswer({ key, state: { status: 'ready', limits } });
          setRetryFor(null);
          onLoaded?.(limits, rollId, classId);
        },
        (error: unknown) => {
          if (cancelled) return;
          setRetryFor(null);
          if (onRefusal(error)) return;
          setFailures((n) => n + 1);
          // The detail alone can start with a pronoun ("It might be starting"), so the title gives it a subject.
          // The banner has its own Try again button, so the detail leaves out that sentence.
          const message = describeProblem(error, { retryControl: true });
          setAnswer({ key, state: { status: 'failed', detail: `${message.title}. ${message.detail}` } });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [wanted, key, rollId, classId, attempt, onRefusal, onLoaded]);

  const retry = useCallback(() => {
    if (key !== null) setRetryFor((r) => ({ key, attempt: (r?.attempt ?? 0) + 1 }));
  }, [key]);
  return { state: current ?? { status: 'loading' }, retrying, failures, retry };
}
