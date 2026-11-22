import styles from './placeholder.module.css';

/**
 * The action bar's content in `exploring` mode: move, turn, search, listen, doors, rest, light, and the other
 * actions the party can take where it stands. Render `ActionBarItem` buttons; the shell supplies the bar and
 * the caller status.
 */
export function ExploreActions() {
  return <span className={styles.bar}>Exploration actions appear here.</span>;
}
