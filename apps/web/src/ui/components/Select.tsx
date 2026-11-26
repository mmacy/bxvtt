import { Select as SelectPrimitive } from 'radix-ui';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/hooks';
import { useFieldContext } from './Field';
import type { InputSize } from './TextInput';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: IconName;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps {
  options: Array<SelectOption | SelectGroup>;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /**
   * How the placeholder reads. `hint` (the default) dims it, as an empty field. `value` sets it in the normal text
   * colour, for a placeholder that names a state rather than asking for a choice, such as "Custom".
   */
  placeholderTone?: 'hint' | 'value';
  size?: InputSize;
  disabled?: boolean;
  /**
   * Shows the value without letting anyone change it, such as a setting only a referee can change. The value stays
   * at the normal text colour and only the chevron is muted. The trigger stays in the tab order, reports
   * `aria-readonly`, and never opens its list.
   */
  readOnly?: boolean;
  invalid?: boolean;
  id?: string;
  /** Accessible name when the select is not inside a Field. */
  'aria-label'?: string;
  className?: string;
}

function isGroup(item: SelectOption | SelectGroup): item is SelectGroup {
  return 'options' in item;
}

/** Picks one value from a short list. Use Combobox when the list is long enough to need search. */
export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Choose',
  placeholderTone = 'hint',
  size = 'md',
  disabled,
  readOnly = false,
  invalid,
  id,
  'aria-label': ariaLabel,
  className,
}: SelectProps) {
  const field = useFieldContext();
  const isInvalid = invalid ?? field?.invalid ?? false;
  // Radix always gets a controlled value, so a caller whose value starts undefined and later becomes a string
  // doesn't switch the select from uncontrolled to controlled. An empty string shows the placeholder.
  const [current, setCurrent] = useControllableState(value, defaultValue ?? '', onValueChange);
  const renderOption = (option: SelectOption) => (
    <SelectPrimitive.Item
      key={option.value}
      value={option.value}
      disabled={option.disabled}
      className={styles.item}
    >
      {option.icon && <Icon name={option.icon} size={16} className={styles.itemIcon} />}
      <span className={styles.itemText}>
        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
        {option.description && <span className={styles.itemDescription}>{option.description}</span>}
      </span>
      <SelectPrimitive.ItemIndicator className={styles.indicator}>
        <Icon name="check" size={14} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
  return (
    <SelectPrimitive.Root
      value={current}
      // A read-only trigger ignores the typeahead that changes a closed select's value, and never opens.
      onValueChange={readOnly ? undefined : setCurrent}
      {...(readOnly ? { open: false, onOpenChange: () => {} } : {})}
      disabled={disabled ?? field?.disabled}
      required={field?.required}
    >
      <SelectPrimitive.Trigger
        id={id ?? field?.id}
        aria-label={ariaLabel}
        aria-invalid={isInvalid || undefined}
        aria-readonly={readOnly || undefined}
        aria-describedby={field?.describedBy}
        className={cx(
          styles.trigger,
          styles[size],
          isInvalid && styles.invalid,
          readOnly && styles.readOnly,
          className,
        )}
      >
        <SelectPrimitive.Value
          placeholder={
            <span className={placeholderTone === 'value' ? undefined : styles.placeholder}>
              {placeholder}
            </span>
          }
        />
        <SelectPrimitive.Icon className={styles.chevron}>
          <Icon name="chevrons-up-down" size={14} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={styles.content} position="popper" sideOffset={4}>
          <SelectPrimitive.ScrollUpButton className={styles.scrollButton}>
            <Icon name="chevron-up" size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className={styles.viewport}>
            {options.map((item) =>
              isGroup(item) ? (
                <SelectPrimitive.Group key={item.label}>
                  <SelectPrimitive.Label className={styles.groupLabel}>{item.label}</SelectPrimitive.Label>
                  {item.options.map(renderOption)}
                </SelectPrimitive.Group>
              ) : (
                renderOption(item)
              ),
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className={styles.scrollButton}>
            <Icon name="chevron-down" size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
