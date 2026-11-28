import { LIMITS, type TableSummary } from '@bxvtt/shared/protocol';
import { isProblem } from '@bxvtt/shared/client';
import { sessionModeLabel } from '@bxvtt/shared/text';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { describeProblem, displayStringProblem, getApi, SiteInfo, useIdentity } from '@/app';
import { Badge, Banner, Button, Card, EmptyState, Field, Icon, PageLayout, Skeleton, TextInput } from '@/ui';
import { HealthBanner } from './HealthBanner';
import { NameForm } from './NameForm';
import { ProfileMenu } from './ProfileMenu';
import { RulesReference } from './RulesReference';
import styles from './home.module.css';

/**
 * News for the home page that another page sends in the router state, such as a table that a referee deleted
 * while this user had it open.
 */
export interface HomeNotice {
  title: string;
  detail: string;
}

/**
 * The router state that shows a {@link HomeNotice} on the home page.
 *
 * @param notice - The notice.
 */
export function homeNoticeState(notice: HomeNotice): { homeNotice: HomeNotice } {
  return { homeNotice: notice };
}

function readHomeNotice(state: unknown): HomeNotice | null {
  if (typeof state !== 'object' || state === null || !('homeNotice' in state)) return null;
  const notice = state.homeNotice;
  if (typeof notice !== 'object' || notice === null || !('title' in notice) || !('detail' in notice))
    return null;
  const { title, detail } = notice;
  return typeof title === 'string' && typeof detail === 'string' ? { title, detail } : null;
}

/**
 * Reads an invite code from what a visitor pasted: a full invite link such as
 * `https://table.example/join/ABCDE-FGHIJ-KLMNO-PQRST`, or the code itself.
 *
 * @param input - The pasted text.
 * @returns The code, or `null` when the text is empty.
 */
export function parseInvite(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  const match = /\/join\/([^/?#\s]+)/.exec(text);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return text;
}

function Intro() {
  return (
    <section className={styles.intro} aria-labelledby="intro-title">
      <p className={styles.kicker}>A virtual tabletop for B/X</p>
      <h1 id="intro-title" className={styles.introTitle}>
        Play the 1981 Basic and Expert rules together in your browser.
      </h1>
      <p className={styles.introLead}>
        One person runs the adventure as referee while the rest of your group plays the party. Share a map,
        roll dice, track turns and light, and venture from town into the dungeon.
      </p>
      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNumber}>1</span>
          Choose the display name other players see.
        </li>
        <li>
          <span className={styles.stepNumber}>2</span>
          Create a table as referee, or open an invite link from your referee.
        </li>
        <li>
          <span className={styles.stepNumber}>3</span>
          Roll or add characters in the lobby, then start the adventure.
        </li>
      </ol>
    </section>
  );
}

/** What a table is doing, as separate facts: where it is, and in a game, the adventure and the mode. */
function tableStatus(table: TableSummary): string[] {
  if (table.game === null || table.phase === 'lobby') return ['In the lobby'];
  // A game that can't be loaded has no mode to tell.
  if (table.game.missing === true) return [table.game.adventure_name];
  return [table.game.adventure_name, sessionModeLabel(table.game.mode)];
}

function TableList({
  tables,
  error,
  onRetry,
}: {
  tables: TableSummary[] | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (error !== null) {
    return (
      <Banner
        tone="warning"
        title="Couldn't load your tables"
        actions={
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {error}
      </Banner>
    );
  }
  if (tables === null) {
    return (
      <div className={styles.tableList}>
        <Skeleton shape="block" height={72} />
        <Skeleton shape="block" height={72} />
      </div>
    );
  }
  if (tables.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No tables yet"
        description="Create a table to run a game as referee, or paste an invite link from your referee to join one."
      />
    );
  }
  return (
    <ul className={styles.tableList}>
      {tables.map((table) => (
        <li key={table.id}>
          <Card interactive padding="none" className={styles.tableCard}>
            <RouterLink to={`/tables/${table.id}`} className={styles.tableLink}>
              <span className={styles.tableIcon}>
                <Icon name={table.phase === 'playing' ? 'compass' : 'users'} size={20} />
              </span>
              <span className={styles.tableText}>
                <span className={styles.tableName}>{table.name}</span>
                <span className={styles.tableMeta}>
                  {[
                    ...tableStatus(table),
                    table.member_count === 1 ? '1 member' : `${table.member_count} members`,
                  ].map((fact, index, facts) => (
                    // The comma ends the fact before it, because the browser puts a space between flex items.
                    <span key={index}>
                      {fact}
                      {index < facts.length - 1 && <span className="visually-hidden-inline">,</span>}
                    </span>
                  ))}
                </span>
              </span>
              <Badge
                tone={table.role === 'referee' ? 'referee' : 'neutral'}
                icon={table.role === 'referee' ? 'referee' : 'user'}
              >
                {table.role === 'referee' ? 'Referee' : 'Player'}
              </Badge>
              {table.phase === 'playing' &&
                (table.game?.missing === true ? (
                  <Badge tone="danger">Can't load</Badge>
                ) : (
                  <Badge tone="success" icon="play">
                    Playing
                  </Badge>
                ))}
              <Icon name="chevron-right" size={16} className={styles.tableChevron} />
            </RouterLink>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function CreateTable() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [hostKey, setHostKey] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The server says whether creating a table needs the host key, so the field shows before the first attempt.
  useEffect(() => {
    let cancelled = false;
    getApi()
      .health()
      .then(
        (health) => !cancelled && health.host_key_required === true && setNeedsKey(true),
        // A failed health check leaves the form as it is. Creating the table reports the problem.
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Enter a table name.');
      return;
    }
    const invalid = displayStringProblem(trimmed, LIMITS.tableName);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    setKeyError(null);
    try {
      const table = await getApi().createTable({
        name: trimmed,
        ...(needsKey && hostKey.trim() !== '' ? { host_key: hostKey.trim() } : {}),
      });
      navigate(`/tables/${table.id}`);
    } catch (problem) {
      if (isProblem(problem, 'host_key_required')) {
        const hadKey = needsKey && hostKey.trim() !== '';
        setNeedsKey(true);
        setKeyError(
          hadKey
            ? "That host key isn't right. Check it with the server host."
            : 'Enter the host key from the server host to create a table.',
        );
      } else if (isProblem(problem, 'forbidden')) {
        // The server's sentence names the limit and how to make room, so it stands without a generic title.
        setError(problem.problem.detail);
      } else {
        const message = describeProblem(problem);
        setError(`${message.title}. ${message.detail}`);
      }
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className={styles.sideCard}>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <h2 className={styles.cardTitle}>Create a table</h2>
        <p className={styles.cardLead}>
          You become the referee and get an invite link for your players in the lobby.
        </p>
        <Field label="Table name" error={error ?? undefined}>
          <TextInput
            value={name}
            maxLength={LIMITS.tableName}
            placeholder="Thursday at the Drowned Bell"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {needsKey && (
          <Field label="Host key" error={keyError ?? undefined} hint="Ask the server host for this key.">
            <TextInput
              type="password"
              value={hostKey}
              autoComplete="off"
              autoFocus={keyError !== null}
              onChange={(event) => setHostKey(event.target.value)}
            />
          </Field>
        )}
        <Button type="submit" variant="primary" icon="plus" loading={busy}>
          Create table
        </Button>
      </form>
    </Card>
  );
}

function JoinTable() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const code = parseInvite(value);
    if (code === null) {
      setError('Paste the invite link or code from your referee.');
      return;
    }
    navigate(`/join/${encodeURIComponent(code)}`);
  };
  return (
    <Card padding="lg" className={styles.sideCard}>
      <form className={styles.form} onSubmit={submit}>
        <h2 className={styles.cardTitle}>Join a table</h2>
        <Field label="Invite link or code" error={error ?? undefined}>
          <TextInput
            value={value}
            placeholder="Paste an invite link or code"
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Button type="submit" variant="secondary" icon="arrow-right">
          Join table
        </Button>
      </form>
    </Card>
  );
}

function SignedInHome() {
  const user = useIdentity((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const notice = readHomeNotice(location.state);
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .listTables()
      .then(
        (list) => {
          if (cancelled) return;
          setTables(list.items);
          setError(null);
        },
        (problem: unknown) => {
          if (cancelled) return;
          const message = describeProblem(problem);
          setError(`${message.title}. ${message.detail}`);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  return (
    <div className={styles.homeGrid}>
      <section className={styles.tablesSection} aria-labelledby="tables-title">
        <p className={styles.kicker}>Signed in as {user?.name}</p>
        <h1 id="tables-title" className={styles.pageTitle}>
          Your tables
        </h1>
        {notice !== null && (
          <Banner
            tone="info"
            title={notice.title}
            onDismiss={() => navigate(location.pathname, { replace: true, state: null })}
          >
            {notice.detail}
          </Banner>
        )}
        <TableList tables={tables} error={error} onRetry={load} />
      </section>
      <aside className={styles.side} aria-label="Start or join a table">
        <CreateTable />
        <JoinTable />
        <p className={styles.aboutNote}>
          bxvtt is a virtual tabletop for the 1981 B/X rules. Press B at any time to open the rules reference.
        </p>
      </aside>
    </div>
  );
}

/** The home page: first-run name entry, the user's tables, and creating or joining a table. */
export function HomePage() {
  const status = useIdentity((s) => s.status);
  return (
    <PageLayout
      headerActions={
        <>
          {status === 'ready' && <RulesReference away />}
          <ProfileMenu />
        </>
      }
      footer={<SiteInfo />}
    >
      <div className={styles.stack}>
        <HealthBanner />
        {status === 'unknown' && <Skeleton shape="block" height={240} />}
        {status === 'anonymous' && (
          <div className={styles.firstRun}>
            <Intro />
            <Card padding="lg" className={styles.nameCard}>
              <NameForm
                title="Choose your name"
                description="You don't need an account or password. You stay signed in on this browser."
                submitLabel="Continue"
              />
            </Card>
          </div>
        )}
        {status === 'ready' && <SignedInHome />}
      </div>
    </PageLayout>
  );
}
