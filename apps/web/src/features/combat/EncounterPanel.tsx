import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/**
 * The encounter overlay in `encounter` mode: the monster groups, their distance, bearing, and stance, and the
 * choices to talk, flee, wait, or fight. The shell draws it over the map.
 */
export function EncounterPanel() {
  return (
    <div className={`${styles.overlay} ${styles.panel}`}>
      <EmptyState
        icon="eye"
        size="compact"
        title="Encounter"
        description="The monsters the party has met show here, with the choice to talk, flee, wait, or fight."
      />
    </div>
  );
}
