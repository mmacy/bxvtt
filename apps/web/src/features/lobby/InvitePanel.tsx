import { useState } from 'react';
import { getApi, useApiAction, useIsReferee, useTableDetail, useTableStoreApi } from '@/app';
import { Button, ConfirmDialog, TextInput, toast } from '@/ui';
import styles from './lobby.module.css';

/** The invite link of a table, on this page's origin. */
export function inviteLink(inviteCode: string, origin: string = window.location.origin): string {
  return `${origin}/join/${inviteCode}`;
}

/**
 * Copies a table's invite link and confirms with a toast.
 *
 * @param inviteCode - The table's invite code.
 */
export async function copyInviteLink(inviteCode: string): Promise<void> {
  const link = inviteLink(inviteCode);
  try {
    await navigator.clipboard.writeText(link);
    toast.success('Invite link copied', {
      description: 'Share this link with players so they can join the table.',
    });
  } catch {
    toast.info('Copy the invite link', { description: link, duration: 15_000 });
  }
}

/** The invite link with a copy button. A referee can replace the link so the old one stops working. */
export function InvitePanel() {
  const table = useTableDetail();
  const referee = useIsReferee();
  const store = useTableStoreApi();
  const { run } = useApiAction();
  const [confirming, setConfirming] = useState(false);
  // The server sends the invite code to referees only.
  const inviteCode = table?.invite_code;
  if (table === null || inviteCode === undefined) return null;
  const link = inviteLink(inviteCode);

  const regenerate = async () => {
    const result = await run(() => getApi().regenerateInviteCode(table.id), {
      success: 'Invite link replaced',
      errorTitle: "Couldn't replace invite link",
    });
    if (result.ok) store.getState().receiveTable(result.value);
  };

  return (
    <div className={styles.invite}>
      <p className={styles.note}>Anyone with this link can join the table as a player.</p>
      <div className={styles.inviteRow}>
        <TextInput
          value={link}
          readOnly
          aria-label="Invite link"
          wrapperClassName={styles.grow}
          onFocus={(event) => event.target.select()}
        />
        <Button
          variant="secondary"
          icon="copy"
          tooltip="Copy the invite link to send to your players"
          onClick={() => void copyInviteLink(inviteCode)}
        >
          Copy
        </Button>
      </div>
      {referee && (
        <>
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => setConfirming(true)}>
            Replace invite link
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Replace invite link?"
            description="Anyone with the current link will no longer be able to use it to join. Current table members keep their places."
            confirmLabel="Replace invite link"
            onConfirm={regenerate}
          />
        </>
      )}
    </div>
  );
}
