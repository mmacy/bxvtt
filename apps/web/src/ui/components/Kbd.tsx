import { cx } from '../lib/cx';
import styles from './Kbd.module.css';

export interface KbdProps {
  /** Keys in a chord, such as `['Ctrl', 'K']`. A single string renders one key. */
  keys: string | string[];
  className?: string;
}

/** A keyboard hint, such as a shortcut in a menu or tooltip. */
export function Kbd({ keys, className }: KbdProps) {
  const list = Array.isArray(keys) ? keys : [keys];
  return (
    <span className={cx(styles.chord, className)}>
      {list.map((key, i) => (
        <kbd key={`${key}-${i}`} className={styles.key}>
          {key}
        </kbd>
      ))}
    </span>
  );
}
