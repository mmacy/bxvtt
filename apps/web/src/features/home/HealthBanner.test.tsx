import { BxvttProblemError } from '@bxvtt/shared/client';
import type { Health } from '@bxvtt/shared/protocol';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setApi } from '@/app';
import { createFakeApi } from '@/app/testing/renderWithTable';
import { KitProvider } from '@/ui';
import { HealthBanner } from './HealthBanner';

const META: NonNullable<Health['bxapi']['meta']> = {
  api_version: '1',
  engine_version: '2.7.0',
  schema_version: 1,
  auth_enabled: true,
  role: 'referee',
  storage: { used_bytes: 0, max_bytes: null },
};

function health(bxapi: Health['bxapi']): Health {
  return { status: bxapi.error === null ? 'ok' : 'degraded', version: '0.2.0', uptime_seconds: 1, bxapi };
}

function renderWith(answer: Health | Error) {
  const api = createFakeApi();
  if (answer instanceof Error) api.health.mockRejectedValue(answer);
  else api.health.mockResolvedValue(answer);
  setApi(api);
  render(
    <KitProvider>
      <HealthBanner />
    </KitProvider>,
  );
}

describe('HealthBanner', () => {
  it('shows nothing while everything works', async () => {
    renderWith(
      health({ reachable: true, outdated: false, meta: { ...META, engine_version: '2.8.0' }, error: null }),
    );
    await Promise.resolve();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/game service/)).toBeNull();
  });

  it('tells a signed-in user that the game service is out of date, in the server’s words', async () => {
    const detail =
      'bxapi runs osrlib 2.7.0, and bxvtt needs 2.8.0 or later. If you host this server, update bxapi and restart it. Otherwise, ask the server host to update it.';
    renderWith(health({ reachable: true, outdated: true, meta: META, error: detail }));
    expect(await screen.findByText('The game service is out of date')).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
  });

  it('tells an anonymous reader that the game service is out of date, without its versions', async () => {
    renderWith(
      health({
        reachable: true,
        outdated: true,
        meta: null,
        error: "The game service isn't set up correctly. Ask the server host to fix it.",
      }),
    );
    expect(await screen.findByText('The game service is out of date')).toBeInTheDocument();
    expect(
      screen.getByText("Games can't run until it's updated. Ask the server host to update the game service."),
    ).toBeInTheDocument();
  });

  it('tells an anonymous reader that games can’t run for another cause, with the server’s general sentence', async () => {
    const detail = "The game service isn't set up correctly. Ask the server host to fix it.";
    renderWith(health({ reachable: true, outdated: false, meta: null, error: detail }));
    expect(await screen.findByText("Games can't run on this server")).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
  });

  it('gives a signed-in user another cause of a reachable bxapi under the general title', async () => {
    const detail = 'The bxapi key has the player role. bxvtt needs a referee key.';
    renderWith(
      health({ reachable: true, outdated: false, meta: { ...META, role: 'player' }, error: detail }),
    );
    expect(await screen.findByText("Games can't run on this server")).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
  });

  it('reads out of date from the flag alone, never from the key’s role', async () => {
    const detail = 'Something else is wrong with the game service.';
    renderWith(health({ reachable: true, outdated: false, meta: META, error: detail }));
    expect(await screen.findByText("Games can't run on this server")).toBeInTheDocument();
    expect(screen.queryByText('The game service is out of date')).toBeNull();
    expect(screen.getByText(detail)).toBeInTheDocument();
  });

  it('says the game service isn’t running when bxapi is unreachable', async () => {
    renderWith(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        code: 'bxapi_unavailable',
        detail: 'Down.',
      }),
    );
    expect(await screen.findByText("The game service isn't running")).toBeInTheDocument();
  });
});
