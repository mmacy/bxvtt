import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useFieldContext } from './Field';
import { Tooltip } from './Popover';
import styles from './Input.module.css';

export type InputSize = 'sm' | 'md' | 'lg';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
  /** Icon at the leading edge. */
  icon?: IconName;
  /** Content at the trailing edge, such as a unit or a button. */
  end?: ReactNode;
  invalid?: boolean;
  /** Class name for the outer wrapper. */
  wrapperClassName?: string;
}

/** A single-line text input. Put it inside a Field for its label. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { size = 'md', icon, end, invalid, disabled, id, wrapperClassName, className, required, ...rest },
  ref,
) {
  const field = useFieldContext();
  const isInvalid = invalid ?? field?.invalid ?? false;
  const isDisabled = disabled ?? field?.disabled ?? false;
  return (
    <div
      className={cx(
        styles.wrap,
        styles[size],
        isInvalid && styles.invalid,
        isDisabled && styles.disabled,
        wrapperClassName,
      )}
    >
      {icon && (
        <span className={styles.adornment}>
          <Icon name={icon} size={size === 'lg' ? 18 : 16} />
        </span>
      )}
      <input
        ref={ref}
        id={id ?? field?.id}
        className={cx(styles.input, className)}
        disabled={isDisabled}
        required={required ?? field?.required}
        aria-invalid={isInvalid || undefined}
        aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
        {...rest}
      />
      {end && <span className={cx(styles.adornment, styles.adornmentEnd)}>{end}</span>}
    </div>
  );
});

export interface SearchInputProps extends Omit<
  TextInputProps,
  'icon' | 'end' | 'type' | 'onChange' | 'value'
> {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name for the clear button. Defaults to "Clear search". */
  clearLabel?: string;
}

/** A search field with a magnifier icon and a clear button. Escape clears it. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, clearLabel = 'Clear search', onKeyDown, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      type="search"
      icon="search"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && value) {
          event.preventDefault();
          event.stopPropagation();
          onValueChange('');
        }
        onKeyDown?.(event);
      }}
      end={
        value ? (
          <Tooltip content={clearLabel} describe={false}>
            <button
              type="button"
              className={styles.clear}
              aria-label={clearLabel}
              onClick={() => onValueChange('')}
            >
              <Icon name="close" size={14} />
            </button>
          </Tooltip>
        ) : undefined
      }
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  wrapperClassName?: string;
  /**
   * The height in lines when empty. Without it (or the native `rows`), the textarea is at least 72 px tall, which
   * suits notes. Pass 1 for a chat composer.
   */
  minRows?: number;
  /** Grows with its text, from `minRows` up to `maxRows` lines, and then scrolls. */
  autoGrow?: boolean;
  /** The most lines an `autoGrow` textarea shows before it scrolls. Defaults to 8. */
  maxRows?: number;
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/** Fits a textarea's height to its text, between its rows and `maxRows` lines. */
function fitHeight(element: HTMLTextAreaElement, maxRows: number): void {
  const style = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5 || 20;
  const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  const max = lineHeight * maxRows + padding;
  element.style.height = 'auto';
  const needed = element.scrollHeight;
  element.style.height = `${Math.min(needed, max)}px`;
  element.style.overflowY = needed > max ? 'auto' : 'hidden';
}

/**
 * A multi-line text input for notes, journal entries, and chat drafts. Pass `minRows={1}` and `autoGrow` for a
 * composer that starts as one line and grows as the user types.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    invalid,
    disabled,
    id,
    wrapperClassName,
    className,
    required,
    minRows,
    autoGrow = false,
    maxRows = 8,
    rows,
    onInput,
    ...rest
  },
  ref,
) {
  const field = useFieldContext();
  const isInvalid = invalid ?? field?.invalid ?? false;
  const isDisabled = disabled ?? field?.disabled ?? false;
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const shownRows = rows ?? minRows;
  const setRefs = useCallback(
    (element: HTMLTextAreaElement | null) => {
      inner.current = element;
      setRef(ref, element);
    },
    [ref],
  );

  // A controlled value can change without an input event, such as a draft that clears after sending.
  useLayoutEffect(() => {
    if (autoGrow && inner.current) fitHeight(inner.current, maxRows);
  }, [autoGrow, maxRows, rest.value, shownRows]);

  return (
    <div
      className={cx(
        styles.wrap,
        styles.textareaWrap,
        isInvalid && styles.invalid,
        isDisabled && styles.disabled,
        wrapperClassName,
      )}
    >
      <textarea
        ref={setRefs}
        id={id ?? field?.id}
        rows={shownRows}
        className={cx(
          styles.textarea,
          shownRows !== undefined && styles.textareaRows,
          autoGrow && styles.textareaGrow,
          className,
        )}
        disabled={isDisabled}
        required={required ?? field?.required}
        aria-invalid={isInvalid || undefined}
        aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
        onInput={(event) => {
          if (autoGrow) fitHeight(event.currentTarget, maxRows);
          onInput?.(event);
        }}
        {...rest}
      />
    </div>
  );
});
