import { useId, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import { joinIds } from './ControlHelp';
import { useFieldContext } from './Field';
import { Tooltip } from './Popover';
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
  /** IDs of elements that describe the input, such as a hint beside it, when it isn't inside a Field. */
  'aria-describedby'?: string;
  /**
   * Accessible names for the step buttons. By default they name the field: "Decrease Strength" from a Field
   * labelled "Strength", or from `aria-label` outside a Field.
   */
  decrementLabel?: string;
  incrementLabel?: string;
  /**
   * Why the value can't go below `min`, such as "Wren carries only 3 torches." While the value sits at `min`,
   * screen readers read it as the field's description, and the decrease button shows it on hover.
   */
  minReason?: string;
  /**
   * Why the value can't go above `max`, such as "All 2 first-level slots are full." While the value sits at
   * `max`, screen readers read it as the field's description, and the increase button shows it on hover.
   */
  maxReason?: string;
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
  'aria-describedby': describedBy,
  decrementLabel,
  incrementLabel,
  minReason,
  maxReason,
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
  const atMin = min !== undefined && value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;
  const limits = [atMin ? minReason : undefined, atMax ? maxReason : undefined].filter(
    (reason): reason is string => reason !== undefined && reason !== '',
  );
  const limitId = `${stepId}-limit`;

  /**
   * A step button. At its limit it is natively disabled, unless a reason says why, which it then shows on hover.
   * The buttons stay out of the tab order, because the arrow keys step the field.
   */
  const stepButton = (direction: 'decrease' | 'increase', atLimit: boolean, reason: string | undefined) => {
    const explained = !isDisabled && atLimit && reason !== undefined && reason !== '';
    const button: ReactElement = (
      <button
        type="button"
        tabIndex={-1}
        className={styles.step}
        {...(direction === 'decrease'
          ? stepName('Decrease', decrementLabel, `${stepId}-decrease`)
          : stepName('Increase', incrementLabel, `${stepId}-increase`))}
        disabled={isDisabled || (atLimit && !explained)}
        aria-disabled={explained || undefined}
        data-unavailable={explained || undefined}
        onClick={() => {
          if (!explained) stepBy(direction === 'decrease' ? -step : step);
        }}
      >
        <Icon name={direction === 'decrease' ? 'minus' : 'plus'} size={14} />
      </button>
    );
    return explained ? (
      <Tooltip content={reason} describe={false}>
        {button}
      </Tooltip>
    ) : (
      button
    );
  };

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
      {stepButton('decrease', atMin, minReason)}
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
        aria-describedby={joinIds(field?.describedBy, describedBy, limits.length > 0 ? limitId : undefined)}
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
      {stepButton('increase', atMax, maxReason)}
      {limits.length > 0 && (
        <span id={limitId} hidden>
          {limits.join(' ')}
        </span>
      )}
    </div>
  );
}
