import type { CommandResult, GameState } from '@bxvtt/shared/protocol';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShortcutLayer } from '@/app';
import { ActionBar } from '@/ui';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import { CombatActions } from './CombatActions';
import { EncounterPanel } from './EncounterPanel';
import { resetCombatMemory } from './memory';
import { resetCombatUi } from './state';

function stubRules(api: FakeApi) {
  api.rules.mockImplementation(async (path: string) => {
    if (path === 'classes/cleric') return { id: 'cleric', abilities: [{ tag: 'turn_undead' }] } as never;
    return { id: path, abilities: [] } as never;
  });
}

function accepted(game: GameState): CommandResult {
  return {
    accepted: true,
    rejections: [],
    events: [],
    messages: [],
    mode: game.mode,
    ended: false,
    revision: game.revision,
    game,
  };
}

beforeEach(() => {
  resetCombatMemory();
  resetCombatUi();
});

describe('EncounterPanel', () => {
  it('names the monsters, their distance, and their bearing', () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<EncounterPanel />, { snapshot: fixtureSnapshot('encounter', 'player'), api });
    expect(screen.getByRole('heading', { name: 'The party meets 3 goblins' })).toBeInTheDocument();
    expect(screen.getByText(/40 feet away/)).toBeInTheDocument();
    expect(screen.getByText('Indifferent')).toBeInTheDocument();
    expect(screen.getByText(/Talk if you want to test their reaction/)).toBeInTheDocument();
  });

  it('starts a battle', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('encounter', 'player');
    api.sendCommand.mockResolvedValue(accepted(snapshot.game as GameState));
    const { user, store } = renderWithTable(<EncounterPanel />, { snapshot, api });
    await user.click(screen.getByRole('button', { name: 'Fight' }));
    expect(api.sendCommand).toHaveBeenCalledWith(
      store.getState().tableId,
      { command_type: 'engage_battle' },
      snapshot.game?.revision,
    );
  });

  it('talks with the speaker the player picks', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('encounter', 'player');
    api.sendCommand.mockResolvedValue(accepted(snapshot.game as GameState));
    const { user } = renderWithTable(<EncounterPanel />, { snapshot, api });
    await user.click(screen.getByRole('button', { name: 'Talk' }));
    await user.click(await screen.findByRole('option', { name: /Wren/ }));
    expect(api.sendCommand).toHaveBeenCalledWith(
      expect.any(String),
      { command_type: 'parley', character_id: 'character-0002' },
      expect.any(Number),
    );
  });

  it('offers turn undead only when a cleric can act, and explains it when no monster is undead', async () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<EncounterPanel />, { snapshot: fixtureSnapshot('encounter', 'player'), api });
    expect(await screen.findByRole('button', { name: 'Turn undead' })).toBeDisabled();
    expect(screen.getAllByText('None of these monsters are undead.').length).toBeGreaterThan(0);
  });
});

describe('CombatActions', () => {
  it('fights with the F key', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('encounter', 'player');
    api.sendCommand.mockResolvedValue(accepted(snapshot.game as GameState));
    renderWithTable(
      <>
        <ShortcutLayer />
        <ActionBar aria-label="Party actions">
          <CombatActions />
        </ActionBar>
      </>,
      { snapshot, api },
    );
    fireEvent.keyDown(window, { key: 'f' });
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        expect.any(String),
        { command_type: 'engage_battle' },
        expect.any(Number),
      ),
    );
  });

  it('declares the next member’s attack from the action bar in a battle', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    api.declare.mockResolvedValue(snapshot.declarations as never);
    const { user } = renderWithTable(
      <ActionBar aria-label="Party actions">
        <CombatActions />
      </ActionBar>,
      { snapshot, api },
    );
    await user.click(screen.getByRole('button', { name: /^Wren:/ }));
    expect(api.declare).toHaveBeenCalledWith(
      expect.any(String),
      'character-0002',
      expect.objectContaining({ target_group_id: 'group-0001' }),
    );
  });
});
