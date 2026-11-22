import { useId, useState, type KeyboardEvent } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useFieldContext } from './Field';
import type { InputSize } from './TextInput';
import styles from './Input.module.css';

export interface NumberInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: InputSize;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** Accessible name when the input is not inside a Field. */
  'aria-label'?: string;
  /**
   * Accessible names for the step buttons. By default they name the field: "Decrease Strength" from a Field
   * labelled "Strength", or from `aria-label` outside a Field.
   */
  decrementLabel?: string;
  incrementLabel?: string;
  /** Width of the text area in characters. Defaults to 3. */
  width?: number;
  className?: string;
}

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

/**
 * A number field with step buttons. Arrow keys step by `step`, Page Up and Page Down by ten
 * steps, and Home and End jump to the limits. Typed values are clamped when the field loses focus.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  size = 'md',
  disabled,
  invalid,
  id,
  'aria-label': ariaLabel,
  decrementLabel,
  incrementLabel,
  width = 3,
  className,
}: NumberInputProps) {
  const field = useFieldContext();
  const stepId = useId();
  // A step button's name is its verb and the field's name. Inside a Field it reads the label element, which can
  // hold any content, through aria-labelledby.
  const stepName = (verb: 'Decrease' | 'Increase', explicit: string | undefined, id: string) => {
    if (explicit !== undefined) return { 'aria-label': explicit };
    if (ariaLabel) return { 'aria-label': `${verb} ${ariaLabel}` };
    if (field) return { id, 'aria-label': verb, 'aria-labelledby': `${id} ${field.labelId}` };
    return { 'aria-label': verb };
  };
  const [draft, setDraft] = useState<string | null>(null);
  const isDisabled = disabled ?? field?.disabled ?? false;
  const isInvalid = invalid ?? field?.invalid ?? false;
  const shown = draft ?? (value === null ? '' : String(value));

  const commit = (next: number | null) => {
    setDraft(null);
    onChange(next === null ? null : clamp(next, min, max));
  };

  const stepBy = (delta: number) => {
    const base = value ?? min ?? 0;
    commit(base + delta);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const keys: Record<string, () => void> = {
      ArrowUp: () => stepBy(step),
      ArrowDown: () => stepBy(-step),
      PageUp: () => stepBy(step * 10),
      PageDown: () => stepBy(-step * 10),
      Home: () => min !== undefined && commit(min),
      End: () => max !== undefined && commit(max),
      Enter: () => {
        if (draft !== null) commit(draft.trim() === '' ? null : Number(draft));
      },
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div
      className={cx(
        styles.wrap,
        styles.numberWrap,
        styles[size],
        isInvalid && styles.invalid,
        isDisabled && styles.disabled,
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        className={styles.step}
        {...stepName('Decrease', decrementLabel, `${stepId}-decrease`)}
        disabled={isDisabled || (min !== undefined && value !== null && value <= min)}
        onClick={() => stepBy(-step)}
      >
        <Icon name="minus" size={14} />
      </button>
      <input
        id={id ?? field?.id}
        type="text"
        inputMode="numeric"
        role="spinbutton"
        autoComplete="off"
        className={cx(styles.input, styles.number)}
        style={{ width: `${width + 1}ch` }}
        value={shown}
        disabled={isDisabled}
        aria-label={ariaLabel}
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-invalid={isInvalid || undefined}
        aria-describedby={field?.describedBy}
        onChange={(event) => {
          const text = event.target.value;
          if (/^-?\d*$/.test(text)) setDraft(text);
        }}
        onBlur={() => {
          if (draft === null) return;
          const trimmed = draft.trim();
          commit(trimmed === '' || trimmed === '-' ? null : Number(trimmed));
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        className={styles.step}
        {...stepName('Increase', incrementLabel, `${stepId}-increase`)}
        disabled={isDisabled || (max !== undefined && value !== null && value >= max)}
        onClick={() => stepBy(step)}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
