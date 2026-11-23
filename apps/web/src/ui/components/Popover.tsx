import { Popover as PopoverPrimitive, Slot, Tooltip as TooltipPrimitive } from 'radix-ui';
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  type FocusEvent,
  type HTMLAttributes,
  type ReactElement,
  type Ref,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/hooks';
import { Kbd } from './Kbd';
import styles from './Popover.module.css';

type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';

export interface PopoverProps {
  /** The element that opens the popover, usually a Button or IconButton. */
  trigger: ReactElement;
  children: ReactNode;
  /** Optional heading inside the popover. It also names the popover for assistive technology. */
  title?: ReactNode;
  /**
   * Accessible name for a popover without a `title`, such as "Light". Every popover needs a name, because it
   * opens as a dialog.
   */
  label?: string;
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
  label,
  open,
  defaultOpen,
  onOpenChange,
  side = 'bottom',
  align = 'center',
  width,
  className,
}: PopoverProps) {
  const titleId = useId();
  const named = title ? { 'aria-labelledby': titleId } : label ? { 'aria-label': label } : {};
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
          {...named}
        >
          {title && (
            <p id={titleId} className={styles.title}>
              {title}
            </p>
          )}
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

export type TooltipSide = Side;

interface TooltipTriggerValue {
  /** Opens the tooltip, such as when someone presses an unavailable control to learn why. */
  reveal: () => void;
}

/**
 * Set around a kit tooltip's trigger. A kit control inside it doesn't add a second tooltip, and an unavailable
 * control inside it opens this tooltip when pressed.
 */
export const TooltipTriggerContext = createContext<TooltipTriggerValue | null>(null);

/** Keys that move focus from one control to the next, in the page or in a toolbar, tab list, or menu. */
const NAVIGATION_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** Whether the last input was a key that moves focus, rather than a pointer or a key that acts. */
let navigating = true;
let trackingInput = false;

/** Records whether the person last moved focus with the keyboard, for {@link openOnKeyboardFocus}. */
function trackInput(): void {
  if (trackingInput || typeof document === 'undefined') return;
  trackingInput = true;
  document.addEventListener('keydown', (event) => (navigating = NAVIGATION_KEYS.has(event.key)), true);
  document.addEventListener('pointerdown', () => (navigating = false), true);
}

/**
 * Opens the tooltip on focus only when the person moved focus there with the keyboard. Focus that a script moves,
 * such as into a dialog that just opened or back to the button of a menu that just closed, leaves the tooltip
 * shut. Otherwise the tooltip would open over the page for no reason, and the first Escape would close it instead
 * of the dialog.
 */
function openOnKeyboardFocus(event: FocusEvent<HTMLElement>) {
  if (!navigating) event.preventDefault();
}

/**
 * Passes the trigger's props through without the tooltip's description, for a trigger that describes itself or
 * whose tooltip repeats its name.
 */
const WithoutDescription = forwardRef<HTMLElement, { keep?: string; children: ReactElement }>(
  function WithoutDescription({ keep, children, ...props }, ref) {
    const { 'aria-describedby': _described, ...rest } = props as { 'aria-describedby'?: string };
    return (
      <Slot.Root ref={ref} {...rest} aria-describedby={keep}>
        {children}
      </Slot.Root>
    );
  },
);

export interface TooltipProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'content' | 'children'> {
  /** Short text. A tooltip adds to an accessible name and never replaces one. */
  content: ReactNode;
  /** Keys shown after the text, such as `['M']`. */
  shortcut?: string | string[];
  side?: Side;
  align?: Align;
  /**
   * Whether screen readers read the text as the trigger's description while the tooltip shows. Defaults to true.
   * Turn it off when the text repeats the trigger's accessible name, or when the trigger already has a
   * description that says the same thing.
   */
  describe?: boolean;
  /** Controls whether the tooltip shows. Leave both out to let the tooltip open on hover and focus by itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * A single focusable element. Props that a parent trigger passes to the tooltip, such as a popover's, reach
   * this element, so `<Popover trigger={<Tooltip ...><button /></Tooltip>}>` works.
   */
  children: ReactElement;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A short hint on hover and on keyboard focus. Kit controls take a `tooltip` prop and render this for you, so
 * use it directly only for a trigger that isn't a kit control. Inside another tooltip's trigger it renders only
 * its child, so a control never shows two tooltips.
 */
export function Tooltip({
  content,
  shortcut,
  side = 'top',
  align = 'center',
  describe = true,
  open,
  onOpenChange,
  children,
  ...triggerProps
}: TooltipProps) {
  trackInput();
  const hasProvider = useContext(ProviderPresent);
  const outer = useContext(TooltipTriggerContext);
  const [isOpen, setOpen] = useControllableState(open, false, onOpenChange);
  const trigger = useMemo<TooltipTriggerValue>(() => ({ reveal: () => setOpen(true) }), [setOpen]);
  if (outer) return <Slot.Root {...triggerProps}>{children}</Slot.Root>;
  const { 'aria-describedby': describedBy, onFocus, ...passed } = triggerProps;
  const tip = (
    <TooltipPrimitive.Root open={isOpen} onOpenChange={setOpen}>
      <TooltipTriggerContext.Provider value={trigger}>
        <TooltipPrimitive.Trigger
          asChild
          {...passed}
          aria-describedby={describe ? describedBy : undefined}
          onFocus={(event) => {
            onFocus?.(event);
            openOnKeyboardFocus(event);
          }}
        >
          {describe ? children : <WithoutDescription keep={describedBy}>{children}</WithoutDescription>}
        </TooltipPrimitive.Trigger>
      </TooltipTriggerContext.Provider>
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
