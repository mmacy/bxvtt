import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

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
 * return focus to whatever had it when the dialog opened.
 */
export function useReturnFocus(enabled = true) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      if (!enabled) return;
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event: Event) => {
      const target = opener.current;
      if (!enabled || !target || !target.isConnected) return;
      event.preventDefault();
      target.focus();
      opener.current = null;
    },
  };
}
