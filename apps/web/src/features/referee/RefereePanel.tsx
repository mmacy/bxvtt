import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/**
 * The referee tab of the dock, shown only to a referee with the lens on: the referee view, referee commands,
 * generators, secret rolls, the adventure's key, and referee notes. Map picks go through `useMapBus().requestPick`.
 */
export function RefereePanel() {
  return (
    <div className={styles.panel}>
      <EmptyState
        icon="referee"
        size="compact"
        title="Referee tools"
        description="The referee's view of the dungeon, the referee commands, and the adventure's key show here."
      />
    </div>
  );
}
