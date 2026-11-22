import type { RejoinCandidate, RejoinTicket } from '@bxvtt/shared/protocol';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeProblem, getApi, useIdentity } from '@/app';
import { Avatar, Banner, Button, Card, Spinner } from '@/ui';
import styles from './home.module.css';

/** How often the page asks whether a referee has answered, in milliseconds. The server allows 120 polls a minute. */
export const REJOIN_POLL_MS = 3000;

type Step =
  | { kind: 'choose' }
  | { kind: 'asking'; member: RejoinCandidate }
  | { kind: 'waiting'; member: RejoinCandidate; ticket: RejoinTicket }
  | { kind: 'ended'; title: string; detail: string };

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Why a request ended, in words for the player, with what to do next. */
function endedText(status: string, name: string): { title: string; detail: string } {
  switch (status) {
    case 'declined':
      return {
        title: `The referee didn't let you in as ${name}`,
        detail: 'If that was a mistake, ask the referee, and then ask again. Or join as someone new.',
      };
    case 'expired':
      return {
        title: 'Nobody answered in time',
        detail: 'A request lasts five minutes. Ask again when a referee is at the table.',
      };
    case 'cancelled':
      return {
        title: `${name} is back at the table, or has left it`,
        detail: 'So the request ended. If you are that member in another browser, play on there.',
      };
    default:
      return {
        title: 'This request was already used',
        detail: 'Open the table from the browser that signed in, or ask again here.',
      };
  }
}

export interface RejoinProps {
  /** The invite code from the link. */
  inviteCode: string;
  /** The members who are offline now, from `lookupRejoin`. */
  members: RejoinCandidate[];
  /** Called when the visitor starts or stops a request, so the page can hide the "new here" path meanwhile. */
  onActiveChange?: (active: boolean) => void;
}

/**
 * "I've played at this table before": a returning player picks the member they were, waits while a referee lets
 * them in, and lands on the table as that member. The table's address changes when the host starts a new tunnel,
 * and the browser keeps a sign-in for one address, so a returning player arrives as a stranger.
 */
export function Rejoin({ inviteCode, members, onActiveChange }: RejoinProps) {
  const navigate = useNavigate();
  const adopt = useIdentity((s) => s.adopt);
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const activeRef = useRef(onActiveChange);
  useEffect(() => {
    activeRef.current = onActiveChange;
  });
  useEffect(() => {
    activeRef.current?.(step.kind === 'asking' || step.kind === 'waiting');
  }, [step.kind]);

  // Poll while a referee decides.
  useEffect(() => {
    if (step.kind !== 'waiting') return;
    const { ticket, member } = step;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await getApi().rejoinStatus(ticket.request_id, ticket.secret);
        if (cancelled) return;
        if (status.status === 'approved' && status.token !== null && status.user !== null) {
          adopt(status.token, status.user);
          navigate(`/tables/${status.table_id}`, { replace: true });
          return;
        }
        if (status.status !== 'pending') setStep({ kind: 'ended', ...endedText(status.status, member.name) });
      } catch (error) {
        if (cancelled) return;
        const message = describeProblem(error);
        setStep({ kind: 'ended', title: message.title, detail: message.detail });
      }
    };
    const timer = setInterval(() => void poll(), REJOIN_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, adopt, navigate]);

  const ask = async (member: RejoinCandidate) => {
    setStep({ kind: 'asking', member });
    try {
      const ticket = await getApi().requestRejoin(inviteCode, member.user_id);
      setStep({ kind: 'waiting', member, ticket });
    } catch (error) {
      const message = describeProblem(error);
      setStep({ kind: 'ended', title: message.title, detail: message.detail });
    }
  };

  if (step.kind === 'waiting' || step.kind === 'asking') {
    const ticket = step.kind === 'waiting' ? step.ticket : null;
    return (
      <Card padding="lg">
        <section className={styles.rejoin} aria-labelledby="rejoin-waiting" aria-live="polite">
          <h2 id="rejoin-waiting" className={styles.cardTitle}>
            Waiting for a referee to let you in as {step.member.name}
          </h2>
          <div className={styles.rejoinWait}>
            <Spinner size={20} label="" />
            <p className={styles.cardLead}>
              {ticket === null
                ? 'Sending your request.'
                : ticket.approvers_online > 0
                  ? 'A referee is at the table now and sees your request. Tell them it is you, by voice or chat.'
                  : 'No referee is at the table right now. A referee sees your request as soon as they open the table.'}
            </p>
          </div>
          {ticket !== null && (
            <p className={styles.rejoinNote}>
              Your request lasts until {clockTime(ticket.expires_at)}. Keep this page open.
            </p>
          )}
          <Button variant="ghost" onClick={() => setStep({ kind: 'choose' })}>
            Stop waiting
          </Button>
        </section>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <section className={styles.rejoin} aria-labelledby="rejoin-title">
        <h2 id="rejoin-title" className={styles.cardTitle}>
          I've played at this table before
        </h2>
        <p className={styles.cardLead}>
          The table's address changed since you last played, so this browser doesn't remember you. Pick your
          name, and a referee at the table lets you back in. Your characters and your place at the table come
          with you.
        </p>
        {step.kind === 'ended' && (
          <Banner tone="warning" title={step.title}>
            {step.detail}
          </Banner>
        )}
        <ul className={styles.rejoinList} aria-label="Members who can come back in">
          {members.map((member) => (
            <li key={member.user_id}>
              <Button variant="secondary" block onClick={() => void ask(member)}>
                <span className={styles.rejoinMember}>
                  <Avatar name={member.name} color={member.color} size="xs" decorative />
                  <span className="visually-hidden">Come back in as</span> {member.name}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}
