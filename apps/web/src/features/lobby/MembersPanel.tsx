import type { Member } from '@bxvtt/shared/protocol';
import { useState } from 'react';
import {
  getApi,
  useApiAction,
  useIsReferee,
  useMembers,
  useTableDetail,
  useTableStoreApi,
  useTableUser,
} from '@/app';
import { Avatar, Badge, ConfirmDialog, DropdownMenu, IconButton, type MenuEntry } from '@/ui';
import styles from './lobby.module.css';

/**
 * The people at the table with their role and whether they are online. A referee can make another member a
 * referee or a player, and remove a member.
 */
export function MembersPanel() {
  const table = useTableDetail();
  const members = useMembers();
  const me = useTableUser();
  const referee = useIsReferee();
  const store = useTableStoreApi();
  const { run } = useApiAction();
  const [removing, setRemoving] = useState<Member | null>(null);
  if (table === null) return null;
  const refereeCount = members.filter((m) => m.role === 'referee').length;

  const setRole = async (member: Member, role: Member['role']) => {
    const result = await run(() => getApi().setMemberRole(table.id, member.user_id, role), {
      success: role === 'referee' ? `${member.name} is now a referee` : `${member.name} is now a player`,
      errorTitle: `Couldn't change ${member.name}'s role`,
    });
    if (result.ok) store.getState().receiveTable(result.value);
  };

  const remove = async () => {
    if (removing === null) return;
    const result = await run(() => getApi().removeMember(table.id, removing.user_id), {
      success: `${removing.name} left the table`,
      errorTitle: `Couldn't remove ${removing.name}`,
    });
    if (result.ok) store.getState().receiveTable(result.value);
  };

  return (
    <>
      <ul className={styles.members}>
        {members.map((member) => {
          const isMe = member.user_id === me?.id;
          const items: MenuEntry[] = [];
          if (member.role === 'player') {
            items.push({
              label: 'Make referee',
              icon: 'referee',
              onSelect: () => void setRole(member, 'referee'),
            });
          } else {
            items.push({
              label: 'Make player',
              icon: 'user',
              disabled: refereeCount <= 1,
              disabledReason: 'Every table needs a referee. Make another member a referee first.',
              onSelect: () => void setRole(member, 'player'),
            });
          }
          if (!isMe) {
            items.push({ type: 'separator' });
            items.push({
              label: 'Remove from table',
              icon: 'log-out',
              danger: true,
              onSelect: () => setRemoving(member),
            });
          }
          return (
            <li key={member.user_id} className={styles.member}>
              <Avatar
                name={member.name}
                color={member.color}
                size="md"
                presence={member.online ? 'online' : 'offline'}
                referee={member.role === 'referee'}
                decorative
              />
              <div className={styles.grow}>
                <p className={styles.memberName}>
                  {member.name}
                  {isMe && <span className={styles.you}> (you)</span>}
                </p>
                <p className={styles.memberMeta}>{member.online ? 'Online' : 'Away'}</p>
              </div>
              <Badge tone={member.role === 'referee' ? 'referee' : 'neutral'}>
                {member.role === 'referee' ? 'Referee' : 'Player'}
              </Badge>
              {referee && (
                <DropdownMenu
                  align="end"
                  trigger={
                    <IconButton icon="more" label={`Actions for ${member.name}`} variant="ghost" size="sm" />
                  }
                  items={items}
                />
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Remove ${removing?.name ?? 'this member'} from the table?`}
        description="This removes them from the table, removes their characters from the party, and replaces the invite link so the old link no longer works."
        confirmLabel="Remove from table"
        tone="danger"
        onConfirm={remove}
      />
    </>
  );
}
