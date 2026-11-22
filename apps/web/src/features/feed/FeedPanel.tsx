import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/** The feed tab of the dock: chat, whispers, dice rolls, and the game log, with a message box. */
export function FeedPanel() {
  return (
    <div className={styles.panel}>
      <EmptyState
        icon="feed"
        size="compact"
        title="Feed"
        description="Chat, dice rolls, and the game log show here."
      />
    </div>
  );
}
