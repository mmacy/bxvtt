import { EmptyState } from '@/ui';
import styles from './placeholder.module.css';

/** The party tab of the dock: every member at a glance, in marching order. Select a member to open their sheet. */
export function PartyPanel() {
  return (
    <div className={styles.panel}>
      <EmptyState
        icon="users"
        size="compact"
        title="Party"
        description="The party at a glance shows here: hit points, armour class, conditions, and the marching order."
      />
    </div>
  );
}
