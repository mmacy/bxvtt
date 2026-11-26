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
    api.rules.mockImplementation(
      async (path: string) => ({ id: path, abilities: [], progression: [] }) as never,
    );
    const snapshot = fixtureSnapshot('battle', 'player');
    const wren = snapshot.game?.view.party.find((m) => m.name === 'Wren');
    if (!wren) throw new Error('No Wren.');
    wren.class_id = 'magic_user';
    wren.spell_book = ['sleep'];
    wren.spell_slots = [1, 0, 0, 0, 0, 0];
    wren.preparable_spells = ['sleep'];
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

  it("reads a bundled spell's details from the game on the Cast tab, and says when they didn't load", async () => {
    const api = createFakeApi();
    api.rules.mockImplementation(
      async (path: string) => ({ id: path, abilities: [], progression: [] }) as never,
    );
    api.fullCatalog.mockResolvedValue({ catalog: 'spells', total: 0, items: [] } as never);
    api.getSessionSpell.mockRejectedValue(new Error('offline'));
    const snapshot = fixtureSnapshot('battle', 'player');
    const view = snapshot.game?.view;
    const wren = view?.party.find((m) => m.name === 'Wren');
    if (!view || !wren) throw new Error('No Wren.');
    Object.assign(wren, {
      class_id: 'magic_user',
      spell_book: ['ember_dart'],
      spell_slots: [1, 0, 0, 0, 0, 0],
      memorized_spells: [{ spell_id: 'ember_dart' }],
    });
    view.spell_names = { ...view.spell_names, ember_dart: 'Ember Dart' };
    view.spell_levels = { ...view.spell_levels, ember_dart: 1 };
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    const row = screen.getAllByRole('listitem').find((li) => within(li).queryByText('Wren', { exact: true }));
    if (!row) throw new Error('No row for Wren.');
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('radio', { name: 'Cast' }));
    expect(
      await screen.findByText("This spell's details didn't load. Try again in a moment."),
    ).toBeInTheDocument();
    expect(api.getSessionSpell).toHaveBeenCalledWith(store.getState().tableId, 'ember_dart');
  });

  /** The battle fixture with Wren as a magic-user who has Light in her book, memorized in the form given. */
  function lightCaster(reversed: boolean) {
    const api = createFakeApi();
    api.rules.mockImplementation(
      async (path: string) => ({ id: path, abilities: [], progression: [] }) as never,
    );
    api.fullCatalog.mockResolvedValue({
      catalog: 'spells',
      total: 1,
      items: [
        {
          id: 'light_mu',
          name: 'Light',
          spell_list: 'magic_user',
          level: 1,
          range: '120 feet',
          duration: '6 turns',
          intro: 'Light makes light.',
          modes: [{ key: 'light', prose: 'Light makes light.', targeting: { mode: 'single' } }],
          reversed_form: {
            name: 'Darkness',
            prose: '',
            modes: [{ key: 'darkness', prose: 'Darkness makes dark.', targeting: { mode: 'single' } }],
          },
        },
      ],
    } as never);
    const snapshot = fixtureSnapshot('battle', 'player');
    const view = snapshot.game?.view;
    const wren = view?.party.find((m) => m.name === 'Wren');
    if (!view || !wren) throw new Error('No Wren.');
    Object.assign(wren, {
      class_id: 'magic_user',
      spell_book: ['light_mu'],
      spell_slots: [1, 0, 0, 0, 0, 0],
      memorized_spells: [reversed ? { spell_id: 'light_mu', reversed: true } : { spell_id: 'light_mu' }],
    });
    view.spell_names = { ...view.spell_names, light_mu: 'Light' };
    view.spell_levels = { ...view.spell_levels, light_mu: 1 };
    view.reversed_spell_names = { ...view.reversed_spell_names, light_mu: 'Darkness' };
    return { api, snapshot };
  }

  async function openCast(user: ReturnType<typeof renderWithTable>['user']) {
    const row = screen.getAllByRole('listitem').find((li) => within(li).queryByText('Wren', { exact: true }));
    if (!row) throw new Error('No row for Wren.');
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('radio', { name: 'Cast' }));
    return screen.getByRole('region', { name: 'Declare for Wren' });
  }

  it("names a magic-user's reversed copy by the reverse's own name", async () => {
    const { api, snapshot } = lightCaster(true);
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    const composer = await openCast(user);
    const spells = within(composer).getByRole('group', { name: 'Memorized spells' });
    expect(within(spells).getByRole('button', { name: 'Darkness' })).toBeInTheDocument();
    expect(spells).not.toHaveTextContent(/Light|reversed/);
  });

  it('offers a magic-user no reverse as a book spell is cast, since it was chosen when memorized', async () => {
    const { api, snapshot } = lightCaster(false);
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    const composer = await openCast(user);
    // The spell's details load before the form choice could show.
    expect(await within(composer).findByText(/Light makes light\./)).toBeInTheDocument();
    expect(within(composer).queryByRole('checkbox', { name: /reverse/ })).not.toBeInTheDocument();
  });
});
