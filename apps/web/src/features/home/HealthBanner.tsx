import type { Health } from '@bxvtt/shared/protocol';
import { useEffect, useState } from 'react';
import { getApi } from '@/app';
import { Banner, Button } from '@/ui';

type HealthState = { kind: 'checking' } | { kind: 'ok' } | { kind: 'no-bxapi' } | { kind: 'no-server' };

function classify(health: Health): HealthState {
  return health.bxapi.reachable ? { kind: 'ok' } : { kind: 'no-bxapi' };
}

/**
 * Checks the server's health when the page loads, and explains what is wrong when the server or bxapi is down.
 * It shows nothing while everything works.
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
      <Banner tone="danger" title="The rules engine isn't running" actions={retry}>
        The bxvtt server is up, but it can't reach bxapi, which applies the rules and stores every game. Ask
        the person who runs this server to start bxapi. Tables and games open again once it answers.
      </Banner>
    );
  }
  if (state.kind === 'no-server') {
    return (
      <Banner tone="danger" title="Can't reach the bxvtt server" actions={retry}>
        Check your connection. If you run the server yourself, start it and check again.
      </Banner>
    );
  }
  return null;
}
