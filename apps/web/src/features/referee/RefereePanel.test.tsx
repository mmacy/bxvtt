import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { RefereePanel } from './RefereePanel';
import { commandResult, refereeApi } from './testing/helpers';

describe('RefereePanel', () => {
  it('shows the key for where the party stands', async () => {
    const api = refereeApi();
    renderWithTable(<RefereePanel />, { snapshot: fixtureSnapshot('exploring', 'referee'), api });
    expect(await screen.findAllByText('Gatehouse stair')).not.toHaveLength(0);
    expect(await screen.findByText(/A flight of worn steps runs down/)).toBeInTheDocument();
    expect(screen.getAllByText(/1 in 6, checked every 2 turns/)).not.toHaveLength(0);
  });

  it('names things in words, and shows IDs and cells only with Show IDs on', async () => {
    const api = refereeApi();
    const { user } = renderWithTable(<RefereePanel />, {
      snapshot: fixtureSnapshot('exploring', 'referee'),
      api,
    });
    expect(await screen.findByText(/The statue is Saint Corvane/)).toBeInTheDocument();
    expect(screen.queryByText('fallen_statue')).not.toBeInTheDocument();
    expect(screen.queryByText(/cell \d+, \d+/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Show IDs' }));
    expect(screen.getByText('fallen_statue')).toBeInTheDocument();
    expect(screen.getAllByText(/cell \d+, \d+/).length).toBeGreaterThan(0);
  });

  it('shows nothing of the referee view with the lens off', () => {
    const api = refereeApi();
    renderWithTable(<RefereePanel />, {
      snapshot: fixtureSnapshot('exploring', 'referee'),
      api,
      preferences: { refereeLens: false },
    });
    expect(screen.queryByText(/A flight of worn steps/)).not.toBeInTheDocument();
    expect(api.getAdventureDocument).not.toHaveBeenCalled();
  });

  it('shows nothing of the referee view to a player', () => {
    const api = refereeApi();
    renderWithTable(<RefereePanel />, { snapshot: fixtureSnapshot('exploring', 'player'), api });
    expect(screen.queryByText(/A flight of worn steps/)).not.toBeInTheDocument();
    expect(api.getAdventureDocument).not.toHaveBeenCalled();
  });

  it('shows each monster of the encounter with its hit points, and ends it on terms', async () => {
    const api = refereeApi();
    const snapshot = fixtureSnapshot('encounter', 'referee');
    api.sendCommand.mockResolvedValue(commandResult(snapshot));
    const { user, store } = renderWithTable(<RefereePanel />, { snapshot, api });
    const encounter = await screen.findByRole('region', { name: 'Active encounter' });
    expect(within(encounter).getByText('3 of 3 goblins')).toBeInTheDocument();
    expect(within(encounter).getAllByText(/^Goblin \d$/)).toHaveLength(3);
    await user.click(within(encounter).getByRole('radio', { name: /came to terms/i }));
    await user.click(within(encounter).getByRole('button', { name: 'End encounter' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'end_encounter', outcome: 'parley', resolve_area: true },
        snapshot.game?.revision,
      ),
    );
  });

  it('gives coins through the quick action and confirms it in place', async () => {
    const api = refereeApi();
    const snapshot = fixtureSnapshot('exploring', 'referee');
    api.sendCommand.mockResolvedValue(
      commandResult(snapshot, {
        events: [
          {
            event_type: 'item_acquired',
            code: 'exploration.item.acquired',
            visibility: 'player',
            character_id: 'character-0002',
            item_ids: [],
            coins_gp_value: 25,
            origin: 'grant',
          } as never,
        ],
      }),
    );
    const { user } = renderWithTable(<RefereePanel />, { snapshot, api });
    await user.click(screen.getByRole('tab', { name: 'Quick actions' }));
    await user.click(screen.getByRole('button', { name: /Give or take coins/ }));
    await user.click(await screen.findByRole('combobox', { name: /Receiver/ }));
    await user.click(await screen.findByRole('option', { name: /^Wren/ }));
    const gold = screen.getByRole('spinbutton', { name: 'Gold pieces' });
    await user.clear(gold);
    await user.type(gold, '25');
    await user.click(screen.getByRole('button', { name: 'Grant coins' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        expect.any(String),
        {
          command_type: 'grant_coins',
          character_id: 'character-0002',
          coins: { pp: 0, gp: 25, ep: 0, sp: 0, cp: 0 },
        },
        expect.any(Number),
      ),
    );
    expect(await screen.findByText(/Wren/, { selector: '[role=status] p' })).toBeInTheDocument();
  });

  it('shows bxapi’s refusal next to the form', async () => {
    const api = refereeApi();
    const snapshot = fixtureSnapshot('exploring', 'referee');
    api.sendCommand.mockResolvedValue(
      commandResult(snapshot, {
        accepted: false,
        rejections: [{ code: 'session.command.no_door', params: { x: 0, y: 0 } }],
      }),
    );
    const { user } = renderWithTable(<RefereePanel />, { snapshot, api });
    await user.click(screen.getByRole('tab', { name: 'Quick actions' }));
    await user.click(screen.getByRole('button', { name: /Change a door/ }));
    await user.click(await screen.findByRole('combobox', { name: /Dungeon/ }));
    await user.click(await screen.findByRole('option', { name: /Corvane/ }));
    for (const [name, value] of [
      ['Level', '1'],
      ['Column', '0'],
      ['Row', '0'],
    ] as const) {
      const box = screen.getByRole('spinbutton', { name: new RegExp(`^${name}`) });
      await user.clear(box);
      await user.type(box, value);
    }
    await user.click(screen.getByRole('combobox', { name: /Side of the cell/ }));
    await user.click(await screen.findByRole('option', { name: 'North' }));
    await user.click(screen.getAllByRole('radio', { name: 'Yes' })[0] as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Set door' }));
    expect(await screen.findByText('Action not allowed')).toBeInTheDocument();
    expect(api.sendCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ command_type: 'set_door_state', x: 0, y: 0, direction: 'north', open: true }),
      expect.any(Number),
    );
  });

  it('asks for missing fields before it sends anything', async () => {
    const api = refereeApi();
    const { user } = renderWithTable(<RefereePanel />, {
      snapshot: fixtureSnapshot('exploring', 'referee'),
      api,
    });
    await user.click(screen.getByRole('tab', { name: 'Quick actions' }));
    await user.click(screen.getByRole('button', { name: /Add a journal entry/ }));
    await user.click(await screen.findByRole('button', { name: 'Add entry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 1 highlighted field before sending.');
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it('reveals a hidden objective from the story state', async () => {
    const api = refereeApi();
    const snapshot = fixtureSnapshot('exploring', 'referee');
    api.sendCommand.mockResolvedValue(commandResult(snapshot));
    const { user } = renderWithTable(<RefereePanel />, { snapshot, api });
    await user.click(screen.getByRole('tab', { name: 'Quests, flags, and triggers' }));
    const objective = (await screen.findByText('Learn where the brothers hid the Hand')).closest('li');
    if (!objective) throw new Error('no objective row');
    expect(within(objective).getByText('Hidden')).toBeInTheDocument();
    await user.click(within(objective).getByRole('button', { name: 'Reveal' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        expect.any(String),
        { command_type: 'reveal_objective', quest_id: 'saints_hand', objective_id: 'learn_where' },
        expect.any(Number),
      ),
    );
  });

  it('says why a command is unavailable in the current mode, from the command catalog', async () => {
    const api = refereeApi();
    const snapshot = fixtureSnapshot('town', 'referee');
    const { user } = renderWithTable(<RefereePanel />, { snapshot, api });
    await user.click(screen.getByRole('tab', { name: 'Quick actions' }));
    await user.click(screen.getByRole('button', { name: /Spawn an NPC party/ }));
    const spawn = await screen.findByRole('button', { name: 'Spawn party' });
    const sentence = 'You can spawn an NPC party only while exploring. The party is in town now.';
    await waitFor(() => expect(spawn).toHaveAttribute('aria-disabled', 'true'));
    await waitFor(() => expect(spawn).toHaveAccessibleDescription(sentence));
    expect(screen.getAllByText(sentence).length).toBeGreaterThan(0);
    await user.click(spawn);
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it('keeps a command form usable and says nothing about modes while the command is legal', async () => {
    const api = refereeApi();
    const { user } = renderWithTable(<RefereePanel />, {
      snapshot: fixtureSnapshot('exploring', 'referee'),
      api,
    });
    await user.click(screen.getByRole('tab', { name: 'Quick actions' }));
    await user.click(screen.getByRole('button', { name: /Spawn an NPC party/ }));
    const spawn = await screen.findByRole('button', { name: 'Spawn party' });
    expect(spawn).not.toHaveAttribute('aria-disabled', 'true');
    expect(spawn).not.toHaveAccessibleDescription(/only while exploring/);
  });
});
