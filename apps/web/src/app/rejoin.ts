/**
 * Rejoining a table after its address changed. A player whose browser lost its sign-in asks to come back in as
 * the member they were, and a referee lets them in. This module holds the referee's side (the pending requests
 * and the actions that decide one) and the visitor's way to end a request. The join page asks and polls with
 * `getApi()` directly.
 *
 * ```tsx
 * const requests = useRejoinRequests();
 * const { approve, decline, pending } = useDecideRejoin();
 * <Button onClick={() => void approve(request.id)}>Let them in</Button>
 * ```
 */
import { isProblem } from '@bxvtt/shared/client';
import type { RejoinRequestSummary } from '@bxvtt/shared/protocol';
import { useCallback } from 'react';
import { getApi } from './api';
import { useApiAction } from './commands';
import { useTableStore, useTableStoreApi } from './table/context';

/** The table's pending rejoin requests, oldest first. Referees only: a player always gets an empty list. */
export function useRejoinRequests(): RejoinRequestSummary[] {
  return useTableStore((s) => s.rejoinRequests);
}

/** Approves or declines a pending rejoin request, and keeps the list the server returns. Referees only. */
export function useDecideRejoin(): {
  approve: (requestId: string) => Promise<boolean>;
  decline: (requestId: string) => Promise<boolean>;
  pending: boolean;
} {
  const store = useTableStoreApi();
  const { run, pending } = useApiAction();
  const decide = useCallback(
    async (requestId: string, approve: boolean) => {
      const { tableId } = store.getState();
      const result = await run(
        () =>
          approve ? getApi().approveRejoin(tableId, requestId) : getApi().declineRejoin(tableId, requestId),
        { errorTitle: approve ? "Couldn't let them in" : "Couldn't answer the request" },
      );
      if (result.ok) store.setState({ rejoinRequests: result.value.items });
      return result.ok;
    },
    [store, run],
  );
  return {
    approve: useCallback((requestId: string) => decide(requestId, true), [decide]),
    decline: useCallback((requestId: string) => decide(requestId, false), [decide]),
    pending,
  };
}

function cancelPath(requestId: string): string {
  return `/api/rejoin/${encodeURIComponent(requestId)}/cancel`;
}

/**
 * Ends the visitor's waiting rejoin request, so the referee's prompt drops it at once. Call it before the page
 * stops waiting.
 *
 * @param requestId - The ticket's `request_id`.
 * @param secret - The ticket's `secret`.
 * @throws BxvttProblemError when the server refuses, such as `rejoin_not_pending` for a request that already ended.
 */
export async function cancelRejoin(requestId: string, secret: string): Promise<void> {
  await getApi().cancelRejoin(requestId, secret);
}

/**
 * Ends the visitor's waiting rejoin request while the page goes away (the tab closes, or the browser leaves the
 * page). It sends a beacon, or a `keepalive` request where beacons aren't available, which the browser finishes
 * after the page is gone. It never throws.
 *
 * @param requestId - The ticket's `request_id`.
 * @param secret - The ticket's `secret`.
 */
export function cancelRejoinOnLeave(requestId: string, secret: string): void {
  const body = JSON.stringify({ secret });
  try {
    // The server reads a beacon's text body as JSON.
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(cancelPath(requestId), body))
      return;
    void fetch(cancelPath(requestId), {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => undefined);
  } catch {
    // The page is going away, and the server ends a request nobody polls within 20 seconds anyway.
  }
}

/**
 * Whether a failed status poll may succeed if the page asks again: the network dropped, the server is restarting,
 * or it asked the page to slow down. Any other problem is the server's definite answer.
 */
export function isTransientFailure(error: unknown): boolean {
  if (!isProblem(error)) return true;
  const { status, code } = error.problem;
  return status >= 500 || status === 408 || status === 429 || code === 'invalid_response';
}
