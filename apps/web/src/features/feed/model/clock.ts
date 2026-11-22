/**
 * The game clock of each game entry. A feed entry states the revision after its command but not the game time,
 * so this module watches the table store and records the clock at every revision it sees, in this browser. An
 * entry from before this browser watched shows no game time.
 */
import { useSyncExternalStore } from 'react';
import type { TableStore } from '@/app';
import { readClocks, recordClock } from './storage';

const listeners = new Set<() => void>();
let version = 0;
const watched = new WeakSet<TableStore>();

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function record(store: TableStore): void {
  const game = store.getState().game;
  if (game === null) return;
  if (recordClock(game.session_id, game.revision, game.view.clock_rounds)) notify();
}

/**
 * Starts recording the clock of a table. It keeps watching after the component that called it unmounts, so the
 * feed knows the game time of commands sent while another dock tab is open.
 *
 * @param store - The table store from `useTableStoreApi`.
 */
export function watchClock(store: TableStore): void {
  if (watched.has(store)) return;
  watched.add(store);
  record(store);
  store.subscribe((state, previous) => {
    if (state.game !== previous.game) record(store);
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A number that changes whenever a clock is recorded, so a row re-reads its clock. */
export function useClockVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
}

/** The game clock in rounds at a revision of a session, or `null` when this browser never saw it. */
export function clockAt(sessionId: string, revision: number): number | null {
  return readClocks(sessionId)[String(revision)] ?? null;
}
