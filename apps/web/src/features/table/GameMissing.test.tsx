import type { TableDetail } from '@bxvtt/shared/protocol';
import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useIdentity } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { GameMissing } from './GameMissing';

/** Renders the screen for a member of a table whose game is missing, as the table page does. */
async function renderFor(role: 'referee' | 'player', change: (table: TableDetail) => TableDetail = (t) => t) {
  const snapshot = fixtureSnapshot('exploring', role);
  const table = change(snapshot.table);
  useIdentity.setState({ status: 'ready', user: snapshot.user, token: 'bxt_test', notice: null });
  const api = createFakeApi();
  api.getTable.mockResolvedValue(table);
  const result = renderWithTable(<GameMissing tableId={table.id} />, {
    snapshot,
    api,
    data: { ready: false, status: 'closed', closeReason: 'game_missing' },
  });
  await screen.findByRole('heading', { level: 1, name: `The game at ${table.name} can't be loaded` });
  return { ...result, table };
}

describe('the screen for a game that cannot be loaded', () => {
  it('offers a referee Return to lobby and Try again, and ends the game only after the referee confirms', async () => {
    const { api, user, store, table } = await renderFor('referee');
    expect(
      screen.getByText(/Return to the lobby to start a new game or continue from a save/),
    ).toBeInTheDocument();
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(
      names.filter((name) =>
        ['Return to lobby', 'Try again', 'Leave table', 'Delete table'].includes(name ?? ''),
      ),
    ).toEqual(['Return to lobby', 'Try again']);
    const reconnect = vi.fn();
    store.setState({ reconnect });
    api.endGame.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Return to lobby' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Return to lobby?' });
    expect(dialog).toHaveTextContent('keeps every save');
    await user.click(within(dialog).getByRole('button', { name: 'Return to lobby' }));
    expect(api.endGame).toHaveBeenCalledWith(table.id);
    // The lobby needs no game, so the connection opens again.
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('offers a player Try again and Leave table, and no Delete table', async () => {
    const { api, user, table } = await renderFor('player');
    expect(screen.getByText(/Ask the host to check the game service/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete table' })).not.toBeInTheDocument();
    api.leaveTable.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Leave table' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Leave table?' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave table' }));
    expect(api.leaveTable).toHaveBeenCalledWith(table.id);
  });

  it('tries once more, and says so when the game still is missing', async () => {
    const { store, user } = await renderFor('player');
    const reconnect = vi.fn();
    store.setState({ reconnect });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    act(() => store.getState().setStatus('connecting'));
    act(() => store.getState().setStatus('closed', 'game_missing'));
    expect(await screen.findAllByText("The game still can't be loaded.")).not.toHaveLength(0);
  });
});
