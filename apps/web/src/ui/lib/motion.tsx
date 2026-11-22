import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useReducedMotion } from './hooks';

/** The app's motion choice, or `undefined` to follow the system setting. */
const MotionContext = createContext<boolean | undefined>(undefined);

export interface MotionProviderProps {
  /**
   * Whether kit components reduce motion. Leave it undefined to follow the system's `prefers-reduced-motion`
   * setting. The provider also sets `data-motion` on the root element, so the kit's CSS follows the same choice.
   */
  reducedMotion?: boolean;
  children: ReactNode;
}

/** Shares the app's motion choice with kit components. KitProvider renders it from its `reducedMotion` prop. */
export function MotionProvider({ reducedMotion, children }: MotionProviderProps) {
  useEffect(() => {
    if (reducedMotion === undefined || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.motion = reducedMotion ? 'reduce' : 'full';
    return () => {
      delete root.dataset.motion;
    };
  }, [reducedMotion]);
  return <MotionContext.Provider value={reducedMotion}>{children}</MotionContext.Provider>;
}

/**
 * Whether kit components should reduce motion: the value KitProvider received, or the system setting when it
 * received none. Use it instead of {@link useReducedMotion} in a component that animates.
 */
export function useKitReducedMotion(): boolean {
  const chosen = useContext(MotionContext);
  const system = useReducedMotion();
  return chosen ?? system;
}
