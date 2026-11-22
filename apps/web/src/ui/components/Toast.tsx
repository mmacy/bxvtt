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
  const urgent = record.tone === 'error' || record.tone === 'warning';
  return (
    <li
      className={cx(styles.toast, styles[record.tone], record.leaving && styles.leaving)}
      role={urgent ? 'alert' : 'status'}
      aria-atomic="true"
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
  return (
    <section className={cx(styles.viewport, className)} aria-label="Notifications">
      <ol className={styles.list}>
        {toasts.map((record) => (
          <ToastItem key={record.id} record={record} />
        ))}
      </ol>
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
