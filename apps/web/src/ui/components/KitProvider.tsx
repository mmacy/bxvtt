import type { ReactNode } from 'react';
import { MotionProvider } from '../lib/motion';
import { TooltipProvider } from './Popover';
import { ToastProvider } from './Toast';

export interface KitProviderProps {
  /**
   * Whether kit components reduce motion, such as the dice tumble. Leave it undefined to follow the system's
   * `prefers-reduced-motion` setting. Pass the app's motion preference here so the kit honors it.
   */
  reducedMotion?: boolean;
  children: ReactNode;
}

/** Shared providers for the kit: motion, tooltip timing, and the toast stack. Render it once at the root. */
export function KitProvider({ reducedMotion, children }: KitProviderProps) {
  return (
    <MotionProvider reducedMotion={reducedMotion}>
      <TooltipProvider>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </MotionProvider>
  );
}
