/**
 * Whether the referee panel shows IDs and cell coordinates. They help a referee who writes adventures or
 * debugs a trigger, but the panel names everything in words without them, so they stay hidden until the referee
 * turns them on. The choice is a per-browser convenience.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { scopedStorage } from '@/app';

const storage = scopedStorage('referee');

const DetailsContext = createContext<{ showIds: boolean; setShowIds: (show: boolean) => void }>({
  showIds: false,
  setShowIds: () => {},
});

/** Holds the panel's "Show IDs" choice for everything inside it. */
export function DetailsProvider({ children }: { children: ReactNode }) {
  const [showIds, setState] = useState(() => storage.read('showIds') === true);
  const setShowIds = useCallback((show: boolean) => {
    setState(show);
    storage.write('showIds', show);
  }, []);
  return <DetailsContext.Provider value={{ showIds, setShowIds }}>{children}</DetailsContext.Provider>;
}

/** Whether to show IDs and cell coordinates, and a setter. */
export function useDetails(): { showIds: boolean; setShowIds: (show: boolean) => void } {
  return useContext(DetailsContext);
}

/** An ID or a cell reference, shown only while the referee has "Show IDs" on. */
export function IdMark({ children, className }: { children: ReactNode; className?: string }) {
  const { showIds } = useDetails();
  if (!showIds) return null;
  return <span className={className}>{children}</span>;
}
