import { LIMITS, type TableSummary } from '@bxvtt/shared/protocol';
import { isProblem } from '@bxvtt/shared/client';
import { sessionModeLabel } from '@bxvtt/shared/text';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { describeProblem, displayStringProblem, getApi, useIdentity } from '@/app';
import { Badge, Banner, Button, Card, EmptyState, Field, Icon, PageLayout, Skeleton, TextInput } from '@/ui';
import { HealthBanner } from './HealthBanner';
import { NameForm } from './NameForm';
import { ProfileMenu } from './ProfileMenu';
import { RulesReference } from './RulesReference';
import styles from './home.module.css';

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
        Play the 1981 Basic and Expert rules together, each in your own browser.
      </h1>
      <p className={styles.introLead}>
        A referee runs the adventure and the players run their characters. The bxapi rules engine rolls every
        die and applies every rule, so the table can spend its evening exploring, talking, and fighting.
      </p>
      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNumber}>1</span>
          Pick the name the table sees.
        </li>
        <li>
          <span className={styles.stepNumber}>2</span>
          Create a table as its referee, or open the invite link your referee sent you.
        </li>
        <li>
          <span className={styles.stepNumber}>3</span>
          Bring characters to the lobby, and the referee starts the game.
        </li>
      </ol>
    </section>
  );
}

/** What a table is doing, as separate facts: where it is, and in a game, the adventure and the mode. */
function tableStatus(table: TableSummary): string[] {
  if (table.game === null || table.phase === 'lobby') return ['In the lobby'];
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
        description="Create a table to run a game as its referee, or join one with the invite link your referee sent you."
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
                  ].map((fact, index) => (
                    <span key={index}>
                      {index > 0 && <span className="visually-hidden">, </span>}
                      {fact}
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
              {table.phase === 'playing' && (
                <Badge tone="success" icon="play">
                  Playing
                </Badge>
              )}
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
      setError('Give the table a name, such as the night you play.');
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
            ? "That host key isn't right. Check it with the person who runs this server."
            : 'This server needs a host key to create a table. Enter the key that the person who runs it gave you.',
        );
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
        <p className={styles.cardLead}>You'll be its referee. Invite players with a link from the lobby.</p>
        <Field label="Table name" error={error ?? undefined}>
          <TextInput
            value={name}
            maxLength={LIMITS.tableName}
            placeholder="Such as Thursday at the Drowned Bell"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {needsKey && (
          <Field label="Host key" error={keyError ?? undefined} hint="Only the host of this server has it.">
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
      setError('Paste the invite link or code your referee sent you.');
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
            placeholder="Paste the link from your referee"
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Button type="submit" variant="secondary" icon="arrow-right">
          Join
        </Button>
      </form>
    </Card>
  );
}

function SignedInHome() {
  const user = useIdentity((s) => s.user);
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
        <TableList tables={tables} error={error} onRetry={load} />
      </section>
      <aside className={styles.side} aria-label="Start or join a table">
        <CreateTable />
        <JoinTable />
        <p className={styles.aboutNote}>
          bxvtt is a virtual tabletop for the 1981 B/X rules. The referee and the players each play in their
          own browser, and the bxapi rules engine rolls every die.
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
    >
      <div className={styles.stack}>
        <HealthBanner />
        {status === 'unknown' && <Skeleton shape="block" height={240} />}
        {status === 'anonymous' && (
          <div className={styles.firstRun}>
            <Intro />
            <Card padding="lg" className={styles.nameCard}>
              <NameForm
                title="Pick your name"
                description="No account or password. The name lives in this browser."
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
