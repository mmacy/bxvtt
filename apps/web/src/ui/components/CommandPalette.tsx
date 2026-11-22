import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useReturnFocus } from '../lib/hooks';
import { Kbd, ariaKeyShortcuts } from './Kbd';
import styles from './CommandPalette.module.css';

export interface CommandAction {
  id: string;
  label: string;
  /** Heading the action is grouped under, such as "Party" or "Referee". */
  group?: string;
  icon?: IconName;
  shortcut?: string | string[];
  keywords?: string[];
  disabled?: boolean;
  onRun: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandAction[];
  placeholder?: string;
  emptyText?: string;
}

function matches(action: CommandAction, query: string): boolean {
  const haystack = [action.label, action.group ?? '', ...(action.keywords ?? [])].join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * Opens the command palette with Ctrl+K or Cmd+K. Call it once where the palette is rendered.
 */
export function useCommandPaletteShortcut(onOpen: () => void, key = 'k') {
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === key) {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen, key]);
}

/** A searchable list of actions in a modal. Type to filter, arrow keys to move, Enter to run. */
export function CommandPalette({
  open,
  onOpenChange,
  actions,
  placeholder = 'Type a command or search',
  emptyText = 'No matching commands',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const focus = useReturnFocus();

  const results = useMemo(() => {
    const q = query.trim();
    return q ? actions.filter((action) => matches(action, q)) : actions;
  }, [actions, query]);

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const optionId = (index: number) => `${listId}-${index}`;

  const close = () => {
    onOpenChange(false);
    setQuery('');
    setActive(0);
  };

  const run = (action: CommandAction | undefined) => {
    if (!action || action.disabled) return;
    close();
    action.onRun();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + delta + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(results[activeIndex]);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.overlay} />
        <DialogPrimitive.Content
          className={styles.palette}
          aria-describedby={undefined}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onCloseAutoFocus={focus.onCloseAutoFocus}
        >
          <DialogPrimitive.Title className="visually-hidden">Command palette</DialogPrimitive.Title>
          <div className={styles.search}>
            <Icon name="search" size={18} className={styles.searchIcon} />
            <input
              className={styles.input}
              placeholder={placeholder}
              value={query}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
              aria-label="Command"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            <Kbd keys="Esc" decorative />
          </div>
          <ul id={listId} role="listbox" aria-label="Commands" className={styles.list}>
            {results.length === 0 && <li className={styles.empty}>{emptyText}</li>}
            {results.map((action, index) => {
              const previous = results[index - 1];
              const header = action.group && action.group !== previous?.group ? action.group : undefined;
              return (
                <li key={action.id} role="presentation">
                  {header && (
                    <div className={styles.group} aria-hidden="true">
                      {header}
                    </div>
                  )}
                  <div
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    aria-disabled={action.disabled || undefined}
                    aria-keyshortcuts={action.shortcut ? ariaKeyShortcuts(action.shortcut) : undefined}
                    className={cx(styles.option, index === activeIndex && styles.active)}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(action)}
                  >
                    <span className={styles.optionIcon}>
                      {action.icon && <Icon name={action.icon} size={16} />}
                    </span>
                    <span className={styles.optionLabel}>{action.label}</span>
                    {action.shortcut && <Kbd keys={action.shortcut} decorative />}
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
