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
    <section className={styles.rejoin} aria-label="Requests to come back in">
      <Banner
        tone="info"
        icon="users"
        title={
          self
            ? 'Someone is asking to come back in as you'
            : `Someone is asking to come back in as ${first.name}`
        }
        actions={
          self ? undefined : (
            <>
              <Button size="sm" variant="primary" loading={pending} onClick={() => void approve(first.id)}>
                Let them in
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => void decline(first.id)}>
                Not now
              </Button>
            </>
          )
        }
      >
        {self
          ? `A referee can't let themselves in, so another referee has to answer. The request ends by itself at ${until}.`
          : `Their browser doesn't remember them, so they need a referee to let them in. Let them in only if you know it's ${first.name}, such as by voice or chat. The request ends at ${until}.`}
        {others.length > 0 && (
          <span className={styles.rejoinMore}>
            {others.length === 1
              ? ' One more request is waiting.'
              : ` ${others.length} more requests are waiting.`}
          </span>
        )}
      </Banner>
    </section>
  );
}
