import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/** The journal tab of the dock: the active quests, the session journal, and the party's shared notes. */
export function JournalPanel() {
  return (
    <div className={styles.panel}>
      <EmptyState
        icon="journal"
        size="compact"
        title="Journal"
        description="Quests, the session journal, and the party's shared notes show here."
      />
    </div>
  );
}
