import type { FeedEntry } from '@bxvtt/shared/protocol';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTableUi } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { BattleBoard } from './BattleBoard';
import { castEverySpell, noSpellsReason } from './casting';
import { resetCombatMemory } from './memory';
import { resetCombatUi } from './state';

beforeEach(() => {
  resetCombatMemory();
  resetCombatUi();
});

function game(events: unknown[], seq: number): FeedEntry {
  return {
    seq,
    created_at: '2026-11-22T05:20:00Z',
    user_id: null,
    visibility: 'everyone',
    to: [],
    kind: 'game',
    command_type: null,
    revision: seq,
    session_id: 's',
    messages: [],
    events: events as never,
  };
}

describe('a caster with nothing to cast', () => {
  it('sees the Cast tab disabled, the reason, and a link to the Spells tab', async () => {
    const api = createFakeApi();
    api.rules.mockImplementation(async (path: string) => {
      if (path === 'classes/magic_user')
        return {
          id: 'magic_user',
          abilities: [{ tag: 'arcane_magic' }],
          progression: [{ level: 1, spell_slots: [1, 0, 0, 0, 0, 0] }],
        } as never;
      return { id: path, abilities: [], progression: [] } as never;
    });
    const snapshot = fixtureSnapshot('battle', 'player');
    const wren = snapshot.game?.view.party.find((m) => m.name === 'Wren');
    if (!wren) throw new Error('No Wren.');
    wren.class_id = 'magic_user';
    wren.spell_book = ['sleep'] as never;
    wren.memorized_spells = [];
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    const row = screen.getAllByRole('listitem').find((li) => within(li).queryByText('Wren', { exact: true }));
    if (!row) throw new Error('No row for Wren.');
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    expect(await screen.findByText(noSpellsReason('Wren', false))).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Cast' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: "Open Wren's spells" }));
    expect(useTableUi.getState().sheetMemberId).toBe(wren.id);
    expect(useTableUi.getState().sheetTab).toBe('spells');
  });

  it('tells a caster who has cast every memorized spell from one who prepared nothing', () => {
    const prepared = {
      event_type: 'spells_memorized',
      code: 'magic.memorize.prepared',
      caster_id: 'character-0004',
    };
    const cast = { event_type: 'spell_cast', code: 'magic.cast.cast', caster_id: 'character-0004' };
    expect(castEverySpell([game([prepared], 1), game([cast], 2)], 'character-0004')).toBe(true);
    expect(castEverySpell([game([prepared], 1)], 'character-0004')).toBe(false);
    expect(castEverySpell([game([cast], 2)], 'character-0004')).toBe(false);
  });
});
