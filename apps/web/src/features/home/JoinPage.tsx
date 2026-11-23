import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import type { RejoinLookup } from '@bxvtt/shared/protocol';
import { describeProblem, getApi, isRetiredToken, useIdentity, type ProblemMessage } from '@/app';
import { Banner, Button, Card, PageLayout, Spinner } from '@/ui';
import { NameForm } from './NameForm';
import { ProfileMenu } from './ProfileMenu';
import { Rejoin } from './Rejoin';
import styles from './home.module.css';

/**
 * `/join/:code`: joins the table the invite link names and opens it. A visitor without a name picks one first,
 * or, when the table has members who are offline, can come back in as the member they were.
 */
export function JoinPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const status = useIdentity((s) => s.status);
  const token = useIdentity((s) => s.token);
  const forget = useIdentity((s) => s.forget);
  const [problem, setProblem] = useState<ProblemMessage | null>(null);
  const attempted = useRef<string | null>(null);
  const [lookup, setLookup] = useState<RejoinLookup | null>(null);
  const [rejoining, setRejoining] = useState(false);

  // A visitor with no name may be a returning player whose browser lost its sign-in.
  useEffect(() => {
    if (status !== 'anonymous') return;
    let cancelled = false;
    getApi()
      .lookupRejoin(code)
      .then(
        (found) => !cancelled && setLookup(found),
        // Without the lookup, the page offers the "new here" path alone. Joining reports a bad code.
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [status, code]);
  const returning = lookup !== null && lookup.members.length > 0;

  useEffect(() => {
    if (status !== 'ready' || token === null) return;
    const key = `${token}:${code}`;
    if (attempted.current === key) return;
    attempted.current = key;
    getApi()
      .joinTable(code)
      .then(
        (table) => navigate(`/tables/${table.id}`, { replace: true }),
        (error: unknown) => {
          // A referee let this user back in from another browser. The name form explains that, and offers to
          // come back in here.
          if (isRetiredToken(error)) forget('retired');
          else setProblem(describeProblem(error));
        },
      );
  }, [status, token, code, navigate, forget]);

  return (
    <PageLayout width="narrow" headerActions={<ProfileMenu />}>
      <div className={styles.joinWrap}>
        {status === 'anonymous' && !rejoining && (
          <Card padding="lg">
            <NameForm
              title={returning ? "I'm new here" : "You're invited to a table"}
              description="Choose a display name to join the table."
              submitLabel="Join table"
              onInvitePage
            />
          </Card>
        )}
        {status === 'anonymous' && returning && (
          <Rejoin inviteCode={code} members={lookup.members} onActiveChange={setRejoining} />
        )}
        {status === 'anonymous' && (
          <p className={styles.aboutNote}>
            bxvtt is a virtual tabletop for the 1981 B/X rules. Your referee runs the adventure while you play
            your characters in this browser, with no account required.
          </p>
        )}
        {status !== 'anonymous' && problem === null && (
          <div className={styles.joining} role="status">
            <Spinner size={32} label="" />
            <p>Joining table</p>
          </div>
        )}
        {problem !== null && (
          <Banner
            tone="warning"
            title={problem.title}
            actions={
              <Button asChild size="sm" variant="secondary">
                <RouterLink to="/">Go to your tables</RouterLink>
              </Button>
            }
          >
            {problem.detail}
          </Banner>
        )}
      </div>
    </PageLayout>
  );
}
