import { useCallback, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  };
}

/** Whether a media query matches. Returns false where `matchMedia` is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => subscribeMedia(query)(onChange), [query]);
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}

/** Whether the user asked the system to reduce motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * State that a parent can control with `value` and `onChange`, or that the component
 * keeps itself when `value` is undefined.
 */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const [internal, setInternal] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const setValue = useCallback(
    (next: T) => {
      if (!controlled) setInternal(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [current, setValue];
}

/**
 * Focus handlers for a Radix dialog that opens without a Radix trigger, such as a controlled
 * dialog or a command palette. Radix returns focus only to its own trigger; these handlers
 * return focus to whatever had it when the dialog opened. When that element has left the page, such as a button
 * the dialog's own action removed, focus goes to `fallback` if it's on the page.
 */
export function useReturnFocus(enabled = true, fallback?: RefObject<HTMLElement | null>) {
  trackFocus();
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      if (!enabled) return;
      opener.current = focusOrigin();
    },
    onCloseAutoFocus: (event: Event) => {
      if (!enabled) return;
      const recorded = opener.current;
      opener.current = null;
      const target = recorded?.isConnected ? recorded : fallback?.current;
      if (!target || !target.isConnected) return;
      event.preventDefault();
      target.focus();
    },
  };
}

const LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/** The element that last had focus outside every dialog and menu, or `null` once focus fell to the page. */
let lastOutside: HTMLElement | null = null;
let tracking = false;

function trackFocus(): void {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener(
    'focusin',
    (event) => {
      if (event.target instanceof HTMLElement && event.target.closest(LAYER) === null)
        lastOutside = event.target;
    },
    true,
  );
  document.addEventListener(
    'focusout',
    (event) => {
      if (event.relatedTarget === null && event.target === lastOutside) lastOutside = null;
    },
    true,
  );
}

/**
 * The element focus should return to when a dialog closes: whatever has focus now. When that is an item of a
 * menu that is about to close, it is the button that opened the menu. When it is inside a dialog that is closing,
 * or on the page itself because that dialog is gone, such as the command palette that ran the action, it is the
 * element that had focus before that dialog.
 */
function focusOrigin(): HTMLElement | null {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // The layer that ran the action may already be gone, which leaves focus on the page itself.
  if (active === null || active === document.body) return lastOutside?.isConnected ? lastOutside : null;
  if (active.closest('[role="menu"]') !== null) {
    const triggers = document.querySelectorAll<HTMLElement>('[aria-haspopup="menu"][aria-expanded="true"]');
    for (const trigger of triggers) if (trigger.closest('[role="menu"]') === null) return trigger;
    return lastOutside;
  }
  if (
    active.closest('[role="dialog"][data-state="closed"], [role="alertdialog"][data-state="closed"]') !== null
  )
    return lastOutside;
  return active;
}
