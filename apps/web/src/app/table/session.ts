/**
 * One live connection per open table: a {@link TableConnection} that feeds a table store, catches the feed up
 * after a reconnect, expires pings, and turns notices into toasts.
 *
 * Components don't call this module. `TablePage` opens the session with `useTableSession`, and features read the
 * store through the hooks in `app/table/hooks.ts`.
 */
import { TableConnection } from '@bxvtt/shared/client';
import { useEffect, useSyncExternalStore } from 'react';
import { toast } from '@/ui';
import { getApi } from '../api';
import { createTableStore, type TableStore } from './store';

/** How long a ping stays on the map, in milliseconds. */
export const PING_LIFETIME_MS = 4000;

/**
 * The shortest time between two resync requests, in milliseconds. The server answers a fourth resync within
 * 10 seconds with a `rate_limited` error, so the client asks at most once every 5 seconds.
 */
export const RESYNC_INTERVAL_MS = 5000;

/** A table's store and its connection. */
export interface TableSession {
  tableId: string;
  store: TableStore;
  connection: TableConnection;
}

interface Entry {
  session: TableSession;
  refs: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
  dispose: () => void;
}

const sessions = new Map<string, Entry>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribeSessions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const NOTICE_TEXT: Record<string, { title: string; description: string; tone: 'info' | 'success' }> = {
  table_changed: {
    title: 'The table changed',
    description: 'Someone acted before you did. Look at the new state and choose again.',
    tone: 'info',
  },
  game_restored: {
    title: 'A save was restored',
    description: 'The referee loaded a saved game. The table shows it now.',
    tone: 'info',
  },
  game_started: {
    title: 'The game has started',
    description: 'The referee started the game. Everyone is at the table now.',
    tone: 'success',
  },
  game_ended: {
    title: 'The game has ended',
    description: 'The table is back in its lobby. The saves are kept.',
    tone: 'info',
  },
};

/** Shows the toast for a notice. `table_changed` reuses one toast so a burst of conflicts shows one notice. */
export function announceNotice(code: string): void {
  const text = NOTICE_TEXT[code];
  if (text === undefined) return;
  const show = text.tone === 'success' ? toast.success : toast.info;
  show(text.title, { description: text.description, id: `notice-${code}` });
}

function openSession(tableId: string, token: string): Entry {
  const connection = new TableConnection({ token, tableId });
  let lastResync = 0;
  const store = createTableStore(tableId, {
    transport: {
      sendPing: (ping) => connection.sendPing(ping),
      resync: () => {
        const now = Date.now();
        if (now - lastResync < RESYNC_INTERVAL_MS) return;
        lastResync = now;
        connection.resync();
      },
    },
  });
  const pingTimers = new Set<ReturnType<typeof setTimeout>>();

  const offStatus = connection.onStatus((status, reason) => store.getState().setStatus(status, reason));
  const offAny = connection.onAny((message) => {
    const hadFeed = store.getState().feed.length > 0;
    store.getState().receive(message);
    if (message.type === 'snapshot' && hadFeed && message.feed.has_more) void catchUpFeed(store, tableId);
    if (message.type === 'ping') {
      const id = `${message.user_id}-${message.at}-${message.x}-${message.y}`;
      const timer = setTimeout(() => {
        pingTimers.delete(timer);
        store.getState().removePing(id);
      }, PING_LIFETIME_MS);
      pingTimers.add(timer);
    }
    if (message.type === 'notice') announceNotice(message.code);
  });
  connection.connect();

  const session: TableSession = { tableId, store, connection };
  return {
    session,
    refs: 0,
    closeTimer: null,
    dispose: () => {
      offStatus();
      offAny();
      for (const timer of pingTimers) clearTimeout(timer);
      connection.close();
    },
  };
}

/** Pages the feed forward after a reconnect snapshot that couldn't hold every missed entry. */
async function catchUpFeed(store: TableStore, tableId: string): Promise<void> {
  for (let page = 0; page < 20; page += 1) {
    const last = store.getState().feed.at(-1);
    if (last === undefined) return;
    try {
      const result = await getApi().getFeed(tableId, { after: last.seq, limit: 200 });
      store.getState().receiveFeedPage(result, 'newer');
      if (!result.has_more) return;
    } catch {
      return;
    }
  }
}

/**
 * Opens a table's session, or reuses the open one. Call {@link releaseTableSession} when done.
 *
 * @param tableId - The table ID.
 * @param token - The user token.
 */
export function acquireTableSession(tableId: string, token: string): TableSession {
  let entry = sessions.get(tableId);
  if (entry === undefined) {
    entry = openSession(tableId, token);
    sessions.set(tableId, entry);
    notify();
  }
  if (entry.closeTimer !== null) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  }
  entry.refs += 1;
  return entry.session;
}

/**
 * Releases a session. The last release closes the connection after a short delay, so a component that
 * remounts at once (React's development double render) keeps the same socket.
 *
 * @param session - The session from {@link acquireTableSession}.
 */
export function releaseTableSession(session: TableSession): void {
  const entry = sessions.get(session.tableId);
  if (entry === undefined || entry.session !== session) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  entry.closeTimer = setTimeout(() => {
    entry.dispose();
    sessions.delete(session.tableId);
    notify();
  }, 250);
}

/**
 * Opens the session of a table for as long as the calling component is mounted.
 *
 * @param tableId - The table ID.
 * @param token - The user token, or `null` while the user has none.
 * @returns The table's store, or `null` without a token.
 */
export function useTableSession(tableId: string, token: string | null): TableStore | null {
  useEffect(() => {
    if (token === null) return;
    const opened = acquireTableSession(tableId, token);
    return () => releaseTableSession(opened);
  }, [tableId, token]);
  const session = useSyncExternalStore(
    subscribeSessions,
    () => sessions.get(tableId)?.session ?? null,
    () => null,
  );
  return token === null || session === null ? null : session.store;
}
