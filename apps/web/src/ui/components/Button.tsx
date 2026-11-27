import { Slot } from 'radix-ui';
import { useComposedRefs } from 'radix-ui/internal';
import { forwardRef, isValidElement, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { hasContent, joinIds, labelIsCut, useControlHelp, type ControlHelpProps } from './ControlHelp';
import { Kbd, KbdControlScope, ariaKeyShortcuts } from './Kbd';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ControlHelpProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon before the label. */
  icon?: IconName;
  /** Icon after the label. */
  iconEnd?: IconName;
  /** Shows a spinner, keeps the width, and ignores clicks. */
  loading?: boolean;
  /** Stretches the button to the width of its container. */
  block?: boolean;
  /** Renders the single child element with button styles, such as a router link. */
  asChild?: boolean;
  /**
   * Keys of the button's keyboard shortcut as `Kbd` shows them, such as `'G'` or `['Shift', 'R']`. The button
   * shows them after its label and in its tooltip, keeps them out of its accessible name, and sets
   * `aria-keyshortcuts` (unless you pass your own). Register the shortcut itself with the app's shortcut hook.
   */
  shortcut?: string | string[];
  children?: ReactNode;
}

const iconSize: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

const preventDefault = (event: { preventDefault: () => void }) => event.preventDefault();

/** The text of a label, including the text inside its elements, such as a span that hides it at phone width. */
function labelText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(labelText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return labelText(node.props.children);
  return '';
}

/**
 * The kit's only button. Use `variant` for emphasis and `asChild` to style a link as a button. Pass `tooltip` for
 * help the label doesn't give, and `disabledReason` with `disabled` to say why the button is unavailable. When an
 * action bar hides the label, or the label is cut off, the button shows its label as a tooltip. A label that your
 * own styles hide at some widths isn't detected, so pass the label as `tooltip` too, which screen readers then
 * don't hear twice.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconEnd,
    loading = false,
    block = false,
    asChild = false,
    shortcut,
    tooltip,
    disabledReason,
    tooltipSide,
    className,
    disabled,
    children,
    type,
    onClick,
    onPointerDown,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const own = useRef<HTMLButtonElement>(null);
  const setRef = useComposedRefs(ref, own);
  const explicit = hasContent(tooltip);
  // A native title is the old way to give help. Until a feature moves to `tooltip`, the kit adds no label tooltip.
  const fallback = !explicit && !asChild && rest.title === undefined;
  const help = useControlHelp({
    tooltip: explicit ? tooltip : fallback ? children : null,
    // A tooltip that repeats the label, for a label hidden at some widths, adds no description.
    tooltipIsName:
      !explicit || (typeof tooltip === 'string' && tooltip.trim() === labelText(children).trim()),
    reason: disabled && hasContent(disabledReason) ? disabledReason : null,
    shortcut,
    side: tooltipSide,
    when: explicit ? undefined : () => labelIsCut(own.current),
  });
  const keyShortcuts = rest['aria-keyshortcuts'] ?? (shortcut ? ariaKeyShortcuts(shortcut) : undefined);
  const classes = cx(
    styles.button,
    styles[variant],
    styles[size],
    block && styles.block,
    loading && styles.loading,
    className,
  );
  const handlers = help.handlers<HTMLButtonElement>({
    onClick: loading ? preventDefault : onClick,
    onPointerDown,
    onKeyDown,
  });
  const describedBy = joinIds(rest['aria-describedby'], help.describedBy);
  if (asChild) {
    return (
      <KbdControlScope>
        {help.render(
          <Slot.Root
            ref={setRef}
            className={classes}
            aria-disabled={help.unavailable || undefined}
            data-unavailable={help.unavailable || undefined}
            {...rest}
            {...handlers}
            aria-describedby={describedBy}
            aria-keyshortcuts={keyShortcuts}
          >
            {children}
          </Slot.Root>,
        )}
      </KbdControlScope>
    );
  }
  return help.render(
    <button
      ref={setRef}
      type={type ?? 'button'}
      className={classes}
      disabled={help.unavailable ? undefined : disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || help.unavailable || undefined}
      data-unavailable={help.unavailable || undefined}
      {...rest}
      {...handlers}
      aria-describedby={describedBy}
      aria-keyshortcuts={keyShortcuts}
    >
      <KbdControlScope>
        {loading ? (
          <Spinner size={iconSize[size]} label="" className={styles.spinner} />
        ) : (
          icon && <Icon name={icon} size={iconSize[size]} />
        )}
        {children !== undefined && (
          <span className={styles.label} data-button-label="">
            {children}
          </span>
        )}
        {shortcut !== undefined && <Kbd keys={shortcut} decorative className={styles.shortcut} />}
        {iconEnd && !loading && <Icon name={iconEnd} size={iconSize[size]} />}
      </KbdControlScope>
    </button>,
  );
});

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, ControlHelpProps {
  /** Icon to show. */
  icon: IconName;
  /**
   * Accessible name, and the tooltip unless you pass `tooltip`. Every icon button shows a tooltip, because the
   * icon is its only visible label.
   */
  label: string;
  /**
   * Keys of the button's keyboard shortcut, such as `'P'`. The tooltip shows them, and the button sets
   * `aria-keyshortcuts`. Register the shortcut itself with the app's shortcut hook.
   */
  shortcut?: string | string[];
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Marks a toggle button as on, for tool rails and toolbars. */
  pressed?: boolean;
  loading?: boolean;
}

/**
 * A square button with an icon and no visible text. `label` is required, and the tooltip shows it unless you pass
 * a `tooltip` that says more. Start such a tooltip with the label's words, so a voice control user can say what
 * they see.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    shortcut,
    tooltip,
    disabledReason,
    tooltipSide,
    variant = 'ghost',
    size = 'md',
    pressed,
    loading = false,
    className,
    disabled,
    type,
    onClick,
    onPointerDown,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const explicit = hasContent(tooltip);
  // A native title is the old way to give help. Until a feature moves to `tooltip`, the kit adds no label tooltip.
  const shown = explicit ? tooltip : rest.title === undefined ? label : null;
  const help = useControlHelp({
    tooltip: shown,
    tooltipIsName: !explicit || tooltip === label,
    reason: disabled && hasContent(disabledReason) ? disabledReason : null,
    name: explicit ? tooltip : label,
    shortcut,
    side: tooltipSide,
  });
  const handlers = help.handlers<HTMLButtonElement>({
    onClick: loading ? preventDefault : onClick,
    onPointerDown,
    onKeyDown,
  });
  return help.render(
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      aria-disabled={help.unavailable || undefined}
      data-unavailable={help.unavailable || undefined}
      disabled={help.unavailable ? undefined : disabled}
      className={cx(
        styles.button,
        styles.iconOnly,
        styles[variant],
        styles[size],
        pressed && styles.pressed,
        className,
      )}
      {...rest}
      {...handlers}
      aria-describedby={joinIds(rest['aria-describedby'], help.describedBy)}
      aria-keyshortcuts={rest['aria-keyshortcuts'] ?? (shortcut ? ariaKeyShortcuts(shortcut) : undefined)}
    >
      {loading ? <Spinner size={iconSize[size]} label="" /> : <Icon name={icon} size={iconSize[size] + 2} />}
    </button>,
  );
});
