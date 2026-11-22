import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/**
 * The battle overlay in `battle` mode: the round, each member's declaration, who has declared, the refusals of
 * the last attempt, and the playback of a resolved round. The shell draws it over the map.
 */
export function BattleBoard() {
  return (
    <div className={`${styles.overlay} ${styles.panel}`}>
      <EmptyState
        icon="battle"
        size="compact"
        title="Battle"
        description="Each character's declaration for the round, and the round's result, show here."
      />
    </div>
  );
}
