import { useEffect, useMemo, useState } from 'react';
import { getApi, useFeed, useGame, useTableId } from '@/app';
import { foldQuestEvents, isQuestEvent, type QuestHistory } from './model/quests';

const PAGE = 500;
const MAX_PAGES = 40;

interface Loaded {
  key: string;
  history: Map<string, QuestHistory>;
}

const cache = new Map<string, Promise<Map<string, QuestHistory>>>();

async function loadHistory(tableId: string): Promise<Map<string, QuestHistory>> {
  let history = new Map<string, QuestHistory>();
  let after = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await getApi().listEvents(tableId, { after, limit: PAGE });
    history = foldQuestEvents(
      result.events.filter(
        (event): event is { event_type: string } =>
          typeof event === 'object' &&
          event !== null &&
          typeof (event as { event_type?: unknown }).event_type === 'string',
      ),
      history,
    );
    if (result.events.length < PAGE || result.next_after <= after) break;
    after = result.next_after;
  }
  return history;
}

/**
 * What the party has done with each quest in this session: the event log, read once per session, and the quest
 * events in the feed since. The player view drops a quest once it is finished, so this is where the quest log
 * finds the finished ones.
 */
export function useQuestHistory(): ReadonlyMap<string, QuestHistory> {
  const tableId = useTableId();
  const sessionId = useGame()?.session_id ?? null;
  const feed = useFeed();
  const key = sessionId === null ? null : `${tableId}:${sessionId}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    let request = cache.get(key);
    if (request === undefined) {
      request = loadHistory(tableId);
      cache.set(key, request);
      request.catch(() => cache.delete(key));
    }
    request.then(
      (history) => {
        if (!cancelled) setLoaded({ key, history });
      },
      () => {
        // The quest log still shows the active quests and the feed's quest events.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, tableId]);

  return useMemo(() => {
    const base = loaded !== null && loaded.key === key ? loaded.history : new Map<string, QuestHistory>();
    const events = feed.flatMap((entry) =>
      entry.kind === 'game' && entry.session_id === sessionId
        ? entry.events.filter((event): event is typeof event & { event_type: string } =>
            isQuestEvent(event as { event_type: string }),
          )
        : [],
    );
    return foldQuestEvents(events as Parameters<typeof foldQuestEvents>[0], base);
  }, [loaded, key, feed, sessionId]);
}
