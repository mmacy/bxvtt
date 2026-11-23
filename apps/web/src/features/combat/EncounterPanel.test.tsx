import type { CommandResult, GameState } from '@bxvtt/shared/protocol';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShortcutLayer } from '@/app';
import { ActionBar } from '@/ui';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import { CombatActions, resolveRoundReason } from './CombatActions';
import { EncounterPanel } from './EncounterPanel';
import { spawnMissing } from './RefereeTools';
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

  it('names the caller once above the choices, and gives each choice its own reason, for a player who is not the caller', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('encounter', 'player');
    const ruth = snapshot.table?.members.find((m) => m.role === 'referee')?.user_id ?? null;
    if (snapshot.table) snapshot.table.settings.caller_user_id = ruth;
    renderWithTable(<EncounterPanel />, { snapshot, api });
    expect(
      screen.getByText('Only the caller can act for the party. Ruth is the caller.'),
    ).toBeInTheDocument();
    const fight = screen.getByRole('button', { name: 'Fight' });
    expect(fight).toHaveAttribute('aria-disabled', 'true');
    expect(fight).toHaveAccessibleDescription('Only the caller can start a battle. Ruth is the caller.');
  });

  it('offers turn undead only when a cleric can act, and explains it when no monster is undead', async () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<EncounterPanel />, { snapshot: fixtureSnapshot('encounter', 'player'), api });
    expect(await screen.findByRole('button', { name: 'Turn undead' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
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
    await user.click(screen.getByRole('button', { name: /^Declare for Wren:/ }));
    expect(api.declare).toHaveBeenCalledWith(
      expect.any(String),
      'character-0002',
      expect.objectContaining({ target_group_id: 'group-0001' }),
    );
  });

  it('names the characters still to declare once the player has declared for their own', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations;
    if (declarations) {
      declarations.declared = ['character-0001', 'character-0002'];
      declarations.declarations['character-0002'] = {
        action: 'hold',
        character_id: 'character-0002',
      } as never;
    }
    renderWithTable(
      <ActionBar aria-label="Party actions">
        <CombatActions />
      </ActionBar>,
      { snapshot, api },
    );
    expect(screen.getByText('Waiting for Osric and Tamsin to declare.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Declare for/ })).not.toBeInTheDocument();
  });
});

describe('resolveRoundReason', () => {
  const allowed = { allowed: true, reason: null };
  const early = { allowed: false, reason: 'Only a referee can resolve the round sooner.' };

  it('passes on the permission reason when the user may not resolve the round', () => {
    const denied = { allowed: false, reason: 'Only the caller can resolve the round. Sam is the caller.' };
    expect(resolveRoundReason({ canResolve: denied, canResolveEarly: early, auto: false, waiting: [] })).toBe(
      denied.reason,
    );
  });

  it('says the round resolves by itself with automatic resolution on', () => {
    expect(
      resolveRoundReason({ canResolve: allowed, canResolveEarly: early, auto: true, waiting: ['Wren'] }),
    ).toBe('The round resolves by itself once everyone has declared.');
  });

  it('tells a caller to wait, and a referee to resolve now, while someone has not declared', () => {
    expect(
      resolveRoundReason({ canResolve: allowed, canResolveEarly: early, auto: false, waiting: ['Wren'] }),
    ).toBe(early.reason);
    expect(
      resolveRoundReason({
        canResolve: allowed,
        canResolveEarly: allowed,
        auto: false,
        waiting: ['character-0003', 'character-0004'],
      }),
    ).toBe('Not everyone has declared yet. Choose Resolve now on the battle board to go ahead.');
  });

  it('gives no reason once everyone has declared', () => {
    expect(
      resolveRoundReason({ canResolve: allowed, canResolveEarly: early, auto: false, waiting: [] }),
    ).toBeNull();
  });
});

describe('spawnMissing', () => {
  it('names the first value the form lacks', () => {
    expect(spawnMissing(null, null, null)).toBe('Choose a monster to add.');
    expect(spawnMissing('goblin', null, null)).toBe('Enter how many monsters to add.');
    expect(spawnMissing('goblin', 2, null)).toBe('Enter how far away the monsters appear.');
    expect(spawnMissing('goblin', 2, 40)).toBeNull();
  });
});
