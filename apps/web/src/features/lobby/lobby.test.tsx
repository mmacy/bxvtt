import type { AdventureListing, TableDetail } from '@bxvtt/shared/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMyCharacters } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { LobbyPage } from './LobbyPage';
import { moveItem } from './RosterPanel';
import { startChecks } from './StartGamePanel';

const bell: AdventureListing = {
  id: 'sample:the-drowned-bell',
  source: 'sample',
  uploaded_by: null,
  uploaded_at: null,
  info: {
    name: 'The Drowned Bell',
    description: 'A bell tolls under the Grey Mere.',
    hooks: ["Bring back the bell's tongue."],
    party: { min_level: 1, max_level: 1, min_size: 3, max_size: 6 },
    town: { id: 'hollin', name: 'Hollin Ferry', description: '', services: [] },
    dungeons: [],
    id: null,
    builtin: false,
    created_at: null,
  } as AdventureListing['info'],
};

beforeEach(() => resetMyCharacters());

describe('moveItem', () => {
  it('moves one entry and keeps the rest in order', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 5)).toEqual(['a', 'b', 'c']);
  });
});

describe('startChecks', () => {
  it('keeps the start off without a party or an adventure', () => {
    const table: TableDetail = { ...fixtureSnapshot('lobby', 'referee').table, roster: [] };
    expect(startChecks(table, null).blockers).toEqual([
      'Add at least one character to the party.',
      'Choose an adventure.',
    ]);
  });

  it("warns when the party is outside the adventure's recommendation", () => {
    const table = fixtureSnapshot('lobby', 'referee').table;
    const small = { ...table, roster: table.roster.slice(0, 2) };
    const { blockers, warnings } = startChecks(small, bell);
    expect(blockers).toEqual([]);
    expect(warnings[0]).toBe('The Drowned Bell is written for at least 3 characters, but the party has 2.');
  });
});

describe('LobbyPage', () => {
  it('lets the referee reorder the marching order with the keyboard buttons', async () => {
    const { api, store, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'referee'),
    });
    api.listAdventures.mockResolvedValue({ items: [bell] });
    api.listCharacters.mockResolvedValue({ items: [] });
    const table = store.getState().table as TableDetail;
    const ids = table.roster.map((entry) => entry.id);
    const reordered = moveItem(ids, 1, 0);
    api.reorderRoster.mockResolvedValue({
      ...table,
      roster: reordered.map((id) => table.roster.find((entry) => entry.id === id) ?? table.roster[0]!),
    });
    await user.click(screen.getByRole('button', { name: 'Move Wren forward' }));
    expect(api.reorderRoster).toHaveBeenCalledWith(table.id, reordered);
    const party = screen.getByRole('list', { name: 'Party in marching order' });
    await waitFor(() => expect(within(party).getAllByRole('listitem')[0]).toHaveTextContent('Wren'));
  });

  it('starts the game with the chosen adventure', async () => {
    const fake = createFakeApi();
    fake.listAdventures.mockResolvedValue({ items: [bell] });
    fake.listCharacters.mockResolvedValue({ items: [] });
    const { api, store, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'referee'),
      api: fake,
    });
    const game = fixtureSnapshot('town', 'referee').game;
    api.startGame.mockResolvedValue(game!);
    await screen.findByRole('radio', { name: /The Drowned Bell/ });
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(api.startGame).toHaveBeenCalledWith(store.getState().tableId, {
      adventure_id: 'sample:the-drowned-bell',
    });
    await waitFor(() => expect(store.getState().game?.mode).toBe('town'));
  });

  it("says why the game can't start and why the leader can't move forward", async () => {
    const { api, store, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'referee'),
    });
    api.listAdventures.mockResolvedValue({ items: [] });
    api.listCharacters.mockResolvedValue({ items: [] });
    const start = screen.getByRole('button', { name: 'Start game' });
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(start).toHaveAccessibleDescription('Choose an adventure.');
    await user.click(start);
    expect(api.startGame).not.toHaveBeenCalled();
    const leader = (store.getState().table as TableDetail).roster[0]!.name;
    const forward = screen.getByRole('button', { name: `Move ${leader} forward` });
    expect(forward).toHaveAccessibleDescription(`${leader} already leads the marching order.`);
    await user.click(forward);
    expect(api.reorderRoster).not.toHaveBeenCalled();
  });

  it('shows a player the lobby read-only while waiting for the referee', async () => {
    const { api, store, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'player'),
    });
    api.listCharacters.mockResolvedValue({ items: [] });
    expect(screen.getByText('Waiting for the referee to start')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move .* forward/ })).not.toBeInTheDocument();
    // Sam may take his own characters off the roster, but not the referee's.
    expect(screen.getByRole('button', { name: 'Remove Brenna from party' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Osric from party' })).not.toBeInTheDocument();
    expect(api.listAdventures).not.toHaveBeenCalled();
    expect(store.getState().role).toBe('player');
    await user.click(screen.getByRole('button', { name: 'Table settings' }));
    expect(await screen.findByText('Only the referee can change these settings.')).toBeInTheDocument();
  });

  it("adds one of the user's characters to the party", async () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    const fake = createFakeApi();
    fake.listCharacters.mockResolvedValue({
      items: [
        {
          id: 'chr_nnnnnnnnnnnnnnnnnnnnnn',
          name: 'Nell',
          class_id: 'elf',
          level: 1,
          max_hp: 5,
          created_at: '2026-11-22T05:00:00Z',
        },
      ],
    });
    const { api, store, user } = renderWithTable(<LobbyPage />, { snapshot, api: fake });
    api.addToRoster.mockResolvedValue(snapshot.table);
    await user.click(await screen.findByRole('button', { name: 'Add to party' }));
    expect(api.addToRoster).toHaveBeenCalledWith(store.getState().tableId, 'chr_nnnnnnnnnnnnnnnnnnnnnn');
  });
});
