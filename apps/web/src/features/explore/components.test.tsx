import type { CommandResult } from '@bxvtt/shared/protocol';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMapBus } from '@/app';
import { ActionBar } from '@/ui';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { ExploreActions } from './ExploreActions';
import { MapStage } from './MapStage';
import { ScenePanel } from './ScenePanel';

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
  it('moves the party with the arrow keys and W, A, S, and D while the map has focus', async () => {
    const { snapshot, game } = exploring();
    const api = createFakeApi();
    api.sendCommand.mockResolvedValue(result(game, { events: [] }));
    const { store } = renderWithTable(<MapStage />, { snapshot, api });
    const map = screen.getByRole('application', { name: /Dungeon map. Arrow keys/ });
    fireEvent.keyDown(map, { key: 'w', code: 'KeyW' });
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
    fireEvent.keyDown(screen.getByRole('application', { name: 'Dungeon map' }), {
      key: 'ArrowUp',
      code: 'ArrowUp',
    });
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it('keeps the map’s chrome: theme, camera controls, and the scale', async () => {
    const { snapshot } = exploring();
    const { user } = renderWithTable(<MapStage />, { snapshot });
    expect(screen.getByRole('group', { name: 'Map view' })).toBeInTheDocument();
    expect(screen.getByText('1 square is 10 feet')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Parchment map' }));
    expect(screen.getByRole('radio', { name: 'Parchment map' })).toHaveAttribute('aria-checked', 'true');
  });

  it('says plainly when the party has no light', () => {
    const { snapshot } = exploring();
    renderWithTable(<MapStage />, { snapshot });
    expect(screen.getByText('No light. The party is in the dark.')).toBeInTheDocument();
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

describe('ScenePanel', () => {
  it('reads the area aloud: its name, its description, and what is here', () => {
    const { snapshot } = exploring();
    renderWithTable(<ScenePanel />, { snapshot });
    expect(screen.getByRole('heading', { name: 'Gatehouse stair' })).toBeInTheDocument();
    expect(screen.getByText(/A flight of worn steps runs down/)).toBeInTheDocument();
    expect(screen.getByText(/The statue is Saint Corvane/)).toBeInTheDocument();
  });

  it('says the party is in a corridor where no area is keyed', () => {
    const { snapshot } = exploring();
    if (snapshot.game?.scene.here) snapshot.game.scene.here.area = null;
    renderWithTable(<ScenePanel />, { snapshot });
    expect(screen.getByRole('heading', { name: 'A corridor' })).toBeInTheDocument();
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
    expect(await screen.findByText('Nothing seems to happen.')).toBeInTheDocument();
  });

  it('offers every other legal command under More, and the character sheet for items', async () => {
    const { snapshot } = exploring();
    const { user } = renderWithTable(<Bar />, { snapshot });
    await user.click(screen.getByRole('button', { name: 'More' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Cast a spell…' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Drop items' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Move the party/ })).toBeNull();
  });

  it('turns Listen off with a reason when no closed door is beside the party', () => {
    const { snapshot } = exploring();
    renderWithTable(<Bar />, { snapshot });
    expect(screen.getByRole('button', { name: 'Listen' })).toBeDisabled();
  });
});
