import { useState, type ReactNode } from 'react';
import { TableProvider } from './context';
import { createTableStore } from './store';

/**
 * An empty table for a screen outside any table, such as the home page, so a feature that reads the table can
 * render there. The reader counts as a player with no game: `useMyRole()` is `player`, `useIsReferee()` is
 * false, `useGameMode()` is `null`, and every list is empty. The compendium renders on the home page this way.
 *
 * ```tsx
 * <NoTableProvider>
 *   <Compendium open={open} onOpenChange={setOpen} entry={entry} />
 * </NoTableProvider>
 * ```
 */
export function NoTableProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createTableStore('', { initial: { role: 'player' } }));
  return <TableProvider store={store}>{children}</TableProvider>;
}
