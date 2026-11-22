import type { ReactNode } from 'react';
import { KitProvider } from '@/ui';
import { useReduceMotion } from './preferences';

/**
 * The kit's providers with the user's motion preference, so kit components such as `DiceRoll` honor the choice in
 * the preferences as well as the system setting. The app root renders it in place of `KitProvider`.
 */
export function AppKitProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useReduceMotion();
  return <KitProvider reducedMotion={reducedMotion}>{children}</KitProvider>;
}
