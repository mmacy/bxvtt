import type { TableDetail } from '@bxvtt/shared/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLocation } from 'react-router-dom';
import { resetMyCharacters } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { LobbyPage } from './LobbyPage';

/** Shows the router's path, so a test can see where an action went. */
function Where() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function lobbyApi() {
  const api = createFakeApi();
  api.listAdventures.mockResolvedValue({ items: [] });
  api.listCharacters.mockResolvedValue({ items: [] });
  return api;
}

beforeEach(() => resetMyCharacters());

describe('the lobby table menu', () => {
  it('offers a player "Leave table" and no "Delete table"', async () => {
    const { user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'player'),
      api: lobbyApi(),
    });
    await user.click(screen.getByRole('button', { name: 'Table menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Leave table' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete table' })).not.toBeInTheDocument();
  });

  it('deletes the table only after the referee confirms, and goes to the table list', async () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const { api, user } = renderWithTable(
      <>
        <LobbyPage />
        <Where />
      </>,
      { snapshot, api: lobbyApi() },
    );
    api.deleteTable.mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: 'Table menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete table' }));
    let dialog = screen.getByRole('alertdialog', { name: 'Delete table?' });
    expect(dialog).toHaveTextContent(`This deletes ${snapshot.table.name} for everyone`);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteTable).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Table menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete table' }));
    dialog = screen.getByRole('alertdialog', { name: 'Delete table?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete table' }));
    expect(api.deleteTable).toHaveBeenCalledWith(snapshot.table.id);
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/));
  });

  it("tells the only referee to make another referee first, and doesn't try to leave", async () => {
    const { api, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'referee'),
      api: lobbyApi(),
    });
    await user.click(screen.getByRole('button', { name: 'Table menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Leave table' }));
    const dialog = screen.getByRole('dialog', { name: 'Make another referee before you leave' });
    expect(within(dialog).queryByRole('button', { name: /^Leave/ })).not.toBeInTheDocument();
    // The dialog offers deleting the table instead.
    await user.click(within(dialog).getByRole('button', { name: 'Delete table' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete table?' })).toBeInTheDocument();
    expect(api.leaveTable).not.toHaveBeenCalled();
  });

  it('says that the last member leaving deletes the table', async () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const alone: TableDetail = {
      ...snapshot.table,
      members: snapshot.table.members.filter((m) => m.user_id === snapshot.user.id),
    };
    const { api, user } = renderWithTable(<LobbyPage />, {
      snapshot: { ...snapshot, table: alone },
      api: lobbyApi(),
    });
    api.leaveTable.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Table menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Leave table' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Leave and delete table?' });
    expect(dialog).toHaveTextContent("You're the last member, so leaving also deletes");
    await user.click(within(dialog).getByRole('button', { name: 'Leave and delete table' }));
    expect(api.leaveTable).toHaveBeenCalledWith(snapshot.table.id);
  });

  it("doesn't mention deleting when a player leaves a table with others at it", async () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    const { api, user } = renderWithTable(
      <>
        <LobbyPage />
        <Where />
      </>,
      { snapshot, api: lobbyApi() },
    );
    api.leaveTable.mockRejectedValue(new TypeError('offline'));
    await user.click(screen.getByRole('button', { name: 'Table menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Leave table' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Leave table?' });
    expect(dialog).not.toHaveTextContent(/delete/i);
    await user.click(within(dialog).getByRole('button', { name: 'Leave table' }));
    expect(api.leaveTable).toHaveBeenCalledWith(snapshot.table.id);
    // A failed leave keeps the user at the table.
    expect(await screen.findByText("Couldn't leave the table")).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent(`/tables/${snapshot.table.id}`);
  });
});
