import type { TableDetail } from '@bxvtt/shared/protocol';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApi, useApiAction, useIsReferee, useMembers, useTableDetail, useTableStoreApi } from '@/app';
import { Button, ConfirmDialog, Dialog, DialogClose, type MenuEntry } from '@/ui';

/** Which exit dialog is open. */
export type ExitDialog = 'leave' | 'delete';

/**
 * Which leave dialog the user sees, by the same rules the server applies to `POST /api/tables/:tableId/leave`:
 * the last member's leave deletes the table, and the only referee can't leave while anyone else is at the table.
 *
 * @param members - The table's members.
 * @param referee - Whether this user is a referee.
 */
export function leaveKind(
  members: readonly { role: 'referee' | 'player' }[],
  referee: boolean,
): 'leave' | 'deletes' | 'only_referee' {
  if (members.length <= 1) return 'deletes';
  if (referee && members.filter((m) => m.role === 'referee').length === 1) return 'only_referee';
  return 'leave';
}

/** The table and the user that the exit actions are for. */
export interface TableExitTarget {
  table: Pick<TableDetail, 'id' | 'name' | 'phase'>;
  members: readonly { role: 'referee' | 'player' }[];
  referee: boolean;
}

/**
 * The "Leave table" and "Delete table" actions and their dialogs, for the table menu in the lobby and on the
 * play screen. Every member can leave, and only a referee sees "Delete table". The server checks both, so the
 * menu only offers what the server allows.
 *
 * @returns `items` for the table menu, and `dialogs` to render next to the menu.
 */
export function useTableExit(): {
  items: MenuEntry[];
  dialogs: ReactNode;
  open: (dialog: ExitDialog) => void;
} {
  const table = useTableDetail();
  const members = useMembers();
  const referee = useIsReferee();
  const store = useTableStoreApi();
  // The server tells this client's connection that it was removed before the request answers. The flag tells the
  // table page that the removal is the user's own, so it shows no notice about it.
  return useTableExitFor(table === null ? null : { table, members, referee }, (requested) =>
    store.getState().setExitRequested(requested),
  );
}

/**
 * The exit actions for a table that the user may not have open, such as one whose game can't be loaded: the
 * caller passes the table and the user's role.
 *
 * @param target - The table, its members, and whether the user is a referee, or `null` while unknown.
 * @param onExiting - Called with `true` before the request and `false` when it fails.
 * @returns `items` for a menu, `dialogs` to render, and `open` to show a dialog from a button.
 */
export function useTableExitFor(
  target: TableExitTarget | null,
  onExiting: (requested: boolean) => void = () => undefined,
): { items: MenuEntry[]; dialogs: ReactNode; open: (dialog: ExitDialog) => void } {
  const navigate = useNavigate();
  const { run } = useApiAction();
  const [open, setOpen] = useState<ExitDialog | null>(null);
  if (target === null) return { items: [], dialogs: null, open: () => undefined };
  const { table, members, referee } = target;

  const kind = leaveKind(members, referee);
  const items: MenuEntry[] = [
    { label: 'Leave table', icon: 'log-out', danger: true, onSelect: () => setOpen('leave') },
    ...(referee
      ? [{ label: 'Delete table', icon: 'trash' as const, danger: true, onSelect: () => setOpen('delete') }]
      : []),
  ];

  const exit = async (work: () => Promise<void>, success: string, errorTitle: string) => {
    onExiting(true);
    const result = await run(work, { success, errorTitle });
    if (result.ok) navigate('/', { replace: true });
    else onExiting(false);
  };
  const leave = () =>
    exit(
      () => getApi().leaveTable(table.id),
      kind === 'deletes' ? `You left and deleted ${table.name}` : `You left ${table.name}`,
      "Couldn't leave the table",
    );
  const remove = () =>
    exit(() => getApi().deleteTable(table.id), `You deleted ${table.name}`, "Couldn't delete the table");
  const close = (next: boolean) => !next && setOpen(null);

  const gone = 'its saved games, its chat, its notes, and the adventures uploaded to it';
  const dialogs = (
    <>
      {kind === 'only_referee' ? (
        <Dialog
          open={open === 'leave'}
          onOpenChange={close}
          size="sm"
          title="Make another referee before you leave"
          description={
            table.phase === 'playing'
              ? `You're the only referee at ${table.name}, and every table needs one. Return to the lobby, make another member a referee under People at the table, and then leave. To end the table for everyone, delete it instead.`
              : `You're the only referee at ${table.name}, and every table needs one. Make another member a referee under People at the table, and then leave. To end the table for everyone, delete it instead.`
          }
          footer={
            <>
              <DialogClose>
                <Button variant="ghost">Close</Button>
              </DialogClose>
              <Button variant="danger" icon="trash" onClick={() => setOpen('delete')}>
                Delete table
              </Button>
            </>
          }
        />
      ) : (
        <ConfirmDialog
          open={open === 'leave'}
          onOpenChange={close}
          title={kind === 'deletes' ? 'Leave and delete table?' : 'Leave table?'}
          description={
            kind === 'deletes'
              ? `You're the last member, so leaving also deletes ${table.name} with ${gone}. You can't recover them. You keep your characters.`
              : `You leave ${table.name} and its party. To come back, you need the table's invite link from the referee.`
          }
          confirmLabel={kind === 'deletes' ? 'Leave and delete table' : 'Leave table'}
          tone="danger"
          onConfirm={leave}
        />
      )}
      <ConfirmDialog
        open={open === 'delete'}
        onOpenChange={close}
        title="Delete table?"
        description={`This deletes ${table.name} for everyone at the table, with ${gone}. You can't recover them. Everyone keeps their characters.`}
        confirmLabel="Delete table"
        tone="danger"
        onConfirm={remove}
      />
    </>
  );
  return { items, dialogs, open: setOpen };
}
