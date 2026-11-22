import { useEffect, useState } from 'react';
import { describeProblem, getApi, type ProblemMessage } from '../api';
import { useTableStore } from './context';
import { useRefereeLens } from './hooks';

const documents = new Map<string, Promise<Record<string, unknown>>>();

/**
 * The full adventure document of the current game, with its map and key, for a referee with the lens on. It
 * loads once per session from `GET /api/tables/{t}/game/adventure` and is shared by every caller. For a player,
 * and for a referee with the lens off, it is `null` and nothing loads.
 */
export function useAdventureDocument(): {
  data: Record<string, unknown> | null;
  loading: boolean;
  error: ProblemMessage | null;
} {
  const lens = useRefereeLens();
  const tableId = useTableStore((s) => s.tableId);
  const sessionId = useTableStore((s) => s.game?.session_id ?? null);
  const key = lens && sessionId !== null ? `${tableId}:${sessionId}` : null;
  const [state, setState] = useState<{
    key: string | null;
    data: Record<string, unknown> | null;
    error: ProblemMessage | null;
  }>({ key: null, data: null, error: null });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    let request = documents.get(key);
    if (request === undefined) {
      request = getApi().getAdventureDocument(tableId);
      documents.set(key, request);
      request.catch(() => documents.delete(key));
    }
    request.then(
      (data) => {
        if (!cancelled) setState({ key, data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setState({ key, data: null, error: describeProblem(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, tableId]);

  if (key === null) return { data: null, loading: false, error: null };
  if (state.key !== key) return { data: null, loading: true, error: null };
  return { data: state.data, loading: false, error: state.error };
}
