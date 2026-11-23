import { ContextMenu as ContextPrimitive, DropdownMenu as DropdownPrimitive } from 'radix-ui';
import { isValidElement, useId, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { Kbd, ariaKeyShortcuts } from './Kbd';
import styles from './Menu.module.css';

export type MenuEntry =
  | {
      type?: 'item';
      label: string;
      icon?: IconName;
      shortcut?: string | string[];
      onSelect?: () => void;
      /** Marks a destructive item, such as "Remove from table". */
      danger?: boolean;
      disabled?: boolean;
      /**
       * Why the item is unavailable, shown under its label while `disabled` is true, such as "Make another member a
       * referee first." The item stays reachable with the arrow keys, announces itself as disabled, and does
       * nothing when chosen.
       */
      disabledReason?: string | null;
    }
  | {
      type: 'checkbox';
      label: string;
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
      disabled?: boolean;
    }
  | { type: 'separator' }
  | { type: 'label'; label: string }
  | {
      type: 'submenu';
      label: string;
      icon?: IconName;
      items: MenuEntry[];
      disabled?: boolean;
      /** Why the submenu is unavailable, shown under its label while `disabled` is true. */
      disabledReason?: string | null;
    };

interface ChildProps {
  className?: string;
  children?: ReactNode;
}

interface MenuParts {
  Item: ComponentType<
    ChildProps & {
      disabled?: boolean;
      onSelect?: (event: Event) => void;
      'aria-keyshortcuts'?: string;
      'aria-disabled'?: boolean;
      'aria-describedby'?: string;
      'data-disabled'?: string;
    }
  >;
  CheckboxItem: ComponentType<
    ChildProps & { checked?: boolean; onCheckedChange?: (checked: boolean) => void; disabled?: boolean }
  >;
  ItemIndicator: ComponentType<ChildProps>;
  Separator: ComponentType<ChildProps>;
  Label: ComponentType<ChildProps>;
  Sub: ComponentType<{ children?: ReactNode }>;
  SubTrigger: ComponentType<ChildProps & { disabled?: boolean }>;
  SubContent: ComponentType<ChildProps & { sideOffset?: number; alignOffset?: number }>;
  Portal: ComponentType<{ children?: ReactNode }>;
}

/**
 * An item that can't be chosen, with the reason under its label. It stays focusable, unlike a Radix disabled
 * item, so a keyboard or screen reader user reaches the reason too.
 */
function UnavailableItem({
  parts,
  label,
  icon,
  reason,
  danger,
}: {
  parts: MenuParts;
  label: string;
  icon?: IconName;
  reason: string;
  danger?: boolean;
}) {
  const reasonId = useId();
  return (
    <parts.Item
      className={cx(styles.item, styles.unavailable, danger && styles.danger)}
      aria-disabled={true}
      data-disabled=""
      aria-describedby={reasonId}
      // Choosing it keeps the menu open, so the reason stays in view.
      onSelect={(event) => event.preventDefault()}
    >
      <span className={styles.iconSlot}>{icon && <Icon name={icon} size={16} />}</span>
      <span className={styles.itemText}>
        <span className={styles.itemLabel}>{label}</span>
        <span id={reasonId} className={styles.itemReason} aria-hidden="true">
          {reason}
        </span>
      </span>
    </parts.Item>
  );
}

function renderEntries(entries: MenuEntry[], parts: MenuParts): ReactNode {
  return entries.map((entry, index) => {
    const key = `${entry.type ?? 'item'}-${'label' in entry ? entry.label : index}-${index}`;
    if (
      (entry.type === undefined || entry.type === 'item' || entry.type === 'submenu') &&
      entry.disabled &&
      entry.disabledReason
    ) {
      return (
        <UnavailableItem
          key={key}
          parts={parts}
          label={entry.label}
          icon={entry.icon}
          reason={entry.disabledReason}
          danger={entry.type !== 'submenu' && entry.danger}
        />
      );
    }
    switch (entry.type) {
      case 'separator':
        return <parts.Separator key={key} className={styles.separator} />;
      case 'label':
        return (
          <parts.Label key={key} className={styles.label}>
            {entry.label}
          </parts.Label>
        );
      case 'checkbox':
        return (
          <parts.CheckboxItem
            key={key}
            className={styles.item}
            checked={entry.checked}
            onCheckedChange={entry.onCheckedChange}
            disabled={entry.disabled}
          >
            <span className={styles.iconSlot}>
              <parts.ItemIndicator>
                <Icon name="check" size={14} />
              </parts.ItemIndicator>
            </span>
            <span className={styles.itemLabel}>{entry.label}</span>
          </parts.CheckboxItem>
        );
      case 'submenu':
        return (
          <parts.Sub key={key}>
            <parts.SubTrigger className={styles.item} disabled={entry.disabled}>
              <span className={styles.iconSlot}>{entry.icon && <Icon name={entry.icon} size={16} />}</span>
              <span className={styles.itemLabel}>{entry.label}</span>
              <Icon name="chevron-right" size={14} className={styles.subChevron} />
            </parts.SubTrigger>
            <parts.Portal>
              <parts.SubContent className={styles.content} sideOffset={4} alignOffset={-5}>
                {renderEntries(entry.items, parts)}
              </parts.SubContent>
            </parts.Portal>
          </parts.Sub>
        );
      default:
        return (
          <parts.Item
            key={key}
            className={cx(styles.item, entry.danger && styles.danger)}
            disabled={entry.disabled}
            onSelect={() => entry.onSelect?.()}
            aria-keyshortcuts={entry.shortcut ? ariaKeyShortcuts(entry.shortcut) : undefined}
          >
            <span className={styles.iconSlot}>{entry.icon && <Icon name={entry.icon} size={16} />}</span>
            <span className={styles.itemLabel}>{entry.label}</span>
            {entry.shortcut && <Kbd keys={entry.shortcut} decorative className={styles.shortcut} />}
          </parts.Item>
        );
    }
  });
}

const dropdownParts: MenuParts = {
  Item: DropdownPrimitive.Item,
  CheckboxItem: DropdownPrimitive.CheckboxItem,
  ItemIndicator: DropdownPrimitive.ItemIndicator,
  Separator: DropdownPrimitive.Separator,
  Label: DropdownPrimitive.Label,
  Sub: DropdownPrimitive.Sub,
  SubTrigger: DropdownPrimitive.SubTrigger,
  SubContent: DropdownPrimitive.SubContent,
  Portal: DropdownPrimitive.Portal,
};

const contextParts: MenuParts = {
  Item: ContextPrimitive.Item,
  CheckboxItem: ContextPrimitive.CheckboxItem,
  ItemIndicator: ContextPrimitive.ItemIndicator,
  Separator: ContextPrimitive.Separator,
  Label: ContextPrimitive.Label,
  Sub: ContextPrimitive.Sub,
  SubTrigger: ContextPrimitive.SubTrigger,
  SubContent: ContextPrimitive.SubContent,
  Portal: ContextPrimitive.Portal,
};

/**
 * The items of a dropdown menu, for a kit component that builds its own menu from the Radix parts, such as
 * `ActionBarMenu`. Features use `DropdownMenu`.
 */
export function renderDropdownEntries(entries: MenuEntry[]): ReactNode {
  return renderEntries(entries, dropdownParts);
}

/** The class name of a menu's content, for a kit component that builds its own menu. */
export const menuContentClass = styles.content;

export interface DropdownMenuProps {
  /** The element that opens the menu, usually an IconButton or Button. */
  trigger: ReactElement;
  items: MenuEntry[];
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Whether a trigger element is disabled. The menu passes it on to Radix, which then ignores the arrow key and
 * pointer down that would open it, so an unavailable trigger that stays focusable keeps its menu shut.
 */
function triggerDisabled(trigger: ReactElement): boolean {
  if (!isValidElement<{ disabled?: unknown }>(trigger)) return false;
  return trigger.props.disabled === true;
}

/** A menu of actions that opens from a button. Arrow keys move, type-ahead jumps, Escape closes. */
export function DropdownMenu({
  trigger,
  items,
  side = 'bottom',
  align = 'start',
  open,
  onOpenChange,
}: DropdownMenuProps) {
  return (
    <DropdownPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DropdownPrimitive.Trigger asChild disabled={triggerDisabled(trigger)}>
        {trigger}
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          className={styles.content}
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
        >
          {renderEntries(items, dropdownParts)}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export interface ContextMenuProps {
  /** The area that opens the menu on right-click or the context-menu key. */
  children: ReactElement;
  items: MenuEntry[];
  onOpenChange?: (open: boolean) => void;
}

/**
 * A menu that opens on right-click, long press, or Shift+F10, such as actions on a token.
 * Offer the same actions somewhere visible as well; a context menu is a shortcut.
 */
export function ContextMenu({ children, items, onOpenChange }: ContextMenuProps) {
  return (
    <ContextPrimitive.Root onOpenChange={onOpenChange}>
      <ContextPrimitive.Trigger asChild>{children}</ContextPrimitive.Trigger>
      <ContextPrimitive.Portal>
        <ContextPrimitive.Content className={styles.content} collisionPadding={8}>
          {renderEntries(items, contextParts)}
        </ContextPrimitive.Content>
      </ContextPrimitive.Portal>
    </ContextPrimitive.Root>
  );
}
