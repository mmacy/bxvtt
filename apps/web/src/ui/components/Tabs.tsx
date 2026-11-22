import { Tabs as TabsPrimitive } from 'radix-ui';
import { createContext, useContext, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { KbdControlScope } from './Kbd';
import { useControllableState } from '../lib/hooks';
import styles from './Tabs.module.css';

type TabsVariant = 'line' | 'enclosed';

const VariantContext = createContext<TabsVariant>('line');
/** The active tab's value, so a kept-mounted panel knows when to hide. */
const ValueContext = createContext<string | undefined>(undefined);

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** "line" underlines the active tab (docks, sheets); "enclosed" puts tabs in a tray. */
  variant?: TabsVariant;
  orientation?: 'horizontal' | 'vertical';
  /** "automatic" shows a panel when its tab gets focus; "manual" waits for Enter or Space. */
  activationMode?: 'automatic' | 'manual';
  children: ReactNode;
  className?: string;
}

/** Switches between panels of related content. Arrow keys move between tabs. */
export function Tabs({
  variant = 'line',
  value,
  defaultValue,
  onValueChange,
  className,
  children,
  ...rest
}: TabsProps) {
  const [current, setCurrent] = useControllableState(value, defaultValue ?? '', onValueChange);
  return (
    <VariantContext.Provider value={variant}>
      <ValueContext.Provider value={current}>
        <TabsPrimitive.Root
          className={cx(styles.root, className)}
          value={current}
          onValueChange={setCurrent}
          {...rest}
        >
          {children}
        </TabsPrimitive.Root>
      </ValueContext.Provider>
    </VariantContext.Provider>
  );
}

export interface TabsListProps {
  /** Accessible name for the tab list, such as "Dock". */
  'aria-label'?: string;
  /** Lets each tab grow to share the width equally. */
  stretch?: boolean;
  children: ReactNode;
  className?: string;
}

export function TabsList({ stretch = false, className, children, ...rest }: TabsListProps) {
  const variant = useContext(VariantContext);
  return (
    <TabsPrimitive.List
      className={cx(styles.list, styles[variant], stretch && styles.stretch, className)}
      {...rest}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export interface TabsTriggerProps {
  value: string;
  icon?: IconName;
  /** A number after the label, such as unread feed entries. */
  count?: number;
  disabled?: boolean;
  /** Hides the text visually and keeps it as the accessible name. Requires `icon`. */
  iconOnly?: boolean;
  children: ReactNode;
  className?: string;
}

export function TabsTrigger({
  value,
  icon,
  count,
  disabled,
  iconOnly = false,
  children,
  className,
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      className={cx(styles.trigger, className)}
      // Radix focuses a tab from script on mouse down, which browsers treat as keyboard focus. The mark keeps the
      // focus ring off for a click, and a key press clears it so keyboard focus still shows the ring.
      onPointerDown={(event) => {
        event.currentTarget.dataset.pointerFocus = '';
      }}
      onKeyDown={(event) => {
        delete event.currentTarget.dataset.pointerFocus;
      }}
      onBlur={(event) => {
        delete event.currentTarget.dataset.pointerFocus;
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      <span className={iconOnly ? 'visually-hidden' : undefined}>
        <KbdControlScope>{children}</KbdControlScope>
      </span>
      {count !== undefined && count > 0 && (
        <span className={styles.count} aria-label={`${count} new`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}

export interface TabsContentProps {
  value: string;
  children: ReactNode;
  /**
   * Keeps the panel mounted while another tab is active, so its scroll position and state survive. The inactive
   * panel is hidden from view and from assistive technology.
   */
  keepMounted?: boolean;
  className?: string;
}

const HIDDEN_PANEL = {
  position: 'absolute',
  inset: 0,
  visibility: 'hidden',
  pointerEvents: 'none',
} as const;

export function TabsContent({ value, children, keepMounted = false, className }: TabsContentProps) {
  const active = useContext(ValueContext);
  // Radix's `forceMount` keeps the panel visible, so a kept panel hides itself while inactive. It stays laid out,
  // out of the flow, because a browser forgets the scroll position of an element with `display: none`.
  const hidden = keepMounted && active !== value;
  return (
    <TabsPrimitive.Content
      value={value}
      forceMount={keepMounted ? true : undefined}
      className={cx(styles.content, className)}
      style={hidden ? HIDDEN_PANEL : undefined}
      inert={hidden || undefined}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
