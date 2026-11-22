import { isProblem } from '@bxvtt/shared/client';
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  TableProvider,
  getApi,
  useCombatStage,
  useIdentity,
  useMapBus,
  useTableSession,
  useTableStore,
  useTableUi,
  type RemovedReason,
} from '@/app';
import { Button, Card, EmptyState, PageLayout, Skeleton, Spinner } from '@/ui';
import { NameForm, ProfileMenu } from '@/features/home';
import { ConnectionBanner } from './ConnectionBanner';
import { LoadingScreen } from './LoadingScreen';
import { RejoinPrompt } from './RejoinPrompt';
import styles from './table.module.css';

// The lobby and the play screen load on demand, so the home page never downloads the map, the compendium, or the
// referee tools, and the lobby never downloads the play screen.
const LobbyPage = lazy(() => import('@/features/lobby').then((module) => ({ default: module.LobbyPage })));
const PlayShell = lazy(() => import('./PlayShell').then((module) => ({ default: module.PlayShell })));

function Centered({ children }: { children: ReactNode }) {
  return (
    <PageLayout width="narrow" headerActions={<ProfileMenu />}>
      <div className={styles.centered}>{children}</div>
    </PageLayout>
  );
}

function HomeButton() {
  return (
    <Button asChild variant="primary" icon="home">
      <RouterLink to="/">Go to your tables</RouterLink>
    </Button>
  );
}

const REMOVED_TEXT: Record<RemovedReason, { title: string; description: string }> = {
  left: { title: 'You left this table', description: 'To come back, ask the referee for a new invite link.' },
  kicked: {
    title: 'The referee removed you from this table',
    description: 'To come back, ask the referee for a new invite link.',
  },
  table_deleted: {
    title: 'This table was deleted',
    description: 'The referee deleted the table and its games.',
  },
};

/**
 * What to show when the server refused the connection: a sign-in that another browser took over, a forgotten
 * user, or a table the user isn't at.
 *
 * @param wasOpen - Whether this browser was at the table before the server closed the connection. A referee who
 *   lets this member back in from another browser retires this browser's token, and the server closes its
 *   connection then.
 */
function AuthFailed({ wasOpen }: { wasOpen: boolean }) {
  const forget = useIdentity((s) => s.forget);
  const [checked, setChecked] = useState(false);
  const [retired, setRetired] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getApi()
      .me()
      .then(
        () => !cancelled && setChecked(true),
        (error: unknown) => {
          if (cancelled) return;
          // The home page asks for a name again once the user leaves this page.
          if (isProblem(error, 'unauthorized') && wasOpen) setRetired(true);
          else if (isProblem(error, 'unauthorized')) forget('forgotten');
          setChecked(true);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [forget, wasOpen]);
  if (!checked) return <Spinner size={24} label="Checking the table" />;
  if (retired) {
    return (
      <EmptyState
        icon="log-out"
        title="You've signed in to this table from another browser"
        description="A referee let you back in somewhere else, so this browser's sign-in no longer works. Play on in the other browser, or pick a name here to join as someone new."
        action={<HomeButton />}
      />
    );
  }
  return (
    <EmptyState
      icon="lock"
      title="You aren't at this table"
      description="The table doesn't exist, or you aren't one of its members. To join it, open the invite link from its referee."
      action={<HomeButton />}
    />
  );
}

function TableScreen() {
  const ready = useTableStore((s) => s.ready);
  const status = useTableStore((s) => s.status);
  const closeReason = useTableStore((s) => s.closeReason);
  const removed = useTableStore((s) => s.removed);
  const connectionError = useTableStore((s) => s.connectionError);
  const hasGame = useTableStore((s) => s.game !== null);
  const playing = useTableStore((s) => s.table?.phase === 'playing');

  if (removed !== null) {
    const text = REMOVED_TEXT[removed];
    return (
      <Centered>
        <EmptyState
          icon="log-out"
          title={text.title}
          description={text.description}
          action={<HomeButton />}
        />
      </Centered>
    );
  }
  if (status === 'closed' && closeReason === 'auth_failed') {
    return (
      <Centered>
        <AuthFailed wasOpen={ready} />
      </Centered>
    );
  }
  if (!ready) {
    return (
      <Centered>
        <div className={styles.loading} role="status">
          <Spinner size={32} label="" />
          <p>
            {status === 'reconnecting' ? "Can't reach the table yet. Trying again." : 'Opening the table'}
          </p>
          {status === 'reconnecting' && (
            <p className={styles.loadingHint}>
              {connectionError?.code === 'rate_limited'
                ? `${connectionError.detail} The page tries again by itself.`
                : 'If this goes on, the bxvtt server or bxapi may be down. Your place at the table is safe.'}
            </p>
          )}
        </div>
      </Centered>
    );
  }
  if (hasGame) {
    return (
      <Suspense fallback={<LoadingScreen label="Opening the table" />}>
        <PlayShell />
      </Suspense>
    );
  }
  if (playing) {
    return (
      <Centered>
        <div className={styles.loading} role="status">
          <Skeleton shape="block" height={120} />
          <p>Loading the game</p>
        </div>
      </Centered>
    );
  }
  return (
    <Suspense fallback={<LoadingScreen label="Opening the lobby" />}>
      <LobbyPage
        banner={
          <>
            <ConnectionBanner />
            <RejoinPrompt />
          </>
        }
      />
    </Suspense>
  );
}

/** Opens a table's live session and shows its lobby or its play screen. */
function TableSessionView({ tableId, token }: { tableId: string; token: string }) {
  const store = useTableSession(tableId, token);
  useEffect(
    () => () => {
      useMapBus.getState().reset();
      useTableUi.getState().reset();
      useCombatStage.getState().reset();
    },
    [tableId],
  );
  if (store === null) {
    return (
      <Centered>
        <Spinner size={32} label="Opening the table" />
      </Centered>
    );
  }
  return (
    <TableProvider store={store}>
      <TableScreen />
    </TableProvider>
  );
}

/** `/tables/:tableId`: the table's lobby before the game starts, and the play screen after. */
export function TablePage() {
  const { tableId = '' } = useParams();
  const status = useIdentity((s) => s.status);
  const token = useIdentity((s) => s.token);
  if (status === 'unknown') {
    return (
      <Centered>
        <Spinner size={32} label="Loading" />
      </Centered>
    );
  }
  if (status === 'anonymous' || token === null) {
    return (
      <Centered>
        <Card padding="lg">
          <NameForm
            title="Pick your name first"
            description="To join this table, pick a name and then open the invite link from its referee."
            submitLabel="Continue"
          />
        </Card>
      </Centered>
    );
  }
  return <TableSessionView tableId={tableId} token={token} />;
}
