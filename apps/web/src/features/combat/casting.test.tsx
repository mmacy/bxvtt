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
    wren.needs_sleep_to_prepare = true;
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    const row = screen.getAllByRole('listitem').find((li) => within(li).queryByText('Wren', { exact: true }));
    if (!row) throw new Error('No row for Wren.');
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    expect(
      await screen.findByText(
        "Wren has no spells memorized. Rest for a night, then prepare spells from the Spells tab on Wren's sheet.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Cast' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: "Open Wren's spells" }));
    expect(useTableUi.getState().sheetMemberId).toBe(wren.id);
    expect(useTableUi.getState().sheetTab).toBe('spells');
  });

  it('tells a caster to rest only when the view says they have to sleep before preparing', () => {
    expect(noSpellsReason('Wren', true, true)).toBe(
      'Wren has cast every memorized spell. Rest for a night to prepare spells again.',
    );
    expect(noSpellsReason('Wren', true, false)).toBe(
      "Wren has cast every memorized spell. Prepare spells from the Spells tab on Wren's sheet.",
    );
    expect(noSpellsReason('Wren', false, false)).toBe(
      "Wren has no spells memorized. Prepare spells from the Spells tab on Wren's sheet.",
    );
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
          modes: [
            {
              key: 'light',
              display_name: 'Light',
              prose: 'Light makes light.',
              targeting: { mode: 'single' },
            },
          ],
          reversed_form: {
            name: 'Darkness',
            prose: '',
            modes: [
              {
                key: 'darkness',
                display_name: 'Darkness',
                prose: 'Darkness makes dark.',
                targeting: { mode: 'single' },
              },
            ],
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
      reverses_at: 'memorize',
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

  it('offers a magic-user no reverse as a spell is cast, since it was chosen when memorized', async () => {
    const { api, snapshot } = lightCaster(false);
    // A custom arcane class with no spell book still chose the form when memorizing.
    const wren = snapshot.game?.view.party.find((m) => m.name === 'Wren');
    if (wren) wren.spell_book = [];
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    const composer = await openCast(user);
    // The spell's details load before the form choice could show.
    expect(await within(composer).findByText(/Light makes light\./)).toBeInTheDocument();
    expect(within(composer).queryByRole('checkbox', { name: /reverse/ })).not.toBeInTheDocument();
  });

  it('offers a caster who reverses at casting the reverse, whatever their spell book holds', async () => {
    const { api, snapshot } = lightCaster(false);
    const wren = snapshot.game?.view.party.find((m) => m.name === 'Wren');
    if (wren) wren.reverses_at = 'cast';
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    const composer = await openCast(user);
    expect(
      await within(composer).findByRole('checkbox', { name: 'Cast the reverse (Darkness)' }),
    ).toBeInTheDocument();
  });

  it("names Sleep's ways to cast by osrlib's labels on the Cast tab", async () => {
    const api = createFakeApi();
    api.rules.mockImplementation(
      async (path: string) => ({ id: path, abilities: [], progression: [] }) as never,
    );
    api.fullCatalog.mockResolvedValue({
      catalog: 'spells',
      total: 1,
      items: [
        {
          id: 'sleep',
          name: 'Sleep',
          spell_list: 'magic_user',
          level: 1,
          range: '240’',
          range_spec: { kind: 'feet', feet: 240 },
          duration: '4d4 turns',
          intro: '',
          reversed_form: null,
          modes: [
            {
              key: 'single_4_plus',
              display_name: 'Put a creature with 4+1 Hit Dice to sleep',
              prose: 'A single creature with 4+1 Hit Dice (see Hit point modifiers).',
              targeting: { mode: 'single' },
            },
            {
              key: 'hd_budget',
              display_name: 'Put creatures of 4 Hit Dice or lower to sleep',
              prose: 'A total of 2d8 Hit Dice of creatures of 4 HD or lower each.',
              targeting: { mode: 'hd_budget' },
            },
          ],
        },
      ],
    } as never);
    const snapshot = fixtureSnapshot('battle', 'player');
    const view = snapshot.game?.view;
    const wren = view?.party.find((m) => m.name === 'Wren');
    if (!view || !wren) throw new Error('No Wren.');
    Object.assign(wren, {
      class_id: 'magic_user',
      spell_book: ['sleep'],
      spell_slots: [1, 0, 0, 0, 0, 0],
      memorized_spells: [{ spell_id: 'sleep' }],
    });
    view.spell_names = { ...view.spell_names, sleep: 'Sleep' };
    view.spell_levels = { ...view.spell_levels, sleep: 1 };
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    const row = screen.getAllByRole('listitem').find((li) => within(li).queryByText('Wren', { exact: true }));
    if (!row) throw new Error('No row for Wren.');
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('radio', { name: 'Cast' }));
    const modes = await screen.findByRole('radiogroup', { name: 'How to cast Sleep' });
    expect(
      within(modes).getByRole('radio', { name: 'Put a creature with 4+1 Hit Dice to sleep' }),
    ).toBeInTheDocument();
    expect(
      within(modes).getByRole('radio', { name: 'Put creatures of 4 Hit Dice or lower to sleep' }),
    ).toBeInTheDocument();
  });
});
