import { useCaller, useGameMode, useTableSettings } from '@/app';
import { ActionBar, Avatar } from '@/ui';
import { CombatActions } from '@/features/combat';
import { ExploreActions } from '@/features/explore';
import { TownActions } from '@/features/town';
import styles from './table.module.css';

/** Who moves the party, for the action bar's status. */
function CallerStatus() {
  const { member, isMe } = useCaller();
  const settings = useTableSettings();
  if (settings?.party_control === 'anyone') {
    return <span className={styles.callerText}>Anyone with a character moves the party</span>;
  }
  if (member === null)
    return <span className={styles.callerText}>No caller. The referee moves the party.</span>;
  return (
    <>
      <Avatar name={member.name} color={member.color} size="xs" decorative />
      <span className={styles.callerText}>
        {isMe ? 'You are the caller' : `${member.name} is the caller`}
      </span>
    </>
  );
}

/** The action bar under the stage, filled by the feature for the current mode. */
export function ShellActionBar() {
  const mode = useGameMode();
  return (
    <ActionBar aria-label="Party actions" status={<CallerStatus />}>
      {mode === 'exploring' && <ExploreActions />}
      {mode === 'town' && <TownActions />}
      {(mode === 'encounter' || mode === 'battle') && <CombatActions />}
    </ActionBar>
  );
}
