import { createContext, useContext, useId, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import styles from './Field.module.css';

export interface FieldContextValue {
  id: string;
  /** The id of the field's label element, for a control part that names itself after the field. */
  labelId: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** The surrounding Field's ids and state, or null outside a Field. Controls call this to wire up labels. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  /** Help text under the control. */
  hint?: ReactNode;
  /** Error text. When set, the control is marked invalid and the hint is replaced. */
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Hides the label visually but keeps it for assistive technology. */
  hideLabel?: boolean;
  /** Text at the trailing edge of the label row, such as a character count. */
  aside?: ReactNode;
  /** Use a specific id for the control, for example to target it from a test. */
  id?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Label, hint, and error for one control. Kit inputs inside a Field pick up the id,
 * `aria-describedby`, and `aria-invalid` automatically.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  disabled = false,
  hideLabel = false,
  aside,
  id,
  children,
  className,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `field-${autoId}`;
  const labelId = `${controlId}-label`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <FieldContext.Provider
      value={{ id: controlId, labelId, describedBy, invalid: Boolean(error), required, disabled }}
    >
      <div className={cx(styles.field, disabled && styles.disabled, className)}>
        <div className={cx(styles.labelRow, hideLabel && 'visually-hidden')}>
          <label id={labelId} htmlFor={controlId} className={styles.label}>
            {label}
            {required && (
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            )}
          </label>
          {aside && <span className={styles.aside}>{aside}</span>}
        </div>
        {children}
        {error ? (
          <p id={errorId} className={styles.error}>
            <Icon name="error" size={14} />
            <span>{error}</span>
          </p>
        ) : (
          hint && (
            <p id={hintId} className={styles.hint}>
              {hint}
            </p>
          )
        )}
      </div>
    </FieldContext.Provider>
  );
}
