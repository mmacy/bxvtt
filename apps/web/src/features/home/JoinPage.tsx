import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { describeProblem, getApi, useIdentity, type ProblemMessage } from '@/app';
import { Banner, Button, Card, PageLayout, Spinner } from '@/ui';
import { NameForm } from './NameForm';
import { ProfileMenu } from './ProfileMenu';
import styles from './home.module.css';

/**
 * `/join/:code`: joins the table the invite link names and opens it. A visitor without a name picks one first.
 */
export function JoinPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const status = useIdentity((s) => s.status);
  const token = useIdentity((s) => s.token);
  const [problem, setProblem] = useState<ProblemMessage | null>(null);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'ready' || token === null) return;
    const key = `${token}:${code}`;
    if (attempted.current === key) return;
    attempted.current = key;
    getApi()
      .joinTable(code)
      .then(
        (table) => navigate(`/tables/${table.id}`, { replace: true }),
        (error: unknown) => setProblem(describeProblem(error)),
      );
  }, [status, token, code, navigate]);

  return (
    <PageLayout width="narrow" headerActions={<ProfileMenu />}>
      <div className={styles.joinWrap}>
        {status === 'anonymous' && (
          <Card padding="lg">
            <NameForm
              title="You're invited to a table"
              description="Pick the name the table sees, and you'll go straight to its lobby."
              submitLabel="Join the table"
            />
          </Card>
        )}
        {status === 'anonymous' && (
          <p className={styles.aboutNote}>
            bxvtt is a virtual tabletop for the 1981 B/X rules. Your referee runs the adventure, you play your
            characters in this browser, and the bxapi rules engine rolls every die. You don't need an account.
          </p>
        )}
        {status !== 'anonymous' && problem === null && (
          <div className={styles.joining} role="status">
            <Spinner size={32} label="" />
            <p>Joining the table</p>
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
