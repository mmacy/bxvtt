import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useFieldContext } from './Field';
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
          <button
            type="button"
            className={styles.clear}
            aria-label={clearLabel}
            onClick={() => onValueChange('')}
          >
            <Icon name="close" size={14} />
          </button>
        ) : undefined
      }
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  wrapperClassName?: string;
}

/** A multi-line text input for notes, journal entries, and chat drafts. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, disabled, id, wrapperClassName, className, required, ...rest },
  ref,
) {
  const field = useFieldContext();
  const isInvalid = invalid ?? field?.invalid ?? false;
  const isDisabled = disabled ?? field?.disabled ?? false;
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
        ref={ref}
        id={id ?? field?.id}
        className={cx(styles.textarea, className)}
        disabled={isDisabled}
        required={required ?? field?.required}
        aria-invalid={isInvalid || undefined}
        aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
        {...rest}
      />
    </div>
  );
});
