import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/**
 * What the party perceives where it stands: the area's name and description, features, caches, stairs, and
 * known traps, from `useScene().here`. The shell shows it over the corner of the map while the party explores.
 */
export function ScenePanel() {
  return (
    <div className={`${styles.overlay} ${styles.panel}`}>
      <EmptyState
        icon="compass"
        size="compact"
        title="Scene"
        description="The current area's name, description, and features show here."
      />
    </div>
  );
}
