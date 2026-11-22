import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/**
 * The dungeon map with its tools. The shell renders it as the stage whenever the party is in a dungeon, in every
 * mode, and draws encounter and battle overlays above it. It reads the party's level from `usePlayerView`, the
 * active tool and pick requests from `useMapBus`, and annotations from `useAnnotations`.
 */
export function MapStage() {
  return (
    <div className={styles.fill}>
      <EmptyState
        icon="map"
        title="Dungeon map"
        description="The map of the party's level draws here, with the party token, doors, and the tools in the rail."
      />
    </div>
  );
}
