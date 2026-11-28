import type { TableDetail } from '@bxvtt/shared/protocol';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getApi, SiteInfo, useApiAction, useIdentity, useTableStore, useTableStoreApi } from '@/app';
import { Button, ConfirmDialog, EmptyState, PageLayout, Spinner, toast, Wordmark } from '@/ui';
import { ProfileMenu, RulesReference } from '@/features/home';
import { leaveKind, useTableExitFor } from '@/features/lobby/TableExit';
import { RETURN_TO_LOBBY_CONFIRM } from './returnToLobby';
import styles from './table.module.css';

/**
 * The screen for a table whose game the game service no longer has (`game_missing`). The connection has stopped,
 * so the screen reads the table over HTTP and offers the member's way out. A referee can return the table to its
 * lobby, which ends the missing game and keeps the saves, and delete the table from the lobby's menu. A player can
 * leave. Everyone can try once more.
 *
 * @param props.tableId - The table.
 */
export function GameMissing({ tableId }: { tableId: string }) {
  const userId = useIdentity((s) => s.user?.id ?? null);
  const store = useTableStoreApi();
  const status = useTableStore((s) => s.status);
  const [table, setTable] = useState<TableDetail | null>(null);
  const [retrying, setRetrying] = useState(false);
  const wasRetrying = useRef(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { run } = useApiAction();

  useEffect(() => {
    let cancelled = false;
    getApi()
      .getTable(tableId)
      .then(
        (detail) => !cancelled && setTable(detail),
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  // A retry that ends with the connection closed again found the game still missing. A snapshot takes the
  // table page off this screen instead.
  useEffect(() => {
    if (!wasRetrying.current || status !== 'closed') return;
    wasRetrying.current = false;
    setRetrying(false);
    toast.info("The game still can't be loaded.");
  }, [status]);

  const referee = table?.members.some((m) => m.user_id === userId && m.role === 'referee') ?? false;
  const exit = useTableExitFor(table === null ? null : { table, members: table.members, referee });

  const tryAgain = () => {
    wasRetrying.current = true;
    setRetrying(true);
    store.getState().reconnect();
  };

  // A player who is the last member still sees Leave table, whose dialog says that leaving deletes the table.
  const canLeave = table !== null && !referee && leaveKind(table.members, referee) !== 'only_referee';

  // The lobby's snapshot needs no game, so the connection opens once the game has ended.
  const returnToLobby = async () => {
    const result = await run(() => getApi().endGame(tableId), {
      success: 'Returned to lobby',
      errorTitle: "Couldn't end the game",
    });
    if (result.ok) store.getState().reconnect();
  };

  return (
    <PageLayout
      width="narrow"
      brand={
        <RouterLink to="/" aria-label="bxvtt home" className={styles.brand}>
          <Wordmark size="sm" />
        </RouterLink>
      }
      nav={
        <RouterLink to="/" className={styles.navLink}>
          Your tables
        </RouterLink>
      }
      headerActions={
        <>
          <RulesReference />
          <ProfileMenu />
        </>
      }
      footer={<SiteInfo />}
    >
      <div className={styles.centered}>
        {table === null ? (
          <Spinner size={32} label="Opening the table" />
        ) : (
          <EmptyState
            icon="warning"
            titleAs="h1"
            className={styles.missingState}
            title={`The game at ${table.name} can't be loaded`}
            description={
              referee
                ? "The game service no longer has this table's game. Return to the lobby to start a new game or continue from a save. If the server host restores the game service's data, try again."
                : "The game service no longer has this table's game. Ask the host to check the game service."
            }
            action={
              <div className={styles.missingActions}>
                {referee && (
                  <Button variant="primary" icon="undo" onClick={() => setConfirmEnd(true)}>
                    Return to lobby
                  </Button>
                )}
                <Button variant="secondary" icon="refresh" loading={retrying} onClick={tryAgain}>
                  Try again
                </Button>
                {canLeave && (
                  <Button variant="ghost" icon="log-out" onClick={() => exit.open('leave')}>
                    Leave table
                  </Button>
                )}
              </div>
            }
          />
        )}
        {exit.dialogs}
        <ConfirmDialog
          open={confirmEnd}
          onOpenChange={setConfirmEnd}
          {...RETURN_TO_LOBBY_CONFIRM}
          tone="danger"
          onConfirm={returnToLobby}
        />
      </div>
    </PageLayout>
  );
}
