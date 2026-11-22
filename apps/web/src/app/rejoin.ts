/**
 * Rejoining a table after its address changed. A player whose browser lost its sign-in asks to come back in as
 * the member they were, and a referee lets them in. This module holds the referee's side: the pending requests
 * and the actions that decide one. The join page drives the visitor's side with `getApi()` directly.
 *
 * ```tsx
 * const requests = useRejoinRequests();
 * const { approve, decline, pending } = useDecideRejoin();
 * <Button onClick={() => void approve(request.id)}>Let them in</Button>
 * ```
 */
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
