import styles from './referee.module.css';

/**
 * The state of an action that isn't legal in the current mode, for the trailing edge of an accordion header.
 * Put `<NameComma />` at the end of the header's title, so the header's name reads "End the encounter, Not
 * available now".
 */
export function UnavailableMark({ children = 'Not available now' }: { children?: string }) {
  return <span className={styles.unavailable}>{children}</span>;
}

/**
 * A comma for screen readers between an accordion header's title and its state. It stays in the text flow,
 * transparent, because a visually hidden element taken out of the flow makes the browser add a space before it.
 */
export function NameComma() {
  return <span className={styles.nameComma}>,</span>;
}
