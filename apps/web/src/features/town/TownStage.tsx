import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/**
 * The stage while the party is in town: the town's description and services, shopping, the temple, selling
 * treasure, resting, preparing spells, and setting out for a dungeon.
 */
export function TownStage() {
  return (
    <div className={styles.fill}>
      <EmptyState
        icon="town"
        title="Town"
        description="The town shows here: its shops, the temple, and the road to the dungeon."
      />
    </div>
  );
}
