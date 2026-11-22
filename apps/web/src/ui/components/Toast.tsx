import { useSyncExternalStore, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { toast, toastStore, type ToastRecord, type ToastTone } from './toastStore';
import styles from './Toast.module.css';

const toneIcon: Record<ToastTone, IconName> = {
  success: 'success',
  error: 'error',
  info: 'info',
  warning: 'warning',
};

function ToastItem({ record }: { record: ToastRecord }) {
  // The item stays a plain list item. The stack's live regions announce it, once, when it appears.
  return (
    <li
      className={cx(styles.toast, styles[record.tone], record.leaving && styles.leaving)}
      data-tone={record.tone}
      onMouseEnter={() => toast.pause(record.id)}
      onMouseLeave={() => toast.resume(record.id)}
      onFocus={() => toast.pause(record.id)}
      onBlur={() => toast.resume(record.id)}
    >
      <Icon name={toneIcon[record.tone]} size={18} className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{record.title}</p>
        {record.description && <p className={styles.description}>{record.description}</p>}
      </div>
      {record.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            record.action?.onClick();
            toast.dismiss(record.id);
          }}
        >
          {record.action.label}
        </button>
      )}
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss notification"
        onClick={() => toast.dismiss(record.id)}
      >
        <Icon name="close" size={14} />
      </button>
    </li>
  );
}

/** Renders the toast stack. ToastProvider includes it, so render it yourself only when you don't use a provider. */
export function Toaster({ className }: { className?: string }) {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, toastStore.getSnapshot);
  const said = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getAnnouncements,
    toastStore.getAnnouncements,
  );
  // A message stays in its live region while its toast is on screen, and the region empties when it closes.
  const showing = (entry: { id: string } | null) =>
    entry !== null && toasts.some((record) => record.id === entry.id && !record.leaving);
  return (
    <section className={cx(styles.viewport, className)} aria-label="Notifications">
      {/*
        The live regions exist before any toast, so screen readers pick up each new message. They use aria-live
        without a role, so an empty region never shows up as a status or an alert on the page.
      */}
      <div className="visually-hidden" aria-live="polite" aria-atomic="true" data-toast-live="polite">
        {said.polite && showing(said.polite) && <span key={said.polite.key}>{said.polite.text}</span>}
      </div>
      <div className="visually-hidden" aria-live="assertive" aria-atomic="true" data-toast-live="assertive">
        {said.assertive && showing(said.assertive) && (
          <span key={said.assertive.key}>{said.assertive.text}</span>
        )}
      </div>
      {toasts.length > 0 && (
        <ol className={styles.list}>
          {toasts.map((record) => (
            <ToastItem key={record.id} record={record} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Renders children and the toast stack. Use it once near the root of the app. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
