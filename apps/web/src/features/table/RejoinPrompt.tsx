import { useDecideRejoin, useRejoinRequests, useTableUser } from '@/app';
import { Banner, Button } from '@/ui';
import styles from './table.module.css';

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * The referee's prompt when a player asks to come back in as the member they were, because the table's address
 * changed and their browser lost its sign-in. It stays until a referee answers or the request ends, shows the
 * oldest request first with a count of the others, and reminds the referee to let in only someone they recognize.
 * A referee can't answer a request to come back in as themselves, so that case says why and offers no buttons.
 * The lobby and the play screen render it. Players never see it, because the server sends requests to referees
 * alone.
 */
export function RejoinPrompt() {
  const requests = useRejoinRequests();
  const me = useTableUser();
  const { approve, decline, pending } = useDecideRejoin();
  const [first, ...others] = requests;
  if (first === undefined) return null;
  const self = first.user_id === me?.id;
  const until = clockTime(first.expires_at);
  return (
    <section className={styles.rejoin} aria-label="Rejoin requests">
      <Banner
        tone="info"
        icon="users"
        title={self ? 'Someone asked to rejoin as you' : `Someone asked to rejoin as ${first.name}`}
        actions={
          self ? undefined : (
            <>
              <Button size="sm" variant="primary" loading={pending} onClick={() => void approve(first.id)}>
                Approve
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => void decline(first.id)}>
                Decline
              </Button>
            </>
          )
        }
      >
        {self
          ? `You can't approve your own rejoin request, so another referee must approve it. This request expires at ${until}.`
          : `Approve this rejoin request only if you confirm by voice or chat that it's really ${first.name}. This request expires at ${until}.`}
        {others.length > 0 && (
          <span className={styles.rejoinMore}>
            {others.length === 1
              ? ' 1 more rejoin request is waiting.'
              : ` ${others.length} more rejoin requests are waiting.`}
          </span>
        )}
      </Banner>
    </section>
  );
}
