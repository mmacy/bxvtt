export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** A second line with detail. */
  description?: string;
  /** Milliseconds before the toast closes. Pass Infinity to keep it until dismissed. */
  duration?: number;
  action?: ToastAction;
  /** Reuse an id to replace an existing toast instead of stacking a new one. */
  id?: string;
}

export interface ToastRecord {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
  action?: ToastAction;
  /** Set when the toast starts its exit animation. */
  leaving: boolean;
  createdAt: number;
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 8000,
};

/** How long the exit animation runs before the toast is removed. */
export const TOAST_EXIT_MS = 180;
/** Most toasts on screen at once. Older ones close first. */
export const TOAST_LIMIT = 4;

type Listener = () => void;

let toasts: ToastRecord[] = [];
let counter = 0;
const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener();
}

function setToasts(next: ToastRecord[]) {
  toasts = next;
  emit();
}

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function schedule(id: string, ms: number) {
  clearTimer(id);
  if (!Number.isFinite(ms)) return;
  timers.set(
    id,
    setTimeout(() => dismiss(id), ms),
  );
}

function remove(id: string) {
  clearTimer(id);
  setToasts(toasts.filter((t) => t.id !== id));
}

function dismiss(id: string) {
  const target = toasts.find((t) => t.id === id);
  if (!target || target.leaving) return;
  clearTimer(id);
  setToasts(toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  timers.set(
    id,
    setTimeout(() => remove(id), TOAST_EXIT_MS),
  );
}

function show(tone: ToastTone, title: string, options: ToastOptions = {}): string {
  counter += 1;
  const id = options.id ?? `toast-${counter}`;
  const record: ToastRecord = {
    id,
    tone,
    title,
    description: options.description,
    duration: options.duration ?? DEFAULT_DURATION[tone],
    action: options.action,
    leaving: false,
    createdAt: Date.now(),
  };
  const existing = toasts.some((t) => t.id === id);
  let next = existing ? toasts.map((t) => (t.id === id ? record : t)) : [...toasts, record];
  const active = next.filter((t) => !t.leaving);
  if (active.length > TOAST_LIMIT) {
    const oldest = active[0];
    if (oldest) {
      next = next.map((t) => (t.id === oldest.id ? { ...t, leaving: true } : t));
      clearTimer(oldest.id);
      timers.set(
        oldest.id,
        setTimeout(() => remove(oldest.id), TOAST_EXIT_MS),
      );
    }
  }
  setToasts(next);
  schedule(id, record.duration);
  return id;
}

/**
 * Shows short notices that close on their own. Render a ToastProvider (or KitProvider) once
 * near the root, then call these functions from anywhere.
 *
 * ```ts
 * toast.success('Game saved', { description: 'Turn 14, the caves of chaos.' });
 * toast.error("Wren can't attack in melee", { description: "She isn't in the front rank." });
 * ```
 */
export const toast = {
  success: (title: string, options?: ToastOptions) => show('success', title, options),
  error: (title: string, options?: ToastOptions) => show('error', title, options),
  info: (title: string, options?: ToastOptions) => show('info', title, options),
  warning: (title: string, options?: ToastOptions) => show('warning', title, options),
  dismiss,
  /** Pauses the auto-close timer, such as while the pointer is over the toast. */
  pause: (id: string) => clearTimer(id),
  /** Restarts the auto-close timer with the toast's full duration. */
  resume: (id: string) => {
    const target = toasts.find((t) => t.id === id);
    if (target && !target.leaving) schedule(id, target.duration);
  },
  /** Removes every toast at once, without animation. */
  clear: () => {
    for (const id of timers.keys()) clearTimer(id);
    setToasts([]);
  },
};

export const toastStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): ToastRecord[] {
    return toasts;
  },
};
