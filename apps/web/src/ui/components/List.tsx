import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import styles from './List.module.css';

interface ListContextValue {
  selectable: boolean;
  value: string | null | undefined;
  onSelect: ((value: string) => void) | undefined;
  density: 'compact' | 'comfortable';
}

const ListContext = createContext<ListContextValue>({
  selectable: false,
  value: undefined,
  onSelect: undefined,
  density: 'comfortable',
});

export interface ListProps {
  children: ReactNode;
  /** The selected item's value. Passing `onValueChange` makes the list a selectable listbox. */
  value?: string | null;
  onValueChange?: (value: string) => void;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  density?: 'compact' | 'comfortable';
  /** Draws a rule between items. */
  divided?: boolean;
  className?: string;
}

/**
 * A vertical list of rows. With `onValueChange` it becomes a listbox: arrow keys, Home, and End
 * move focus, and Enter or Space selects.
 */
export function List({
  children,
  value,
  onValueChange,
  density = 'comfortable',
  divided = false,
  className,
  ...aria
}: ListProps) {
  const ref = useRef<HTMLUListElement>(null);
  const selectable = onValueChange !== undefined;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !selectable) return;
    const options = Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'));
    if (options.length > 0 && !options.some((o) => o.tabIndex === 0)) {
      const first = options.find((o) => o.getAttribute('aria-disabled') !== 'true');
      if (first) first.tabIndex = 0;
    }
  });

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!selectable || !ref.current) return;
    const options = Array.from(ref.current.querySelectorAll<HTMLElement>('[role="option"]')).filter(
      (o) => o.getAttribute('aria-disabled') !== 'true',
    );
    const index = options.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowDown') next = options[Math.min(index + 1, options.length - 1)];
    else if (event.key === 'ArrowUp') next = options[Math.max(index - 1, 0)];
    else if (event.key === 'Home') next = options[0];
    else if (event.key === 'End') next = options[options.length - 1];
    if (next) {
      event.preventDefault();
      for (const option of options) option.tabIndex = option === next ? 0 : -1;
      next.focus();
    }
  };

  return (
    <ListContext.Provider value={{ selectable, value, onSelect: onValueChange, density }}>
      <ul
        ref={ref}
        role={selectable ? 'listbox' : 'list'}
        className={cx(styles.list, divided && styles.divided, className)}
        onKeyDown={onKeyDown}
        {...aria}
      >
        {children}
      </ul>
    </ListContext.Provider>
  );
}

export interface ListItemProps {
  /** Identifies the item in a selectable list. */
  value?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Content before the text, such as a TokenPortrait or Icon. */
  leading?: ReactNode;
  /** Content after the text, such as an HpBar or Badge. */
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** A row in a List. */
export function ListItem({
  value,
  title,
  description,
  leading,
  trailing,
  disabled,
  className,
}: ListItemProps) {
  const ctx = useContext(ListContext);
  const selected = ctx.selectable && value !== undefined && ctx.value === value;
  const select = () => {
    if (!disabled && value !== undefined) ctx.onSelect?.(value);
  };
  return (
    <li
      role={ctx.selectable ? 'option' : 'listitem'}
      aria-selected={ctx.selectable ? selected : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={ctx.selectable ? (selected ? 0 : -1) : undefined}
      className={cx(
        styles.item,
        styles[ctx.density],
        ctx.selectable && styles.selectable,
        selected && styles.selected,
        disabled && styles.disabled,
        className,
      )}
      onClick={ctx.selectable ? select : undefined}
      onKeyDown={
        ctx.selectable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                select();
              }
            }
          : undefined
      }
    >
      {leading && <span className={styles.leading}>{leading}</span>}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </li>
  );
}
