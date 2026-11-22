import { Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Kbd } from './Kbd';
import styles from './Popover.module.css';

type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';

export interface PopoverProps {
  /** The element that opens the popover, usually a Button or IconButton. */
  trigger: ReactElement;
  children: ReactNode;
  /** Optional heading inside the popover. */
  title?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: Side;
  align?: Align;
  /** Width as a CSS length. Defaults to fit the content up to 320 px. */
  width?: string;
  className?: string;
}

/** Non-modal content anchored to a trigger, such as a quick setting or a token's details. */
export function Popover({
  trigger,
  children,
  title,
  open,
  defaultOpen,
  onOpenChange,
  side = 'bottom',
  align = 'center',
  width,
  className,
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cx(styles.popover, className)}
          style={width ? { width } : undefined}
        >
          {title && <p className={styles.title}>{title}</p>}
          {children}
          <PopoverPrimitive.Arrow className={styles.arrow} width={12} height={6} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

const ProviderPresent = createContext(false);

/** Shares tooltip timing across the app. KitProvider includes it. */
export function TooltipProvider({ children, delay = 350 }: { children: ReactNode; delay?: number }) {
  return (
    <ProviderPresent.Provider value={true}>
      <TooltipPrimitive.Provider delayDuration={delay} skipDelayDuration={300}>
        {children}
      </TooltipPrimitive.Provider>
    </ProviderPresent.Provider>
  );
}

export interface TooltipProps {
  /** Short text. A tooltip adds to an accessible name and never replaces one. */
  content: ReactNode;
  /** Keys shown after the text, such as `['M']`. */
  shortcut?: string | string[];
  side?: Side;
  align?: Align;
  /** A single focusable element. */
  children: ReactElement;
}

/** A short hint on hover and focus, for icon buttons and abbreviations. */
export function Tooltip({ content, shortcut, side = 'top', align = 'center', children }: TooltipProps) {
  const hasProvider = useContext(ProviderPresent);
  const tip = (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={styles.tooltip}
        >
          <span>{content}</span>
          {shortcut && <Kbd keys={shortcut} className={styles.tooltipKbd} />}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  return hasProvider ? tip : <TooltipProvider>{tip}</TooltipProvider>;
}
