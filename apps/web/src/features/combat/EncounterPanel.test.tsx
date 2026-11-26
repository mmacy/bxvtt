import type { CommandResult, GameState } from '@bxvtt/shared/protocol';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
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
    expect(screen.getByText(/30 feet away/)).toBeInTheDocument();
    expect(screen.getByText('Indifferent')).toBeInTheDocument();
    expect(screen.getByText(/Talk if you want to test their reaction/)).toBeInTheDocument();
  });

  it('says what a wait did when the result arrives before the panel mounts (#29)', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('encounter', 'player');
    const game = snapshot.game as GameState;
    /** The panel mounts on demand, as it does when its code loads after the snapshot. */
    function Later() {
      const [shown, setShown] = useState(false);
      return shown ? <EncounterPanel /> : <button onClick={() => setShown(true)}>Show the panel</button>;
    }
    const { user, store } = renderWithTable(<Later />, { snapshot, api });
    act(() => {
      store.getState().receive({
        type: 'feed',
        entry: {
          kind: 'game',
          seq: (snapshot.feed.entries.at(-1)?.seq ?? 0) + 1,
          created_at: '2026-11-22T05:20:00Z',
          user_id: null,
          visibility: 'everyone',
          to: [],
          command_type: 'wait',
          revision: game.revision + 1,
          session_id: game.session_id,
          events: [],
          messages: [],
        },
      });
      store.getState().receive({ type: 'game', game: { ...game, revision: game.revision + 1 } });
    });
    await user.click(screen.getByRole('button', { name: 'Show the panel' }));
    expect(await screen.findByText(/^The party waits\. \S/)).toBeInTheDocument();
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

describe('turn undead with two turners (#30)', () => {
  /** The encounter with undead, a cleric of Ruth's first in the marching order, and the viewer's cleric last. */
  function twoClerics() {
    const snapshot = fixtureSnapshot('encounter', 'player');
    const game = snapshot.game as GameState;
    const viewer = snapshot.user.id;
    const tamsin = game.view.party.find((m) => m.id === 'character-0004');
    if (tamsin) tamsin.class_id = 'cleric';
    for (const seat of game.seats) if (seat.member_id === 'character-0004') seat.user_id = viewer;
    for (const group of game.view.encounter?.groups ?? []) group.categories = ['undead'];
    return snapshot;
  }

  it('lets the player of the second cleric open the turners and pick their own', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = twoClerics();
    api.sendCommand.mockResolvedValue(accepted(snapshot.game as GameState));
    const { user } = renderWithTable(<EncounterPanel />, { snapshot, api });
    const turn = await screen.findByRole('button', { name: 'Turn undead' });
    expect(turn).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(turn);
    expect(await screen.findByRole('option', { name: /Osric/ })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('option', { name: /Tamsin/ }));
    expect(api.sendCommand).toHaveBeenCalledWith(
      expect.any(String),
      { command_type: 'turn_undead', character_id: 'character-0004' },
      expect.any(Number),
    );
  });

  it('keeps the button unavailable, with a reason, for a viewer who plays neither cleric', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = twoClerics();
    const game = snapshot.game as GameState;
    const ruth = snapshot.table?.members.find((m) => m.role === 'referee')?.user_id ?? null;
    for (const seat of game.seats) if (seat.member_id === 'character-0004') seat.user_id = ruth;
    renderWithTable(<EncounterPanel />, { snapshot, api });
    const turn = await screen.findByRole('button', { name: 'Turn undead' });
    expect(turn).toHaveAttribute('aria-disabled', 'true');
    expect(turn).toHaveAccessibleDescription(/Osric/);
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

  it("keeps Resolve round unavailable while a declared action won't work", async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    if (snapshot.table) snapshot.table.settings.auto_resolve = false;
    const declarations = snapshot.declarations;
    if (!declarations) throw new Error('No declarations in the fixture.');
    declarations.declared = [...declarations.declarers];
    for (const id of declarations.declarers)
      declarations.declarations[id] ??= { action: 'hold', character_id: id } as never;
    declarations.refusals = [
      {
        member_id: 'character-0001',
        code: 'combat.attack.out_of_reach',
        params: { character: 'character-0001', distance_feet: 30 },
      },
    ];
    const { user } = renderWithTable(
      <ActionBar aria-label="Party actions">
        <CombatActions />
      </ActionBar>,
      { snapshot, api },
    );
    const resolve = screen.getByRole('button', { name: 'Resolve round' });
    expect(resolve).toHaveAttribute('aria-disabled', 'true');
    expect(resolve).toHaveAccessibleDescription(/Brenna needs a different action first\./);
    await user.click(resolve);
    expect(api.resolveRound).not.toHaveBeenCalled();
  });

  it("says the round waits for a changed action, not that it resolves now, when one won't work", () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    if (snapshot.table) snapshot.table.settings.auto_resolve = true;
    const declarations = snapshot.declarations;
    if (!declarations) throw new Error('No declarations in the fixture.');
    declarations.declared = [...declarations.declarers];
    for (const id of declarations.declarers)
      declarations.declarations[id] ??= { action: 'hold', character_id: id } as never;
    declarations.refusals = [
      {
        member_id: 'character-0002',
        code: 'battle.declaration.hide_in_front_rank',
        params: { character: 'character-0002' },
      },
    ];
    renderWithTable(
      <ActionBar aria-label="Party actions">
        <CombatActions />
      </ActionBar>,
      { snapshot, api },
    );
    expect(
      screen.getByText('Wren needs a different action before the round can resolve.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/The round resolves now/)).not.toBeInTheDocument();
  });

  it('offers Resolve round when a refusal names a member who can no longer act', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    if (snapshot.table) snapshot.table.settings.auto_resolve = false;
    const declarations = snapshot.declarations;
    if (!declarations) throw new Error('No declarations in the fixture.');
    // Tamsin fell, so she isn't a declarer any more, and a stale refusal still names her. The board agrees.
    declarations.declarers = declarations.declarers.filter((id) => id !== 'character-0004');
    declarations.declared = [...declarations.declarers];
    for (const id of declarations.declarers)
      declarations.declarations[id] ??= { action: 'hold', character_id: id } as never;
    declarations.refusals = [
      {
        member_id: 'character-0004',
        code: 'combat.attack.out_of_reach',
        params: { character: 'character-0004', distance_feet: 30 },
      },
    ];
    renderWithTable(
      <ActionBar aria-label="Party actions">
        <CombatActions />
      </ActionBar>,
      { snapshot, api },
    );
    const resolve = screen.getByRole('button', { name: 'Resolve round' });
    expect(resolve).not.toHaveAttribute('aria-disabled');
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

  it("names who needs a different action when one won't work", () => {
    expect(
      resolveRoundReason({
        canResolve: allowed,
        canResolveEarly: early,
        auto: false,
        waiting: [],
        refused: ['Brenna'],
      }),
    ).toBe('Brenna needs a different action first.');
    expect(
      resolveRoundReason({
        canResolve: allowed,
        canResolveEarly: early,
        auto: false,
        waiting: [],
        refused: ['Brenna', 'Wren'],
      }),
    ).toBe('Brenna and Wren need different actions first.');
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
