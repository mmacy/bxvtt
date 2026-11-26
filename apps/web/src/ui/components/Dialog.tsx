import { AlertDialog, Dialog as DialogPrimitive } from 'radix-ui';
import { useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useReturnFocus } from '../lib/hooks';
import { Button } from './Button';
import { Tooltip } from './Popover';
import styles from './Dialog.module.css';

/**
 * Which element takes focus when a dialog or drawer opens: a ref to an element inside it, or `'content'` for the
 * window itself, so a screen reader starts at the title and no control looks selected. By default Radix focuses
 * the first focusable element.
 */
export type InitialFocus = RefObject<HTMLElement | null> | 'content';

/** Focus handlers that record the opener and then move focus as `initialFocus` asks. */
function useOpenFocus(
  enabled: boolean,
  initialFocus: InitialFocus | undefined,
  returnFocus?: RefObject<HTMLElement | null>,
) {
  const focus = useReturnFocus(enabled, returnFocus);
  return {
    onOpenAutoFocus: (event: Event) => {
      focus.onOpenAutoFocus();
      if (initialFocus === undefined) return;
      if (initialFocus === 'content') {
        if (event.currentTarget instanceof HTMLElement) {
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
        }
        return;
      }
      const target = initialFocus.current;
      if (target) {
        event.preventDefault();
        target.focus({ preventScroll: true });
      }
    },
    onCloseAutoFocus: focus.onCloseAutoFocus,
  };
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** An element that opens the dialog, usually a Button. */
  trigger?: ReactElement;
  title: ReactNode;
  /** One sentence under the title. Also the dialog's accessible description. */
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons at the bottom, primary action last. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hides the close button. Escape still closes the dialog. */
  hideClose?: boolean;
  /** Puts the body on paper, for handouts and sheets. */
  paper?: boolean;
  /** Which element takes focus on open. Defaults to the first focusable element. */
  initialFocus?: InitialFocus;
  /**
   * Which element takes focus on close when the element that opened the dialog has left the page, such as a
   * button that the dialog's own action removed. Give a heading `tabIndex={-1}` to make it focusable.
   */
  returnFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * A modal window. Focus moves into it, Tab stays inside, and Escape or the close button closes it.
 */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideClose = false,
  paper = false,
  initialFocus,
  returnFocus,
  className,
}: DialogProps) {
  const focus = useOpenFocus(!trigger, initialFocus, returnFocus);
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.overlay} />
        <DialogPrimitive.Content
          className={cx(styles.dialog, styles[size], className)}
          data-surface={paper ? 'paper' : undefined}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className={styles.header}>
            <div className={styles.headings}>
              <DialogPrimitive.Title className={styles.title}>{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className={styles.description}>
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            {!hideClose && (
              <Tooltip content="Close" describe={false}>
                <DialogPrimitive.Close className={styles.close} aria-label="Close">
                  <Icon name="close" size={18} />
                </DialogPrimitive.Close>
              </Tooltip>
            )}
          </header>
          {children !== undefined && <div className={styles.body}>{children}</div>}
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Wraps an element so that activating it closes the surrounding Dialog or Drawer. */
export function DialogClose({ children }: { children: ReactElement }) {
  return <DialogPrimitive.Close asChild>{children}</DialogPrimitive.Close>;
}

export interface ConfirmDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  title: ReactNode;
  /** What happens if the user confirms, in one or two sentences. It renders inside a paragraph. */
  description: ReactNode;
  /**
   * Content below the description, such as a checkbox that changes what the action does. It can hold block
   * elements, unlike `description`.
   */
  children?: ReactNode;
  /** Names the action, such as "Restore save". Never "OK" or "Yes". */
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for actions that destroy or cannot be undone. */
  tone?: 'primary' | 'danger';
  /** Runs on confirm. If it returns a promise, the button shows a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
}

/** Asks the user to confirm an action before it happens. Focus starts on the cancel button. */
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const focus = useReturnFocus(!trigger);
  const isOpen = open ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const confirm = async () => {
    const result = onConfirm();
    if (result instanceof Promise) {
      setBusy(true);
      try {
        await result;
        setOpen(false);
      } finally {
        setBusy(false);
      }
    } else {
      setOpen(false);
    }
  };
  return (
    <AlertDialog.Root open={isOpen} onOpenChange={setOpen}>
      {trigger && <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content
          className={cx(styles.dialog, styles.sm)}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onCloseAutoFocus={focus.onCloseAutoFocus}
        >
          <header className={styles.header}>
            <div className={styles.headings}>
              <AlertDialog.Title className={styles.title}>{title}</AlertDialog.Title>
              <AlertDialog.Description className={styles.description}>{description}</AlertDialog.Description>
            </div>
          </header>
          {children !== undefined && <div className={cx(styles.body, styles.confirmBody)}>{children}</div>}
          <footer className={styles.footer}>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => {
                void confirm();
              }}
            >
              {confirmLabel}
            </Button>
          </footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export interface DrawerProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  /** Hides the title visually, for drawers whose content has its own heading. */
  hideTitle?: boolean;
  side?: 'right' | 'left' | 'bottom';
  /** Width for side drawers, as a CSS length. Defaults to min(420px, 92vw). */
  width?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Removes padding from the body, for content that manages its own layout. */
  flush?: boolean;
  /**
   * Dims the page behind the drawer. Defaults to true. Pass false for a drawer that keeps the table in view, such
   * as the rules reference. The overlay still catches clicks, so a click outside closes the drawer.
   */
  dimmed?: boolean;
  /** Which element takes focus on open. Defaults to the first focusable element. */
  initialFocus?: InitialFocus;
  className?: string;
}

/** A side sheet over the page, such as the dock on a tablet or a monster's stat block. */
export function Drawer({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  hideTitle = false,
  side = 'right',
  width,
  children,
  footer,
  flush = false,
  dimmed = true,
  initialFocus,
  className,
}: DrawerProps) {
  const focus = useOpenFocus(!trigger, initialFocus);
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cx(styles.overlay, !dimmed && styles.overlayClear)} />
        <DialogPrimitive.Content
          className={cx(styles.drawer, styles[`drawer-${side}`], className)}
          style={width ? { width } : undefined}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className={cx(styles.header, styles.drawerHeader, hideTitle && styles.headerHidden)}>
            <div className={cx(styles.headings, hideTitle && 'visually-hidden')}>
              <DialogPrimitive.Title className={styles.title}>{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className={styles.description}>
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <Tooltip content="Close" describe={false}>
              <DialogPrimitive.Close className={styles.close} aria-label="Close">
                <Icon name="close" size={18} />
              </DialogPrimitive.Close>
            </Tooltip>
          </header>
          <div className={cx(styles.drawerBody, flush && styles.flush)}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
