import { Popover as PopoverPrimitive } from 'radix-ui';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useFieldContext } from './Field';
import type { InputSize } from './TextInput';
import inputStyles from './Input.module.css';
import styles from './Combobox.module.css';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  icon?: IconName;
  /** Extra words that match the option, such as "mu" for magic-user. */
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Text when nothing matches. */
  emptyText?: string;
  size?: InputSize;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  'aria-label'?: string;
  /** Replaces the default filter, which matches the label and keywords without regard to case. */
  filter?: (option: ComboboxOption, query: string) => boolean;
  /** Most options to list at once. Defaults to 50. */
  limit?: number;
  className?: string;
}

/** The default Combobox filter: every word of the query appears in the label or keywords. */
export function defaultComboboxFilter(option: ComboboxOption, query: string): boolean {
  const haystack = [option.label, option.description ?? '', ...(option.keywords ?? [])]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * A text input that filters a long list of options, such as monsters, spells, or equipment. The list opens in a
 * portal above the page, so a scrolling dialog or drawer body doesn't clip it.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Search',
  emptyText = 'No matching options',
  size = 'md',
  disabled,
  invalid,
  id,
  'aria-label': ariaLabel,
  filter = defaultComboboxFilter,
  limit = 50,
  className,
}: ComboboxProps) {
  const field = useFieldContext();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const isDisabled = disabled ?? field?.disabled ?? false;
  const isInvalid = invalid ?? field?.invalid ?? false;

  const results = useMemo(() => {
    const q = query?.trim() ?? '';
    const list = q ? options.filter((option) => filter(option, q)) : options;
    return list.slice(0, limit);
  }, [options, query, filter, limit]);

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const activeOption = open ? results[activeIndex] : undefined;
  const optionId = (index: number) => `${listId}-option-${index}`;

  const choose = (option: ComboboxOption | undefined) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setQuery(null);
    setOpen(false);
  };

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const move = (delta: number) => {
    if (!open) {
      setOpen(true);
      return;
    }
    if (results.length === 0) return;
    setActive((activeIndex + delta + results.length) % results.length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Enter':
        if (open && activeOption) {
          event.preventDefault();
          choose(activeOption);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (value !== null) {
          event.preventDefault();
          onChange(null);
        }
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <div className={cx(styles.combobox, className)}>
        <PopoverPrimitive.Anchor asChild>
          <div
            ref={anchorRef}
            className={cx(
              inputStyles.wrap,
              inputStyles[size],
              isInvalid && inputStyles.invalid,
              isDisabled && inputStyles.disabled,
            )}
          >
            <span className={inputStyles.adornment}>
              <Icon name={selected?.icon ?? 'search'} size={16} />
            </span>
            <input
              ref={inputRef}
              id={id ?? field?.id}
              type="text"
              role="combobox"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-activedescendant={activeOption ? optionId(activeIndex) : undefined}
              aria-label={ariaLabel}
              aria-invalid={isInvalid || undefined}
              aria-describedby={field?.describedBy}
              className={inputStyles.input}
              placeholder={placeholder}
              disabled={isDisabled}
              value={query ?? selected?.label ?? ''}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
                setOpen(true);
              }}
              onClick={() => setOpen(true)}
              onKeyDown={onKeyDown}
              onBlur={close}
            />
            <button
              type="button"
              tabIndex={-1}
              className={styles.toggle}
              aria-label={open ? 'Close list' : 'Open list'}
              disabled={isDisabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(!open);
                inputRef.current?.focus();
              }}
            >
              <Icon name="chevron-down" size={14} />
            </button>
          </div>
        </PopoverPrimitive.Anchor>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          role="presentation"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className={styles.popup}
          // Focus stays in the input, which names the active option with aria-activedescendant.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && anchorRef.current?.contains(event.target))
              event.preventDefault();
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label={ariaLabel ?? 'Options'} className={styles.list}>
            {results.length === 0 ? (
              <li className={styles.empty} role="presentation">
                {emptyText}
              </li>
            ) : (
              results.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  data-active={index === activeIndex || undefined}
                  className={styles.option}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  {option.icon && <Icon name={option.icon} size={16} className={styles.optionIcon} />}
                  <span className={styles.optionText}>
                    <span>{option.label}</span>
                    {option.description && (
                      <span className={styles.optionDescription}>{option.description}</span>
                    )}
                  </span>
                  {option.value === value && <Icon name="check" size={14} className={styles.check} />}
                </li>
              ))
            )}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
