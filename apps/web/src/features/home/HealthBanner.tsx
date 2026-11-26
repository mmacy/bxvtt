import type { Health } from '@bxvtt/shared/protocol';
import { useEffect, useState } from 'react';
import { getApi } from '@/app';
import { Banner, Button } from '@/ui';

type HealthState =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'no-bxapi' }
  | { kind: 'no-server' }
  /** bxapi answers, but the server can't run games with it. `detail` is the banner's body. */
  | { kind: 'misconfigured'; outdated: boolean; detail: string };

/** What an anonymous reader learns about a game service that is out of date, without its versions. */
const OUTDATED_PUBLIC = "Games can't run until it's updated. Ask the server host to update the game service.";

/**
 * What the health says. A signed-in user's health has `meta` and the server's sentence for the cause, which names
 * the versions for an engine that is out of date. An anonymous reader's health has no `meta` and a general
 * sentence, so an out-of-date service reads in the banner's own words.
 */
export function classify(health: Health): HealthState {
  const { reachable, outdated, meta, error } = health.bxapi;
  if (!reachable) return { kind: 'no-bxapi' };
  if (error === null && !outdated) return { kind: 'ok' };
  const detail = outdated && meta === null ? OUTDATED_PUBLIC : (error ?? OUTDATED_PUBLIC);
  return { kind: 'misconfigured', outdated, detail };
}

/**
 * Checks the server's health when the page loads, and explains what is wrong when the server is down, bxapi is
 * down, or bxapi can't run games. It shows nothing while everything works.
 */
export function HealthBanner() {
  const [state, setState] = useState<HealthState>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .health()
      .then(
        (health) => !cancelled && setState(classify(health)),
        // The health route answers 503 with a body when bxapi is down, which the client throws as a problem.
        (error: unknown) => {
          if (cancelled) return;
          const unreachable = error instanceof TypeError || error instanceof SyntaxError;
          setState(unreachable ? { kind: 'no-server' } : { kind: 'no-bxapi' });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = (
    <Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>
      Check again
    </Button>
  );

  if (state.kind === 'no-bxapi') {
    return (
      <Banner tone="danger" title="The game service isn't running" actions={retry}>
        The server is running, but it can&apos;t reach the game service. Ask the server host to start the game
        service, then check again.
      </Banner>
    );
  }
  if (state.kind === 'misconfigured') {
    return (
      <Banner
        tone="danger"
        title={state.outdated ? 'The game service is out of date' : "Games can't run on this server"}
        actions={retry}
      >
        {state.detail}
      </Banner>
    );
  }
  if (state.kind === 'no-server') {
    return (
      <Banner tone="danger" title="Can't reach the bxvtt server" actions={retry}>
        Check your connection, or ask the server host whether the server is running.
      </Banner>
    );
  }
  return null;
}
