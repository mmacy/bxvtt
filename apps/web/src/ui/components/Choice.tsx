import {
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioPrimitive,
  Slider as SliderPrimitive,
  Switch as SwitchPrimitive,
  ToggleGroup,
} from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import styles from './Choice.module.css';

export interface CheckboxProps {
  label: ReactNode;
  /** Secondary text under the label. */
  description?: ReactNode;
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** A checkbox with its label. Supports an indeterminate state for "some selected". */
export function Checkbox({
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  id,
  className,
}: CheckboxProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <div className={cx(styles.choice, disabled && styles.disabled, className)}>
      <CheckboxPrimitive.Root
        id={controlId}
        className={styles.checkbox}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(next) => onCheckedChange?.(next === true)}
        disabled={disabled}
        aria-describedby={descriptionId}
      >
        <CheckboxPrimitive.Indicator className={styles.checkIndicator}>
          <Icon name={checked === 'indeterminate' ? 'minus' : 'check'} size={14} strokeWidth={2.5} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className={styles.text}>
        <label htmlFor={controlId} className={styles.label}>
          {label}
        </label>
        {description && (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        )}
      </span>
    </div>
  );
}

export interface SwitchProps {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Puts the label before the switch, for settings lists. */
  labelPosition?: 'start' | 'end';
  id?: string;
  className?: string;
}

/** An on and off setting that applies at once, such as "Referee lens" or "Auto-resolve rounds". */
export function Switch({
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  labelPosition = 'end',
  id,
  className,
}: SwitchProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <div
      className={cx(
        styles.choice,
        labelPosition === 'start' && styles.labelStart,
        disabled && styles.disabled,
        className,
      )}
    >
      <SwitchPrimitive.Root
        id={controlId}
        className={styles.switch}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={descriptionId}
      >
        <SwitchPrimitive.Thumb className={styles.thumb} />
      </SwitchPrimitive.Root>
      <span className={styles.text}>
        <label htmlFor={controlId} className={styles.label}>
          {label}
        </label>
        {description && (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        )}
      </span>
    </div>
  );
}

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  /** Accessible name for the group. Use a visible heading or Field label when you can. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/** Picks one of a few options that the user should see all at once. */
export function RadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  orientation = 'vertical',
  disabled,
  className,
  ...aria
}: RadioGroupProps) {
  const baseId = useId();
  return (
    <RadioPrimitive.Root
      className={cx(styles.radioGroup, styles[orientation], className)}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      orientation={orientation}
      disabled={disabled}
      {...aria}
    >
      {options.map((option) => {
        const id = `${baseId}-${option.value}`;
        return (
          <div
            key={option.value}
            className={cx(styles.choice, (disabled || option.disabled) && styles.disabled)}
          >
            <RadioPrimitive.Item
              id={id}
              value={option.value}
              className={styles.radio}
              disabled={option.disabled}
            >
              <RadioPrimitive.Indicator className={styles.radioIndicator} />
            </RadioPrimitive.Item>
            <span className={styles.text}>
              <label htmlFor={id} className={styles.label}>
                {option.label}
              </label>
              {option.description && <span className={styles.description}>{option.description}</span>}
            </span>
          </div>
        );
      })}
    </RadioPrimitive.Root>
  );
}

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: IconName;
  /** Hides the text label and uses it as the accessible name. Requires `icon`. */
  iconOnly?: boolean;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  size?: 'sm' | 'md';
  'aria-label': string;
  className?: string;
}

/** Switches between a few views or modes, such as map themes. One segment is always on. */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  size = 'md',
  'aria-label': ariaLabel,
  className,
}: SegmentedControlProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next);
      }}
      aria-label={ariaLabel}
      className={cx(styles.segmented, styles[`seg-${size}`], className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          aria-label={option.iconOnly ? option.label : undefined}
          title={option.iconOnly ? option.label : undefined}
          className={styles.segment}
        >
          {option.icon && <Icon name={option.icon} size={size === 'sm' ? 14 : 16} />}
          {!option.iconOnly && <span>{option.label}</span>}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export interface SliderProps {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Visible label above the track. Also the accessible name. */
  label: string;
  hideLabel?: boolean;
  /** Formats the value shown beside the label, such as `(v) => \`${v}%\``. */
  formatValue?: (value: number) => string;
  className?: string;
}

/** Picks a number from a range by dragging, such as zoom or light radius. */
export function Slider({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  label,
  hideLabel = false,
  formatValue = (v) => String(v),
  className,
}: SliderProps) {
  const labelId = useId();
  const current = value ?? defaultValue ?? min;
  return (
    <div className={cx(styles.slider, disabled && styles.disabled, className)}>
      <div className={cx(styles.sliderHeader, hideLabel && 'visually-hidden')}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        <span className={styles.sliderValue}>{formatValue(current)}</span>
      </div>
      <SliderPrimitive.Root
        className={styles.sliderRoot}
        value={value === undefined ? undefined : [value]}
        defaultValue={defaultValue === undefined ? undefined : [defaultValue]}
        onValueChange={(next) => {
          const first = next[0];
          if (first !== undefined) onValueChange?.(first);
        }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      >
        <SliderPrimitive.Track className={styles.track}>
          <SliderPrimitive.Range className={styles.range} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={styles.sliderThumb}
          aria-labelledby={labelId}
          aria-valuetext={formatValue(current)}
        />
      </SliderPrimitive.Root>
    </div>
  );
}
