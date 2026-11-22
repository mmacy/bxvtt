import type { CommandResult } from '@bxvtt/shared/protocol';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMapBus } from '@/app';
import { ActionBar } from '@/ui';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { ExploreActions } from './ExploreActions';
import { MapStage } from './MapStage';
import { RECEDE_MS, ScenePanel } from './ScenePanel';

/** The action bar as the shell renders it, which the bar's buttons need for arrow-key navigation. */
function Bar() {
  return (
    <ActionBar aria-label="Party actions">
      <ExploreActions />
    </ActionBar>
  );
}

function exploring(role: 'player' | 'referee' = 'player') {
  const snapshot = fixtureSnapshot('exploring', role);
  const game = snapshot.game;
  if (game === null) throw new Error('The fixture has no game.');
  return { snapshot, game };
}

function result(game: CommandResult['game'], fields: Partial<CommandResult> = {}): CommandResult {
  return {
    accepted: true,
    rejections: [],
    events: [],
    messages: [],
    mode: game.mode,
    ended: false,
    revision: game.revision,
    game,
    ...fields,
  };
}

describe('MapStage', () => {
  it('moves the party with the arrow keys while the map has focus, and leaves letters to the shortcuts', async () => {
    const { snapshot, game } = exploring();
    const api = createFakeApi();
    api.sendCommand.mockResolvedValue(result(game, { events: [] }));
    const { store } = renderWithTable(<MapStage />, { snapshot, api });
    const map = screen.getByRole('application', { name: /Dungeon map. The arrow keys/ });
    fireEvent.keyDown(map, { key: 'w', code: 'KeyW' });
    expect(api.sendCommand).not.toHaveBeenCalled();
    fireEvent.keyDown(map, { key: 'ArrowUp', code: 'ArrowUp' });
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'move_party', direction: 'north' },
        game.revision,
      ),
    );
  });

  it('turns the party with Alt and an arrow key', async () => {
    const { snapshot, game } = exploring();
    const api = createFakeApi();
    api.sendCommand.mockResolvedValue(result(game, { events: [] }));
    renderWithTable(<MapStage />, { snapshot, api });
    fireEvent.keyDown(screen.getByRole('application', { name: /Dungeon map/ }), {
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      altKey: true,
    });
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        expect.any(String),
        { command_type: 'turn_party', facing: 'west' },
        game.revision,
      ),
    );
  });

  it('shows a refused move beside the party instead of a toast', async () => {
    const { snapshot, game } = exploring();
    const api = createFakeApi();
    api.sendCommand.mockResolvedValue(
      result(game, {
        accepted: false,
        rejections: [{ code: 'exploration.move.blocked', params: { direction: 'west' } }],
      }),
    );
    renderWithTable(<MapStage />, { snapshot, api });
    fireEvent.keyDown(screen.getByRole('application', { name: /Dungeon map/ }), {
      key: 'ArrowLeft',
      code: 'ArrowLeft',
    });
    // The live region repeats the line the map shows beside the party.
    await waitFor(() => expect(document.querySelector('[aria-live="polite"]:not(:empty)')).not.toBeNull());
    expect(screen.queryByRole('status', { name: /locked/i })).toBeNull();
    expect(document.body.textContent).toMatch(/west/i);
  });

  it('leaves the arrow keys to pan the map for a player who isn’t the caller', () => {
    const { snapshot } = exploring();
    if (snapshot.game) snapshot.game.caller_user_id = null;
    snapshot.table.settings.caller_user_id = null;
    const api = createFakeApi();
    renderWithTable(<MapStage />, { snapshot, api });
    fireEvent.keyDown(screen.getByRole('application', { name: /^Dungeon map. With the pin/ }), {
      key: 'ArrowUp',
      code: 'ArrowUp',
    });
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it('keeps the map’s chrome: theme, camera controls, and the scale', async () => {
    const { snapshot } = exploring();
    const { user } = renderWithTable(<MapStage />, { snapshot });
    expect(screen.getByRole('group', { name: 'Map view' })).toBeInTheDocument();
    // A narrow screen, as jsdom reports, starts with the minimap folded, and the choice sticks.
    await user.click(screen.getByRole('button', { name: 'Show the minimap' }));
    expect(screen.getByText('1 square is 10 feet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide the minimap' }));
    expect(screen.getByRole('button', { name: 'Show the minimap' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Parchment map' }));
    expect(screen.getByRole('radio', { name: 'Parchment map' })).toHaveAttribute('aria-checked', 'true');
  });

  it('says plainly when the party has no light, and offers the light actions', () => {
    const { snapshot } = exploring();
    renderWithTable(<MapStage />, { snapshot });
    expect(screen.getByText('The party has no light.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light: The party has no light.' })).toHaveTextContent(
      'No light',
    );
  });

  it('tells a referee which map they see', () => {
    const { snapshot } = exploring('referee');
    renderWithTable(<MapStage />, { snapshot, preferences: { refereeLens: false } });
    expect(screen.getByText('Players’ view'.replace('’', "'"))).toBeInTheDocument();
  });

  it('answers a cell pick from another feature', async () => {
    const { snapshot } = exploring();
    renderWithTable(<MapStage />, { snapshot });
    const picked = useMapBus.getState().requestPick({ kind: 'cell', prompt: 'Pick a cell.' });
    // The map's canvas has no layout in this test, so the pick resolves through the bus directly.
    useMapBus.getState().fulfilPick({ kind: 'cell', dungeon_id: 'priory', level_number: 1, x: 14, y: 22 });
    await expect(picked).resolves.toEqual({
      kind: 'cell',
      dungeon_id: 'priory',
      level_number: 1,
      x: 14,
      y: 22,
    });
  });
});

describe('MapStage for keyboard and screen reader users', () => {
  it('lists the pins of the level with their notes, and pins the party’s square', async () => {
    const { snapshot } = exploring();
    snapshot.annotations = {
      dungeon_id: 'priory',
      level_number: 1,
      items: [
        {
          id: 'ann_1',
          kind: 'pin',
          dungeon_id: 'priory',
          level_number: 1,
          author_id: snapshot.user.id,
          created_at: '2026-11-22T05:18:28Z',
          x: 14.5,
          y: 21.5,
          text: 'Painted monks',
          color: '#e69f00',
          visibility: 'everyone',
        },
      ],
    };
    const { user } = renderWithTable(<MapStage />, { snapshot });
    await user.click(screen.getByRole('button', { name: 'Pins: 1 on this level' }));
    const list = await screen.findByRole('list', { name: 'Pins on this level' });
    expect(within(list).getByText('Painted monks')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Show pin 1 on the map' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a pin where the party stands' }));
    expect(await screen.findByRole('dialog', { name: 'Add a pin' })).toBeInTheDocument();
  });

  it('announces another member’s ping politely, with their name', async () => {
    const { snapshot, game } = exploring();
    const { store } = renderWithTable(<MapStage />, { snapshot });
    const other = snapshot.table.members.find((member) => member.user_id !== snapshot.user.id);
    if (!other) throw new Error('No other member.');
    act(() => {
      store.getState().receive({
        type: 'ping',
        dungeon_id: 'priory',
        level_number: game.view.location.level_number ?? 1,
        x: 14.5,
        y: 21.5,
        user_id: other.user_id,
        at: '2026-11-22T05:18:30Z',
      });
    });
    expect(await screen.findByText(`${other.name} pinged the map.`)).toBeInTheDocument();
  });

  it('tells a referee only referees will see a private pin', async () => {
    const { snapshot } = exploring('referee');
    const { user } = renderWithTable(<MapStage />, { snapshot });
    await user.click(screen.getByRole('button', { name: /^Pins/ }));
    await user.click(await screen.findByRole('button', { name: 'Add a pin where the party stands' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a pin' });
    expect(within(dialog).getByText(/Everyone at the table sees/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Only referees see this pin' }));
    expect(within(dialog).getByText(/Only referees see this pin and its note/)).toBeInTheDocument();
  });

  it('names the light and its time in the same words as the party panel', () => {
    const { snapshot, game } = exploring();
    game.view.effects = [{ character_id: 'character-0001', kind: 'light', remaining_rounds: 360 }];
    renderWithTable(<MapStage />, { snapshot });
    expect(screen.getByText("Brenna's torch, about 6 turns left")).toBeInTheDocument();
  });
});

describe('ScenePanel', () => {
  it('reads the area aloud: its name, its description, and what is here', () => {
    const { snapshot } = exploring();
    renderWithTable(<ScenePanel />, { snapshot });
    expect(screen.getByRole('heading', { name: 'Gatehouse stair' })).toBeInTheDocument();
    expect(screen.getByText(/A flight of worn steps runs down/)).toBeInTheDocument();
    expect(screen.getByText(/The statue is Saint Corvane/)).toBeInTheDocument();
  });

  it('gives an unkeyed place a neutral name', () => {
    const { snapshot } = exploring();
    if (snapshot.game?.scene.here) snapshot.game.scene.here.area = null;
    renderWithTable(<ScenePanel />, { snapshot });
    expect(screen.getByRole('heading', { name: 'On the way' })).toBeInTheDocument();
  });

  it('takes stairs and treasure from the panel', async () => {
    const { snapshot, game } = exploring();
    const here = game.scene.here;
    if (!here) throw new Error('No scene here.');
    here.transitions = [{ kind: 'stairs_down', position: here.position, side: null, leads: 'down' }];
    here.caches = [
      { id: 'chest', source: 'authored', area_id: null, position: null, reachable: true, trap: null },
    ];
    const api = createFakeApi();
    api.sendCommand.mockResolvedValue(result(game, { events: [] }));
    const { user } = renderWithTable(<ScenePanel />, { snapshot, api });
    await user.click(screen.getByRole('button', { name: 'Go down the stairs' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        expect.any(String),
        { command_type: 'use_stairs' },
        game.revision,
      ),
    );
    expect(screen.getByText('Treasure is within reach.')).toBeInTheDocument();
  });

  it('folds to its title bar after the first read, and keeps actions one click away', () => {
    vi.useFakeTimers();
    try {
      const { snapshot, game } = exploring();
      const here = game.scene.here;
      if (!here) throw new Error('No scene here.');
      here.caches = [
        { id: 'chest', source: 'authored', area_id: null, position: null, reachable: true, trap: null },
      ];
      renderWithTable(<ScenePanel />, { snapshot });
      expect(screen.getByText(/A flight of worn steps/)).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(RECEDE_MS + 10);
      });
      expect(screen.queryByText(/A flight of worn steps/)).toBeNull();
      expect(screen.getByRole('heading', { name: 'Gatehouse stair' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2 things here' })).toBeInTheDocument();
      // Opening it by hand keeps it open, and this browser remembers.
      fireEvent.click(screen.getByRole('button', { name: 'Show the description' }));
      act(() => {
        vi.advanceTimersByTime(RECEDE_MS * 2);
      });
      expect(screen.getByText(/A flight of worn steps/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      localStorage.clear();
    }
  });

  it('collapses without losing its title', async () => {
    const { snapshot } = exploring();
    const { user } = renderWithTable(<ScenePanel />, { snapshot });
    await user.click(screen.getByRole('button', { name: 'Hide the description' }));
    expect(screen.queryByText(/A flight of worn steps/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Gatehouse stair' })).toBeInTheDocument();
  });
});

describe('ExploreActions', () => {
  it('searches with the kind and the searcher the player picks', async () => {
    const { snapshot, game } = exploring();
    const api = createFakeApi();
    api.sendCommand.mockResolvedValue(result(game, { events: [] }));
    const { user } = renderWithTable(<Bar />, { snapshot, api });
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const kind = await screen.findByRole('menuitem', { name: 'Search for secret doors' });
    kind.focus();
    await user.keyboard('{ArrowRight}');
    const wren = await screen.findByRole('menuitem', { name: 'Wren' });
    wren.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        expect.any(String),
        { command_type: 'search', kind: 'secret_doors', character_id: 'character-0002' },
        game.revision,
      ),
    );
  });

  it('says so when an accepted action shows the players nothing', async () => {
    const { snapshot, game } = exploring();
    const api = createFakeApi();
    api.sendCommand.mockResolvedValue(result(game, { events: [] }));
    const { user } = renderWithTable(<Bar />, { snapshot, api });
    await user.click(screen.getByRole('button', { name: 'Rest' }));
    await user.click(await screen.findByRole('menuitem', { name: /Rest for one turn/i }));
    // The toast shows the line, and the kit repeats it in a live region.
    expect((await screen.findAllByText('Nothing seems to happen.')).length).toBeGreaterThan(0);
  });

  it('offers every other legal command under Other, and the character sheet for items', async () => {
    const { snapshot } = exploring();
    const { user } = renderWithTable(<Bar />, { snapshot });
    await user.click(screen.getByRole('button', { name: 'Other' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Cast a spell…' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Drop items' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Move the party/ })).toBeNull();
  });

  it('offers the way back to town only where the scene says the party can travel', () => {
    const { snapshot } = exploring();
    if (snapshot.game) snapshot.game.scene.can_travel_to_town = false;
    const { unmount } = renderWithTable(<Bar />, { snapshot });
    expect(screen.queryByRole('button', { name: 'Return to town' })).toBeNull();
    unmount();
    const atEntrance = exploring().snapshot;
    if (atEntrance.game) atEntrance.game.scene.can_travel_to_town = true;
    renderWithTable(<Bar />, { snapshot: atEntrance });
    expect(screen.getByRole('button', { name: 'Return to town' })).toBeInTheDocument();
  });

  it('turns Listen off with a reason when no closed door is beside the party', () => {
    const { snapshot } = exploring();
    renderWithTable(<Bar />, { snapshot });
    expect(screen.getByRole('button', { name: 'Listen' })).toBeDisabled();
  });
});
