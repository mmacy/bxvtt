import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { TableState, TableStore } from './store';

const TableStoreContext = createContext<TableStore | null>(null);

/**
 * Makes a table store available to the hooks below it. `TablePage` renders it around the lobby and the play
 * screen. Tests render it through `renderWithTable`.
 */
export function TableProvider({ store, children }: { store: TableStore; children: ReactNode }) {
  return <TableStoreContext.Provider value={store}>{children}</TableStoreContext.Provider>;
}

/** The table store of the surrounding {@link TableProvider}. Throws outside one. */
export function useTableStoreApi(): TableStore {
  const store = useContext(TableStoreContext);
  if (store === null) throw new Error('useTableStoreApi needs a TableProvider above it.');
  return store;
}

/**
 * Reads part of the open table's state. Select a field that the store replaces wholesale, or derive with
 * `useMemo`, because a selector that builds a new object on every call re-renders forever.
 *
 * ```tsx
 * const mode = useTableStore((s) => s.game?.mode ?? null);
 * ```
 */
export function useTableStore<T>(selector: (state: TableState) => T): T {
  return useStore(useTableStoreApi(), selector);
}
