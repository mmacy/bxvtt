import { Slot } from 'radix-ui';
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import { KbdControlScope } from './Kbd';
import styles from './Link.module.css';

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** "inline" sits in running text; "quiet" is for lists and meta text. */
  tone?: 'inline' | 'quiet';
  /** Opens in a new tab and shows an external-link icon. */
  external?: boolean;
  /** Renders the single child element, such as a router link, with link styles. */
  asChild?: boolean;
}

/** A text link. Use Button with `asChild` for a link that looks like a button. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { tone = 'inline', external = false, asChild = false, className, children, ...rest },
  ref,
) {
  const classes = cx(styles.link, styles[tone], className);
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <a
      ref={ref}
      className={classes}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      {...rest}
    >
      {children}
      {external && (
        <>
          <Icon name="external-link" size={12} className={styles.externalIcon} />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </>
      )}
    </a>
  );
});

export interface LinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** "inline" sits in running text; "quiet" is for lists and meta text. */
  tone?: 'inline' | 'quiet';
}

/**
 * A button that looks like a text link, for an in-app cross-link that opens something instead of going to a
 * URL, such as a spell name that opens the rules reference. Use Link for a URL.
 */
export const LinkButton = forwardRef<HTMLButtonElement, LinkButtonProps>(function LinkButton(
  { tone = 'inline', type, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cx(styles.link, styles.button, styles[tone], className)}
      {...rest}
    >
      <KbdControlScope>{children}</KbdControlScope>
    </button>
  );
});
