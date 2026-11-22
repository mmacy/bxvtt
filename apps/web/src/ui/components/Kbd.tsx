import { createContext, useContext, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Kbd.module.css';

const InControl = createContext(false);

/**
 * Marks its children as the content of a control, such as a button or menu item. A `Kbd` inside paints its keys
 * without adding them to the control's text, so the control's accessible name stays its label. Kit controls
 * provide this for you.
 */
export function KbdControlScope({ children }: { children: ReactNode }) {
  return <InControl.Provider value={true}>{children}</InControl.Provider>;
}

const ariaKeyNames: Record<string, string> = {
  ctrl: 'Control',
  control: 'Control',
  '⌘': 'Meta',
  cmd: 'Meta',
  meta: 'Meta',
  '⌥': 'Alt',
  option: 'Alt',
  alt: 'Alt',
  '⇧': 'Shift',
  shift: 'Shift',
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  '↵': 'Enter',
  space: 'Space',
  tab: 'Tab',
  up: 'ArrowUp',
  '↑': 'ArrowUp',
  down: 'ArrowDown',
  '↓': 'ArrowDown',
  left: 'ArrowLeft',
  '←': 'ArrowLeft',
  right: 'ArrowRight',
  '→': 'ArrowRight',
  '−': '-',
};

/**
 * The `aria-keyshortcuts` value for keys as `Kbd` shows them: `['Ctrl', 'K']` becomes `"Control+K"`, and
 * `'Esc'` becomes `"Escape"`.
 */
export function ariaKeyShortcuts(keys: string | string[]): string {
  const list = Array.isArray(keys) ? keys : [keys];
  return list
    .map((key) => {
      const trimmed = key.trim();
      return ariaKeyNames[trimmed.toLowerCase()] ?? (trimmed.length === 1 ? trimmed.toUpperCase() : trimmed);
    })
    .join('+');
}

export interface KbdProps {
  /** Keys in a chord, such as `['Ctrl', 'K']`. A single string renders one key. */
  keys: string | string[];
  /**
   * Paints the keys without putting them in the text, and hides them from assistive technology. Use it for a key
   * hint inside a control, and name the shortcut with `aria-keyshortcuts` on the control. Kit controls (Button,
   * menu items, tabs, command palette entries) turn it on for any `Kbd` inside them. Defaults to false elsewhere,
   * so a `Kbd` in running text reads and copies as text.
   */
  decorative?: boolean;
  className?: string;
}

/** A keyboard hint, such as a shortcut in a menu or tooltip. */
export function Kbd({ keys, decorative, className }: KbdProps) {
  const inControl = useContext(InControl);
  const hint = decorative ?? inControl;
  const list = Array.isArray(keys) ? keys : [keys];
  return (
    <span
      className={cx(styles.chord, className)}
      aria-hidden={hint || undefined}
      data-kbd-hint={hint || undefined}
    >
      {list.map((key, i) =>
        hint ? (
          <kbd key={`${key}-${i}`} className={cx(styles.key, styles.painted)} data-key={key} />
        ) : (
          <kbd key={`${key}-${i}`} className={styles.key}>
            {key}
          </kbd>
        ),
      )}
    </span>
  );
}
