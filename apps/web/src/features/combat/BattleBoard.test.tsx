import type { DeclarationsState, FeedEntry } from '@bxvtt/shared/protocol';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import { BattleBoard } from './BattleBoard';
import { resetCombatMemory } from './memory';
import { resetCombatUi } from './state';

function stubRules(api: FakeApi) {
  api.rules.mockImplementation(async (path: string) => {
    if (path === 'classes/cleric') return { id: 'cleric', abilities: [{ tag: 'turn_undead' }] } as never;
    if (path.startsWith('classes/')) return { id: path.slice(8), abilities: [] } as never;
    return { abilities: [] } as never;
  });
}

function row(name: string): HTMLElement {
  const item = screen.getAllByRole('listitem').find((li) => within(li).queryByText(name, { exact: true }));
  if (!item) throw new Error(`No row for ${name}.`);
  return item;
}

beforeEach(() => {
  resetCombatMemory();
  resetCombatUi();
});

describe('BattleBoard', () => {
  it('shows each declaration and who the table waits for', () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<BattleBoard />, { snapshot: fixtureSnapshot('battle', 'player'), api });
    expect(within(row('Brenna')).getByText('Attack the goblins')).toBeInTheDocument();
    expect(within(row('Osric')).getByText('Waiting for Ruth')).toBeInTheDocument();
    expect(screen.getByText(/1 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/The round resolves when everyone has declared/)).toBeInTheDocument();
  });

  it('declares the common case in one click', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    api.declare.mockResolvedValue(snapshot.declarations as DeclarationsState);
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    const quick = within(row('Wren')).getAllByRole('button')[0];
    if (!quick) throw new Error('No quick action.');
    await user.click(quick);
    expect(api.declare).toHaveBeenCalledWith(
      store.getState().tableId,
      'character-0002',
      expect.objectContaining({ target_group_id: 'group-0001' }),
    );
  });

  it('declares from the composer', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    api.declare.mockResolvedValue(snapshot.declarations as DeclarationsState);
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'More choices' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Hold' }));
    await user.click(within(composer).getByRole('button', { name: 'Hold this round' }));
    expect(api.declare).toHaveBeenCalledWith(store.getState().tableId, 'character-0002', { action: 'hold' });
  });

  it('shows a refused declaration next to its member', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.refusals = [
      {
        member_id: 'character-0001',
        code: 'battle.declaration.not_in_front_rank',
        params: { character: 'character-0001' },
      },
    ];
    renderWithTable(<BattleBoard />, { snapshot, api });
    expect(within(row('Brenna')).getByText(/front rank/)).toBeInTheDocument();
  });

  it('lets the referee resolve early after a confirmation, holding for the rest', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'referee');
    api.resolveRound.mockRejectedValue(new Error('stop here'));
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(screen.getByRole('button', { name: 'Resolve now' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/Wren, Osric, and Tamsin haven't declared/);
    await user.click(within(dialog).getByRole('button', { name: 'Resolve now' }));
    await waitFor(() => expect(api.resolveRound).toHaveBeenCalledWith(store.getState().tableId, true));
  });

  it('plays a resolved round back, and sums it up at once with reduced motion', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const { store } = renderWithTable(<BattleBoard />, { snapshot, api, preferences: { motion: 'reduce' } });
    const last = snapshot.feed.entries.at(-1)?.seq ?? 0;
    const entry: FeedEntry = {
      seq: last + 1,
      created_at: '2026-11-22T05:20:00Z',
      user_id: null,
      visibility: 'everyone',
      to: [],
      kind: 'game',
      command_type: 'resolve_battle_round',
      revision: (snapshot.game?.revision ?? 0) + 1,
      session_id: snapshot.game?.session_id ?? '',
      messages: [],
      events: [
        { event_type: 'battle_round', code: 'battle.round.started', visibility: 'player', round: 1 },
        {
          event_type: 'damage_dealt',
          code: 'combat.damage.dealt',
          visibility: 'player',
          target_id: 'character-0001',
          attacker_id: 'monster-0001',
          amount: 2,
          rolls: [2],
          keys: [],
          non_regenerable: false,
        },
      ] as never,
    };
    act(() => store.getState().receive({ type: 'feed', entry }));
    expect(await screen.findByText('Round 1 result')).toBeInTheDocument();
    expect(screen.getByText('2 damage taken')).toBeInTheDocument();
  });
});
