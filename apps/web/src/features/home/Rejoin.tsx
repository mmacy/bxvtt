import type { RejoinCandidate, RejoinTicket } from '@bxvtt/shared/protocol';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  cancelRejoin,
  cancelRejoinOnLeave,
  describeProblem,
  getApi,
  isTransientFailure,
  useIdentity,
} from '@/app';
import { Avatar, Banner, Button, Card, Spinner } from '@/ui';
import styles from './home.module.css';

/**
 * How often the page asks whether a referee has answered, in milliseconds. Each poll also tells the server the
 * visitor is still here: it ends a request nobody polls for 20 seconds. The server allows 120 polls a minute.
 */
export const REJOIN_POLL_MS = 3000;
/** The longest pause between polls after failures, in milliseconds. It stays under the server's 20 seconds. */
export const REJOIN_MAX_BACKOFF_MS = 10_000;
/** How many polls in a row must fail before the page says the connection hiccuped. */
export const REJOIN_HICCUP_AFTER = 3;
/** How long after the request's end the page keeps trying through failures, in milliseconds, for clock drift. */
const EXPIRY_GRACE_MS = 30_000;

type Step =
  | { kind: 'choose' }
  | { kind: 'asking'; member: RejoinCandidate }
  | { kind: 'waiting'; member: RejoinCandidate; ticket: RejoinTicket }
  | { kind: 'stopping'; member: RejoinCandidate }
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
        detail: 'Open the table in the browser that came back in, or ask again here.',
      };
  }
}

/** What the page says when the server ended the request because the page didn't check in for a while. */
const AWAY_TEXT = {
  title: 'Your request ended while this page was away',
  detail:
    "This page couldn't check in for a while, such as while the computer slept, so the request ended. Ask again.",
};
/** How long without a successful poll before a `cancelled` answer most likely means the server gave up on the page. */
const AWAY_AFTER_MS = 18_000;

/** What the page says when the browser left the page while waiting and then came back to it. */
const LEFT_TEXT = {
  title: 'Your request ended when you left this page',
  detail: 'Ask again, and keep this page open while you wait.',
};

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
 *
 * A request ends on the server whenever the page stops waiting: "Stop waiting" cancels it, and so do leaving the
 * page and closing the tab, so the referee never lets in somebody who has gone.
 */
export function Rejoin({ inviteCode, members, onActiveChange }: RejoinProps) {
  const navigate = useNavigate();
  const adopt = useIdentity((s) => s.adopt);
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [hiccup, setHiccup] = useState(false);
  // The request that waits on the server now, for the page to cancel when it stops waiting.
  const live = useRef<RejoinTicket | null>(null);
  // Counts the visitor's asks, so an answer that arrives after "Stop waiting" is cancelled instead of shown.
  const attempt = useRef(0);
  const activeRef = useRef(onActiveChange);
  useEffect(() => {
    activeRef.current = onActiveChange;
  });
  const active = step.kind === 'asking' || step.kind === 'waiting' || step.kind === 'stopping';
  useEffect(() => {
    activeRef.current?.(active);
  }, [active]);

  // Leaving the page cancels the request. A page the browser kept and shows again starts over.
  useEffect(() => {
    let leftWhileWaiting = false;
    const onHide = () => {
      const ticket = live.current;
      if (ticket === null) return;
      live.current = null;
      leftWhileWaiting = true;
      cancelRejoinOnLeave(ticket.request_id, ticket.secret);
    };
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !leftWhileWaiting) return;
      leftWhileWaiting = false;
      attempt.current += 1;
      setStep({ kind: 'ended', ...LEFT_TEXT });
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      attempt.current += 1;
      const ticket = live.current;
      live.current = null;
      if (ticket !== null) void cancelRejoin(ticket.request_id, ticket.secret).catch(() => undefined);
    };
  }, []);

  // Poll while a referee decides. A failure that may pass (a dropped connection, a restarting server) keeps the
  // page waiting and asks again after a longer pause. Only the server's answer or the request's end stops it.
  const waitingTicket = step.kind === 'waiting' ? step.ticket : null;
  const waitingMember = step.kind === 'waiting' ? step.member : null;
  useEffect(() => {
    if (waitingTicket === null || waitingMember === null) return;
    const ticket = waitingTicket;
    const expiresAt = Date.parse(ticket.expires_at);
    let stopped = false;
    let failures = 0;
    let lastContact = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = (next: Step) => {
      live.current = null;
      setStep(next);
    };
    const poll = async () => {
      try {
        const status = await getApi().rejoinStatus(ticket.request_id, ticket.secret);
        if (stopped) return;
        const away = Date.now() - lastContact > AWAY_AFTER_MS;
        lastContact = Date.now();
        failures = 0;
        setHiccup(false);
        if (status.status === 'approved' && status.token !== null && status.user !== null) {
          live.current = null;
          adopt(status.token, status.user);
          navigate(`/tables/${status.table_id}`, { replace: true });
          return;
        }
        if (status.status === 'pending') {
          timer = setTimeout(() => void poll(), REJOIN_POLL_MS);
          return;
        }
        if (status.status === 'cancelled' && away) end({ kind: 'ended', ...AWAY_TEXT });
        else end({ kind: 'ended', ...endedText(status.status, waitingMember.name) });
      } catch (error) {
        if (stopped) return;
        if (!isTransientFailure(error)) {
          const message = describeProblem(error);
          end({ kind: 'ended', title: message.title, detail: message.detail });
          return;
        }
        if (Date.now() > expiresAt + EXPIRY_GRACE_MS) {
          end({ kind: 'ended', ...endedText('expired', waitingMember.name) });
          return;
        }
        failures += 1;
        if (failures >= REJOIN_HICCUP_AFTER) setHiccup(true);
        timer = setTimeout(
          () => void poll(),
          Math.min(REJOIN_POLL_MS * 2 ** failures, REJOIN_MAX_BACKOFF_MS),
        );
      }
    };
    timer = setTimeout(() => void poll(), REJOIN_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waitingTicket, waitingMember, adopt, navigate]);

  const ask = async (member: RejoinCandidate) => {
    attempt.current += 1;
    const mine = attempt.current;
    setStep({ kind: 'asking', member });
    try {
      const ticket = await getApi().requestRejoin(inviteCode, member.user_id);
      if (attempt.current !== mine) {
        // The visitor stopped waiting, or left, before the server answered.
        void cancelRejoin(ticket.request_id, ticket.secret).catch(() => undefined);
        return;
      }
      live.current = ticket;
      setHiccup(false);
      setStep({ kind: 'waiting', member, ticket });
    } catch (error) {
      if (attempt.current !== mine) return;
      const message = describeProblem(error);
      setStep({ kind: 'ended', title: message.title, detail: message.detail });
    }
  };

  // "Stop waiting" ends the request on the server first, so the referee's prompt drops it, and then resets.
  const stop = async (member: RejoinCandidate) => {
    attempt.current += 1;
    const ticket = live.current;
    live.current = null;
    if (ticket !== null) {
      setStep({ kind: 'stopping', member });
      // A request the server can't cancel has ended already, or ends when nobody polls it.
      await cancelRejoin(ticket.request_id, ticket.secret).catch(() => undefined);
    }
    setStep({ kind: 'choose' });
  };

  if (step.kind === 'waiting' || step.kind === 'asking' || step.kind === 'stopping') {
    const ticket = step.kind === 'waiting' ? step.ticket : null;
    const { member } = step;
    return (
      <Card padding="lg">
        <section className={styles.rejoin} aria-labelledby="rejoin-waiting" aria-live="polite">
          <h2 id="rejoin-waiting" className={styles.cardTitle}>
            Waiting for a referee to let you in as {member.name}
          </h2>
          <div className={styles.rejoinWait}>
            <Spinner size={20} label="" />
            <p className={styles.cardLead}>
              {step.kind === 'stopping'
                ? 'Ending your request.'
                : ticket === null
                  ? 'Sending your request.'
                  : ticket.approvers_online > 0
                    ? `A referee is at the table now and sees your request. Tell them it's you, by voice or chat, so they know to let you in.`
                    : 'No referee is at the table right now. A referee sees your request as soon as they open the table.'}
            </p>
          </div>
          {ticket !== null && hiccup && (
            <p className={styles.rejoinNote}>
              Still waiting. The connection hiccuped, so this page keeps trying.
            </p>
          )}
          {ticket !== null && (
            <p className={styles.rejoinNote}>
              Your request lasts until {clockTime(ticket.expires_at)}. Keep this page open.
            </p>
          )}
          <Button variant="ghost" loading={step.kind === 'stopping'} onClick={() => void stop(member)}>
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
          If this browser doesn't remember you, pick your name, and a referee at the table lets you back in.
          Your characters and your place at the table come with you.
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
