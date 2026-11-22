import type { ReactNode } from 'react';
import { TooltipProvider } from './Popover';
import { ToastProvider } from './Toast';

/** Shared providers for the kit: tooltip timing and the toast stack. Render it once at the root. */
export function KitProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>{children}</ToastProvider>
    </TooltipProvider>
  );
}
