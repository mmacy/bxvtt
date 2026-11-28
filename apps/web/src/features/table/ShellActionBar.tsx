import { useCaller, useGameMode, useTableSettings } from '@/app';
import { ActionBar, Avatar, Tooltip } from '@/ui';
import { CombatActions } from '@/features/combat';
import { ExploreActions } from '@/features/explore';
import { TownActions } from '@/features/town';
import styles from './table.module.css';

/**
 * Who moves the party, for the action bar's status. In a narrow bar the kit hides the last span visually, so the
 * caller's dot carries the sentence as its tooltip, and a table with no caller shows a short form instead.
 */
function CallerStatus() {
  const { member, isMe } = useCaller();
  const settings = useTableSettings();
  if (settings?.party_control === 'anyone') {
    return (
      <>
        <span data-status-short aria-hidden="true">
          Anyone moves
        </span>
        <span className={styles.callerText}>Anyone with a character moves the party</span>
      </>
    );
  }
  if (member === null) {
    return (
      <>
        <span data-status-short aria-hidden="true">
          No caller
        </span>
        <span className={styles.callerText}>No caller. The referee moves the party.</span>
      </>
    );
  }
  const text = isMe ? 'You are the caller' : `${member.name} is the caller`;
  // The dot takes focus so keyboard and touch users can open its tooltip. It carries the sentence as its name, so
  // the visible sentence beside it is hidden from assistive technology to be read once.
  return (
    <>
      <Tooltip content={text} describe={false}>
        <span className={styles.callerDot} role="img" aria-label={text} tabIndex={0}>
          <Avatar name={member.name} color={member.color} size="xs" decorative />
        </span>
      </Tooltip>
      <span className={styles.callerText} aria-hidden="true">
        {text}
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
