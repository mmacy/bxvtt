import { DropdownMenu as DropdownPrimitive, Toolbar } from 'radix-ui';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, IconButton, type ButtonVariant } from '../components/Button';
import { DropdownMenu, menuContentClass, renderDropdownEntries, type MenuEntry } from '../components/Menu';
import { Tooltip } from '../components/Popover';
import type { IconName } from '../icons/Icon';
import styles from './TableLayout.module.css';

/** What the bar's overflow menu needs to list an `ActionBarMenu` as a submenu. */
interface MenuRecord {
  label: string;
  icon?: IconName;
  items: MenuEntry[];
  disabled: boolean;
}

interface ActionBarContextValue {
  /** Records a menu item's entries under its button, and returns the function that removes them. */
  register: (element: HTMLElement, record: MenuRecord) => () => void;
}

const ActionBarContext = createContext<ActionBarContextValue | null>(null);

const OVERFLOWED = 'data-overflowed';
const SLACK = 0.5;

function isSeparator(element: Element): boolean {
  return element.getAttribute('role') === 'separator';
}

function widthOf(elements: readonly HTMLElement[], gap: number): number {
  let total = 0;
  for (const element of elements) total += element.getBoundingClientRect().width;
  return total + gap * Math.max(0, elements.length - 1);
}

/**
 * Fits the bar's items into its width. It first shows every item in full, then hides the labels of buttons that
 * have an icon, and then moves items from the end into the "More" menu. It reads layout synchronously and
 * writes only attributes the components don't render, so nothing paints between the steps.
 *
 * @returns The items that moved into the overflow menu, in order.
 */
function fitItems(container: HTMLElement, more: HTMLElement | null): HTMLElement[] {
  const items = [...container.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child !== more,
  );
  container.removeAttribute('data-density');
  more?.removeAttribute('data-active');
  for (const item of items) {
    item.removeAttribute(OVERFLOWED);
    item.inert = false;
  }
  const shown = items.filter((item) => item.getClientRects().length > 0);
  const gap = Number.parseFloat(window.getComputedStyle(container).columnGap) || 0;
  const available = container.clientWidth;
  if (available <= 0 || widthOf(shown, gap) <= available + SLACK) return [];

  container.setAttribute('data-density', 'compact');
  if (widthOf(shown, gap) <= available + SLACK) return [];

  if (!more) return [];
  more.setAttribute('data-active', '');
  const moreWidth = more.getBoundingClientRect().width;
  const hidden: HTMLElement[] = [];
  while (shown.length > 0 && widthOf(shown, gap) + gap + moreWidth > available + SLACK) {
    const last = shown.pop();
    if (last) hidden.unshift(last);
  }
  // A divider with nothing after it moves too.
  while (shown.length > 0) {
    const last = shown.at(-1);
    if (!last || !isSeparator(last)) break;
    shown.pop();
    hidden.unshift(last);
  }
  for (const item of hidden) {
    item.setAttribute(OVERFLOWED, '');
    item.inert = true;
  }
  const moved = hidden.filter((item) => !isSeparator(item));
  if (moved.length === 0) more.removeAttribute('data-active');
  return moved;
}

function sameElements(a: readonly HTMLElement[], b: readonly HTMLElement[]): boolean {
  return a.length === b.length && a.every((element, index) => element === b[index]);
}

/** The accessible name of a bar button, for its entry in the overflow menu. */
function nameOf(element: HTMLElement): string {
  const label = element.getAttribute('aria-label');
  if (label) return label;
  const text = element.querySelector('[data-button-label]')?.textContent ?? element.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

/** Presses a button that sits in the overflow, which is inert while it waits there. */
function press(element: HTMLElement): void {
  element.inert = false;
  if (element.getAttribute('aria-haspopup') === 'menu') {
    // A Radix menu trigger opens on pointer down, not on click. It opens at the end of the bar.
    element.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
    );
  } else {
    element.click();
  }
  element.inert = true;
}

export interface ActionBarProps {
  /** Accessible name, such as "Party actions". */
  'aria-label': string;
  /** Text or status on the leading edge, such as "Wren is the caller". Long text truncates. */
  status?: ReactNode;
  /** The accessible name of the overflow menu's button. Defaults to "More actions". */
  moreLabel?: string;
  children: ReactNode;
}

/**
 * Contextual actions under the stage. Arrow keys move between actions. When the actions don't fit, the bar hides
 * the labels of buttons that have an icon (each keeps its accessible name), and then moves actions from the end
 * into a "More actions" menu.
 */
export function ActionBar({
  status,
  moreLabel = 'More actions',
  children,
  'aria-label': ariaLabel,
}: ActionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menus = useRef(new Map<HTMLElement, MenuRecord>());
  const [overflowed, setOverflowed] = useState<HTMLElement[]>([]);
  const [moreItems, setMoreItems] = useState<MenuEntry[]>([]);

  const context = useMemo<ActionBarContextValue>(
    () => ({
      register: (element, record) => {
        menus.current.set(element, record);
        return () => {
          if (menus.current.get(element) === record) menus.current.delete(element);
        };
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    const bar = barRef.current;
    const items = itemsRef.current;
    if (!bar || !items) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const moved = fitItems(items, moreRef.current);
      setOverflowed((previous) => (sameElements(previous, moved) ? previous : moved));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(fit);
    };
    fit();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resize?.observe(bar);
    // Items come and go, and labels change, as the game moves on.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    mutations?.observe(items, { childList: true, subtree: true, characterData: true });
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      resize?.disconnect();
      mutations?.disconnect();
    };
  }, []);

  const listOverflow = (): MenuEntry[] =>
    overflowed.map((element): MenuEntry => {
      const menu = menus.current.get(element);
      if (menu) {
        return {
          type: 'submenu',
          label: menu.label,
          icon: menu.icon,
          items: menu.items,
          disabled: menu.disabled,
        };
      }
      return {
        label: nameOf(element),
        disabled: element.matches(':disabled, [aria-disabled="true"]'),
        // Let the overflow menu close first, so its focus return doesn't race what the action opens.
        onSelect: () => setTimeout(() => press(element), 0),
      };
    });

  return (
    <ActionBarContext.Provider value={context}>
      <div ref={barRef} className={styles.actionBar}>
        {status && <div className={styles.actionStatus}>{status}</div>}
        <Toolbar.Root ref={itemsRef} aria-label={ariaLabel} className={styles.actionItems}>
          {children}
          <DropdownMenu
            side="top"
            align="end"
            items={moreItems}
            onOpenChange={(open) => {
              if (open) setMoreItems(listOverflow());
            }}
            trigger={
              <Toolbar.Button asChild>
                <IconButton
                  ref={moreRef}
                  icon="more"
                  label={moreLabel}
                  variant="secondary"
                  size="sm"
                  className={styles.actionMore}
                  data-action-bar-more=""
                />
              </Toolbar.Button>
            }
          />
        </Toolbar.Root>
      </div>
    </ActionBarContext.Provider>
  );
}

/** Wraps a Button so it joins the ActionBar's arrow-key navigation. */
export function ActionBarItem({ children }: { children: ReactNode }) {
  return <Toolbar.Button asChild>{children}</Toolbar.Button>;
}

export function ActionBarDivider() {
  return <Toolbar.Separator className={styles.actionDivider} />;
}

export interface ActionBarMenuProps {
  /** The button's text, and the menu's name in the overflow menu. */
  label: string;
  icon?: IconName;
  items: MenuEntry[];
  /** A tooltip for the button. Defaults to `label`. Pass `null` for none. */
  tooltip?: ReactNode;
  /** Keys shown in the tooltip, such as `['S']`. Register the shortcut itself with `useShortcut`. */
  shortcut?: string | string[];
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  /** Controls the menu, for a shortcut that opens it. Leave both out to let the menu manage itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

/**
 * An action bar button that opens a menu. It joins the bar's arrow-key navigation, and when the bar runs out of
 * room it appears in the "More actions" menu as a submenu.
 */
export function ActionBarMenu({
  label,
  icon,
  items,
  tooltip,
  shortcut,
  disabled = false,
  loading = false,
  variant = 'secondary',
  open,
  onOpenChange,
  side = 'top',
  align = 'start',
}: ActionBarMenuProps) {
  const bar = useContext(ActionBarContext);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const element = buttonRef.current;
    if (!bar || !element) return;
    return bar.register(element, { label, icon, items, disabled });
  }, [bar, label, icon, items, disabled]);

  const button = (
    <Toolbar.Button asChild>
      <DropdownPrimitive.Trigger asChild disabled={disabled}>
        <Button
          ref={buttonRef}
          size="sm"
          variant={variant}
          icon={icon}
          iconEnd={side === 'top' ? 'chevron-up' : 'chevron-down'}
          loading={loading}
          disabled={disabled}
        >
          {label}
        </Button>
      </DropdownPrimitive.Trigger>
    </Toolbar.Button>
  );

  return (
    <DropdownPrimitive.Root
      open={open === undefined ? undefined : open && !disabled}
      onOpenChange={onOpenChange}
    >
      {tooltip === null ? (
        button
      ) : (
        <Tooltip content={tooltip ?? label} shortcut={shortcut}>
          {button}
        </Tooltip>
      )}
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          className={menuContentClass}
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
        >
          {renderDropdownEntries(items)}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}
