import { Tabs as TabsPrimitive } from 'radix-ui';
import { createContext, useContext, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import styles from './Tabs.module.css';

type TabsVariant = 'line' | 'enclosed';

const VariantContext = createContext<TabsVariant>('line');

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
export function Tabs({ variant = 'line', className, children, ...rest }: TabsProps) {
  return (
    <VariantContext.Provider value={variant}>
      <TabsPrimitive.Root className={cx(styles.root, className)} {...rest}>
        {children}
      </TabsPrimitive.Root>
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
    <TabsPrimitive.Trigger value={value} disabled={disabled} className={cx(styles.trigger, className)}>
      {icon && <Icon name={icon} size={16} />}
      <span className={iconOnly ? 'visually-hidden' : undefined}>{children}</span>
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
  /** Keeps the panel mounted while hidden, so its scroll position and state survive. */
  keepMounted?: boolean;
  className?: string;
}

export function TabsContent({ value, children, keepMounted = false, className }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      value={value}
      forceMount={keepMounted ? true : undefined}
      className={cx(styles.content, className)}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
