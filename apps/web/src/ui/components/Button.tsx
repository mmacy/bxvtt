import { Slot } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
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
  children?: ReactNode;
}

const iconSize: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

/** The kit's only button. Use `variant` for emphasis and `asChild` to style a link as a button. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconEnd,
    loading = false,
    block = false,
    asChild = false,
    className,
    disabled,
    children,
    type,
    onClick,
    ...rest
  },
  ref,
) {
  const classes = cx(
    styles.button,
    styles[variant],
    styles[size],
    block && styles.block,
    loading && styles.loading,
    className,
  );
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
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
      {iconEnd && !loading && <Icon name={iconEnd} size={iconSize[size]} />}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Icon to show. */
  icon: IconName;
  /** Accessible name, also shown as a native tooltip unless `title` is set. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Marks a toggle button as on, for tool rails and toolbars. */
  pressed?: boolean;
  loading?: boolean;
}

/** A square button with an icon and no visible text. `label` is required. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    variant = 'ghost',
    size = 'md',
    pressed,
    loading = false,
    className,
    type,
    onClick,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      className={cx(
        styles.button,
        styles.iconOnly,
        styles[variant],
        styles[size],
        pressed && styles.pressed,
        className,
      )}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Spinner size={iconSize[size]} label="" /> : <Icon name={icon} size={iconSize[size] + 2} />}
    </button>
  );
});
