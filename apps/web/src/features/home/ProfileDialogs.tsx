import type { TableSummary } from '@bxvtt/shared/protocol';
import { isProblem } from '@bxvtt/shared/client';
import { useNavigate } from 'react-router-dom';
import { reportError, useIdentity } from '@/app';
import { Button, ConfirmDialog, Dialog, DialogClose, Spinner, toast } from '@/ui';
import { useProfileTables, type ProfileTablesState } from './profileTables';
import styles from './profile.module.css';

/** The words of the rejoin choice on an invite link's page, as `JoinPage` shows them. */
const REJOIN_CHOICE = "I've played at this table before";
/** What the feed calls the author of an entry whose author isn't at the table anymore, as `FeedPanel` does. */
const FORMER_MEMBER = 'A former member';

export interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function TableNames({ tables, label }: { tables: TableSummary[]; label: string }) {
  return (
    <ul className={styles.tableNames} aria-label={label}>
      {tables.map((table) => (
        <li key={table.id}>{table.name}</li>
      ))}
    </ul>
  );
}

function Checking() {
  return (
    <div className={styles.checking}>
      <Spinner size={16} label="" />
      <span>Checking your tables</span>
    </div>
  );
}

/** What signing out means for each of the user's tables: where a rejoin request can bring them back, and where not. */
function SignOutDetails({ tables, name }: { tables: ProfileTablesState; name: string }) {
  if (tables === null) return <Checking />;
  if (tables === 'error') {
    return (
      <p className={styles.text}>
        To come back as {name}, open a table&apos;s invite link, choose &quot;{REJOIN_CHOICE}&quot;, and ask a
        referee there to let you in. A referee can come back only at a table with another referee.
      </p>
    );
  }
  const stranded = [...tables.soleReferee, ...tables.alone];
  if (tables.others.length === 0 && stranded.length === 0) {
    return (
      <p className={styles.text}>
        You aren&apos;t at any table, so you can&apos;t come back as {name}. Your characters stay on the
        server, but you can&apos;t use them again. To remove your profile and characters from the server,
        cancel and choose Delete profile instead.
      </p>
    );
  }
  return (
    <>
      {tables.others.length > 0 && (
        <div className={styles.group}>
          <p className={styles.text}>
            {`To come back as ${name}, open the invite link of one of these tables, choose "${REJOIN_CHOICE}", and ask a referee there to let you in:`}
          </p>
          <TableNames tables={tables.others} label="Tables you can come back to" />
        </div>
      )}
      {stranded.length > 0 && (
        <div className={styles.group}>
          <p className={styles.text}>
            You can&apos;t come back to these tables, because no other referee there can let you in:
          </p>
          <TableNames tables={stranded} label="Tables you can't come back to" />
          {tables.soleReferee.length > 0 && (
            <p className={styles.text}>
              Before you sign out, make another member a referee at a table where others play, so you can come
              back to it, or delete the table from its table menu.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Asks before signing this browser out, and says how the user gets back to each table. bxvtt has no passwords,
 * so the only way back is a rejoin request that another referee approves.
 */
export function SignOutDialog({ open, onOpenChange }: ProfileDialogProps) {
  const user = useIdentity((s) => s.user);
  const signOut = useIdentity((s) => s.signOut);
  const navigate = useNavigate();
  const tables = useProfileTables(open);
  if (user === null) return null;
  const confirm = () => {
    navigate('/');
    void signOut();
    toast.success('Signed out');
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sign out of this browser?"
      description="Your tables, characters, and seats stay as they are. bxvtt has no passwords, so choosing your name again makes a new profile instead of signing you back in."
      confirmLabel="Sign out"
      onConfirm={confirm}
    >
      <SignOutDetails tables={tables} name={user.name} />
    </ConfirmDialog>
  );
}

/** What deleting the profile does to each of the user's tables. */
function DeleteDetails({ tables }: { tables: ProfileTablesState }) {
  if (tables === null) return <Checking />;
  if (tables === 'error') {
    return (
      <p className={styles.text}>
        A table where you&apos;re the only member is deleted too, with its saved games. Messages you wrote
        stay in each table&apos;s chat under the name &quot;{FORMER_MEMBER}&quot;.
      </p>
    );
  }
  const playing = tables.others.some((table) => table.phase === 'playing');
  return (
    <>
      {tables.alone.length > 0 && (
        <div className={styles.group}>
          <p className={styles.text}>
            You&apos;re the only member of these tables, so they are deleted too, with their saved games:
          </p>
          <TableNames tables={tables.alone} label="Tables that are deleted" />
        </div>
      )}
      {tables.others.length > 0 && (
        <div className={styles.group}>
          <p className={styles.text}>You leave these tables:</p>
          <TableNames tables={tables.others} label="Tables you leave" />
          <p className={styles.text}>
            Messages you wrote stay in their chat under the name &quot;{FORMER_MEMBER}&quot;.
            {playing &&
              ' A character you play in a game in progress stays in that game, and the referee controls it.'}
          </p>
        </div>
      )}
    </>
  );
}

/** Says why the profile can't be deleted yet: the user is the only referee of tables where others play. */
function BlockedDialog({ open, onOpenChange, tables }: ProfileDialogProps & { tables: TableSummary[] }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      hideClose
      title="You can't delete your profile yet"
      description="You're the only referee of these tables, and other people still play there:"
      footer={
        <DialogClose>
          <Button variant="secondary">Close</Button>
        </DialogClose>
      }
    >
      <div className={styles.group}>
        <TableNames tables={tables} label="Tables where you're the only referee" />
        <p className={styles.text}>
          At each of these tables, make another member a referee, or delete the table from its table menu.
          Then delete your profile.
        </p>
      </div>
    </Dialog>
  );
}

/**
 * Asks before deleting the user, and says what happens to each of their tables. When the user is the only
 * referee of a table where others play, the server refuses, so the dialog says what to do first instead.
 */
export function DeleteProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const user = useIdentity((s) => s.user);
  const deleteUser = useIdentity((s) => s.deleteUser);
  const navigate = useNavigate();
  const tables = useProfileTables(open);
  if (user === null) return null;
  if (tables !== null && tables !== 'error' && tables.soleReferee.length > 0) {
    return <BlockedDialog open={open} onOpenChange={onOpenChange} tables={tables.soleReferee} />;
  }
  const confirm = async () => {
    try {
      await deleteUser();
    } catch (error) {
      if (isProblem(error, 'last_referee')) {
        // Someone changed a table's referees since the dialog opened. The server's detail names the tables.
        toast.error("You can't delete your profile yet", { description: error.problem.detail });
      } else {
        reportError(error, { title: "Couldn't delete your profile" });
      }
      return;
    }
    navigate('/');
    toast.success('Profile deleted');
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete your profile?"
      description={`This deletes ${user.name} and every character you made, and takes you out of every table. You can't undo this.`}
      confirmLabel="Delete profile"
      tone="danger"
      onConfirm={confirm}
    >
      <DeleteDetails tables={tables} />
    </ConfirmDialog>
  );
}
