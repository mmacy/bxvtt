import { isProblem } from '@bxvtt/shared/client';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Link as RouterLink, useParams } from 'react-router-dom';
import {
  TableProvider,
  getApi,
  isRetiredToken,
  SiteInfo,
  useCombatStage,
  useIdentity,
  useMapBus,
  useTableSession,
  useTableStore,
  useTableUi,
  type RemovedReason,
  type TableData,
} from '@/app';
import { Button, Card, EmptyState, PageLayout, Skeleton, Spinner } from '@/ui';
import { NameForm, ProfileMenu, homeNoticeState, type HomeNotice } from '@/features/home';
import { ConnectionBanner } from './ConnectionBanner';
import { LoadingScreen } from './LoadingScreen';
import { LobbyPagePart, PlayShellPart, preloadTableScreens } from './parts';
import { RejoinPrompt } from './RejoinPrompt';
import styles from './table.module.css';

// The lobby and the play screen load on demand, so the home page never downloads the map, the compendium, or the
// referee tools, and the lobby never downloads the play screen.
const LobbyPage = LobbyPagePart;
const PlayShell = PlayShellPart;

function Centered({ children }: { children: ReactNode }) {
  return (
    <PageLayout width="narrow" headerActions={<ProfileMenu />} footer={<SiteInfo />}>
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

/**
 * What a browser whose sign-in was retired shows: a referee let this user back in from another browser, which now
 * holds the user's token. It offers the ways on, and never makes a second member with the same name by itself.
 */
function RetiredSignIn() {
  return (
    <EmptyState
      icon="log-out"
      title="You signed in to this table from another browser"
      description={`A referee approved your rejoin request in another browser, which signed this browser out. Keep playing in that browser, or open the table's invite link here and choose "I've played at this table before".`}
      action={
        <Button asChild variant="secondary" icon="user">
          <RouterLink to="/">Continue as a new player</RouterLink>
        </Button>
      }
    />
  );
}

const REMOVED_TEXT: Record<
  Exclude<RemovedReason, 'table_deleted'>,
  { title: string; description: string }
> = {
  left: {
    title: 'You left this table',
    description: 'Ask the referee for a new invite link if you want to rejoin.',
  },
  kicked: {
    title: 'The referee removed you from this table',
    description: 'Ask the referee for a new invite link if you want to rejoin.',
  },
};

/**
 * What the home page tells a member whose table a referee deleted while they had it open. The server doesn't say
 * which referee did it, so the notice names the referee only when there is one other than this user. When this
 * user is the only referee, they deleted it themselves in another tab.
 *
 * @param state - The table's state when the server removed this user.
 */
export function tableDeletedNotice(state: Pick<TableData, 'table' | 'user'>): HomeNotice {
  const name = state.table?.name ?? 'The table';
  const detail =
    "Its saved games and chat are gone. You keep your characters, and you can add them to another table's party.";
  const referees = (state.table?.members ?? []).filter((m) => m.role === 'referee');
  const others = referees.filter((m) => m.user_id !== state.user?.id);
  if (others.length === 0) return { title: `You deleted ${name} in another tab`, detail };
  const only = others.length === 1 && others.length === referees.length ? others[0] : undefined;
  return {
    title: only ? `${only.name}, the referee, deleted ${name}` : `A referee deleted ${name}`,
    detail,
  };
}

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
          // The server says so with `token_retired`. A connection that was open and closed then is the same case.
          if (isRetiredToken(error)) forget('retired');
          else if (isProblem(error, 'unauthorized') && wasOpen) setRetired(true);
          else if (isProblem(error, 'unauthorized')) forget('forgotten');
          setChecked(true);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [forget, wasOpen]);
  if (!checked) return <Spinner size={24} label="Checking the table" />;
  if (retired) return <RetiredSignIn />;
  return (
    <EmptyState
      icon="lock"
      title="You aren't at this table"
      description="This table doesn't exist, or you aren't a member. Open an invite link from the referee to join."
      action={<HomeButton />}
    />
  );
}

function TableScreen() {
  const ready = useTableStore((s) => s.ready);
  const status = useTableStore((s) => s.status);
  const closeReason = useTableStore((s) => s.closeReason);
  const removed = useTableStore((s) => s.removed);
  const exitRequested = useTableStore((s) => s.exitRequested);
  const table = useTableStore((s) => s.table);
  const user = useTableStore((s) => s.user);
  const connectionError = useTableStore((s) => s.connectionError);
  const hasGame = useTableStore((s) => s.game !== null);
  const playing = useTableStore((s) => s.table?.phase === 'playing');

  // The user's own leave or delete navigates home when its request answers. The removal can arrive first.
  if (removed !== null && exitRequested) return <Navigate to="/" replace />;
  if (removed === 'table_deleted') {
    return <Navigate to="/" replace state={homeNoticeState(tableDeletedNotice({ table, user }))} />;
  }
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
            {status === 'reconnecting' ? 'Reconnecting to the table. Trying again.' : 'Opening the table'}
          </p>
          {status === 'reconnecting' && (
            <p className={styles.loadingHint}>
              {connectionError?.code === 'rate_limited'
                ? `${connectionError.detail} Reconnecting automatically.`
                : 'If this continues, the server or the game service might be offline. Your seat at the table is safe.'}
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
  useEffect(() => void preloadTableScreens(), []);
  const status = useIdentity((s) => s.status);
  const token = useIdentity((s) => s.token);
  const notice = useIdentity((s) => s.notice);
  if (status === 'unknown') {
    return (
      <Centered>
        <Spinner size={32} label="Loading" />
      </Centered>
    );
  }
  if (status === 'anonymous' && notice === 'retired') {
    return (
      <Centered>
        <RetiredSignIn />
      </Centered>
    );
  }
  if (status === 'anonymous' || token === null) {
    return (
      <Centered>
        <Card padding="lg">
          <NameForm
            title="Choose your name first"
            description="Choose a display name, then open the invite link from your referee to join this table."
            submitLabel="Continue"
          />
        </Card>
      </Centered>
    );
  }
  return <TableSessionView tableId={tableId} token={token} />;
}
