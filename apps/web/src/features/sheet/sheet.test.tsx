import type { CommandResult, StoredCharacter } from '@bxvtt/shared/protocol';
import { emptyContext } from '@bxvtt/shared/text';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMyCharacters } from '@/app';
import { useCombatStage, useTableUi } from '@/app';
import stored from '../wizard/__fixtures__/stored.json';
import { StoredCharacterCard } from './StoredCharacterCard';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { CharacterSheet } from './CharacterSheet';
import { entryRule } from './InventoryTab';
import { effectLabel } from './actions';
import { readInventory } from './model';
import { PartyPanel, moveTo } from './PartyPanel';
import { spellDuration, withoutPointers } from './spellText';

function accepted(snapshot: ReturnType<typeof fixtureSnapshot>): CommandResult {
  const game = snapshot.game;
  if (!game) throw new Error('The fixture has no game.');
  return { accepted: true, rejections: [], events: [], messages: [], game } as unknown as CommandResult;
}

beforeEach(() => resetMyCharacters());

describe('withoutPointers', () => {
  it('drops references to rulebook text the card does not show', () => {
    expect(withoutPointers('A single creature with 4+1 Hit Dice (see Hit point modifiers).')).toBe(
      'A single creature with 4+1 Hit Dice.',
    );
    expect(spellDuration('4d4 turns (see below)')).toBe('4d4 turns');
    expect(withoutPointers('Lasts 1 turn per level (See Light), then ends')).toBe(
      'Lasts 1 turn per level, then ends',
    );
    expect(withoutPointers('Up to 2d8 Hit Dice (creatures of 4 Hit Dice or fewer).')).toBe(
      'Up to 2d8 Hit Dice (creatures of 4 Hit Dice or fewer).',
    );
  });
});

describe('readInventory', () => {
  it('keeps masked names and the IDs commands take', () => {
    const inventory = readInventory({
      items: [
        {
          instance_type: 'magic_item',
          instance_id: 'magic-item-0001',
          display: 'a potion',
          quantity: 1,
          identified: false,
        },
        {
          instance_type: 'item',
          template: { id: 'torch', name: 'Torches (6)', item_type: 'gear' },
          quantity: 6,
        },
      ],
      wielded: [
        { instance_type: 'item', template: { id: 'sword', name: 'Sword', item_type: 'weapon' }, quantity: 1 },
      ],
      valuables: [
        { instance_type: 'valuable', instance_id: 'valuable-0001', kind: 'gem', name: '', value_gp: 50 },
      ],
      purse: { gp: 12 },
    });
    expect(inventory.pack.map((e) => [e.name, e.commandId, e.identified])).toEqual([
      ['Potion', 'magic-item-0001', false],
      ['6 torches', 'torch', true],
    ]);
    expect(inventory.wielded[0]).toMatchObject({ name: 'Sword', commandId: 'sword' });
    expect(inventory.valuables[0]).toMatchObject({ name: 'Gem', valueGp: 50, commandId: 'valuable-0001' });
    expect(inventory.purse).toEqual({ pp: 0, gp: 12, ep: 0, sp: 0, cp: 0 });
  });
});

describe('moveTo', () => {
  it('moves one member and keeps the rest in order', () => {
    expect(moveTo(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveTo(['a', 'b'], 0, 3)).toEqual(['a', 'b']);
  });
});

describe('PartyPanel', () => {
  it('lists the party in marching order and opens a sheet', async () => {
    const { user, snapshot } = renderWithTable(<PartyPanel />);
    const party = snapshot.game?.view.party ?? [];
    const rows = screen.getAllByRole('button', { description: /Opens the character sheet/ });
    expect(rows).toHaveLength(party.length);
    // Each row's button shows only the name, so its accessible name is exactly its visible text (axe's
    // label-in-name check), and everything else the row shows goes in the description.
    party.forEach((member, index) => {
      const row = rows[index] as HTMLElement;
      expect(row).toHaveAccessibleName(member.name);
      expect(row.textContent).toBe(member.name);
    });
    expect(rows[0]).toHaveAccessibleDescription(
      /^(You|.+), level \d+ .+, \d+ of \d+ hit points, armour class/,
    );
    await user.click(rows[1] as HTMLElement);
    expect(useTableUi.getState().sheetMemberId).toBe(party[1]?.id);
  });

  it('names each row with only the text its button shows, whatever state the member is in', () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const game = snapshot.game;
    if (!game) throw new Error('fixture has no game');
    const [brenna, wren, osric] = game.view.party;
    if (!brenna || !wren || !osric) throw new Error('fixture party is too small');
    Object.assign(brenna, { current_hp: 0, conditions: ['dead'] });
    Object.assign(wren, { current_hp: 0, conditions: ['unconscious'] });
    Object.assign(osric, { conditions: ['paralyzed'] });
    game.seats = game.seats.map((seat) => (seat.member_id === osric.id ? { ...seat, user_id: null } : seat));
    renderWithTable(<PartyPanel />, { snapshot });
    const rows = screen.getAllByRole('button', { description: /Opens the character sheet/ });
    game.view.party.forEach((member, index) => {
      expect(rows[index]).toHaveAccessibleName(member.name);
      expect(rows[index]?.textContent).toBe(member.name);
    });
    expect(rows[0]).toHaveAccessibleDescription(/0 of \d+ hit points, armour class -?\d+, dead\./);
    expect(rows[1]).toHaveAccessibleDescription(/unconscious/);
    expect(rows[2]).toHaveAccessibleDescription(/^empty seat, .*paralysed/);
  });

  it('lets the caller move a member back with the keyboard', async () => {
    const api = createFakeApi();
    const snapshot = fixtureSnapshot('exploring', 'player');
    api.sendCommand.mockResolvedValue(accepted(snapshot));
    const { user, store } = renderWithTable(<PartyPanel />, { api, snapshot });
    const ids = (snapshot.game?.view.party ?? []).map((m) => m.id);
    await user.click(screen.getByRole('button', { name: 'Change order' }));
    const handle = screen.getByRole('button', { name: /place 1 of/ });
    handle.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalled());
    expect(api.sendCommand).toHaveBeenCalledWith(
      store.getState().tableId,
      { command_type: 'reorder_party', order: [ids[1], ids[0], ...ids.slice(2)] },
      snapshot.game?.revision,
    );
  });
});

describe('marching order reasons', () => {
  it('says why the first member cannot move forward and the last cannot move back', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const party = snapshot.game?.view.party ?? [];
    const first = party[0];
    const last = party[party.length - 1];
    const { user } = renderWithTable(<PartyPanel />, { snapshot });
    await user.click(screen.getByRole('button', { name: 'Change order' }));
    const forward = screen.getByRole('button', { name: `Move ${first?.name} forward` });
    expect(forward).toHaveAttribute('aria-disabled', 'true');
    expect(forward).toHaveAccessibleDescription(`${first?.name} is already first in the marching order.`);
    const back = screen.getByRole('button', { name: `Move ${last?.name} back` });
    expect(back).toHaveAttribute('aria-disabled', 'true');
    expect(back).toHaveAccessibleDescription(`${last?.name} is already last in the marching order.`);
    expect(screen.getByRole('button', { name: `Move ${party[1]?.name} forward` })).toBeEnabled();
  });
});

describe('CharacterSheet', () => {
  it("shows the member's numbers from the view", async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const brenna = snapshot.game?.view.party[0];
    renderWithTable(<CharacterSheet memberId={brenna?.id ?? null} onClose={() => {}} />, { snapshot });
    expect((await screen.findAllByRole('heading', { name: brenna?.name })).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: `Armour class ${brenna?.armour_class}` })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: new RegExp(`^Strength ${brenna?.scores.str}`) }),
    ).toBeInTheDocument();
    expect(screen.getByText('You play this character')).toBeInTheDocument();
  });

  it('unequips a worn item for a member in the player’s seat', async () => {
    const api = createFakeApi();
    const snapshot = fixtureSnapshot('exploring', 'player');
    api.sendCommand.mockResolvedValue(accepted(snapshot));
    const brenna = snapshot.game?.view.party[0];
    const { user, store } = renderWithTable(
      <CharacterSheet memberId={brenna?.id ?? null} onClose={() => {}} />,
      { api, snapshot },
    );
    await user.click(await screen.findByRole('tab', { name: 'Inventory' }));
    const armour = screen.getByText('Armour').closest('div') as HTMLElement;
    await user.click(within(armour).getByRole('button', { name: 'Unequip' }));
    expect(api.sendCommand).toHaveBeenCalledWith(
      store.getState().tableId,
      { command_type: 'unequip_item', character_id: brenna?.id, item_id: 'leather' },
      snapshot.game?.revision,
    );
  });

  it("disables actions for a member in another player's seat and says why", async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const osric = snapshot.game?.view.party.find((m) => m.name === 'Osric');
    const { user } = renderWithTable(<CharacterSheet memberId={osric?.id ?? null} onClose={() => {}} />, {
      snapshot,
    });
    await user.click(await screen.findByRole('tab', { name: 'Inventory' }));
    expect(screen.getByText(/^Only Ruth, who plays Osric, can act for Osric\./)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Unequip' });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(
        /^Only Ruth, who plays Osric, can have Osric take off an item\./,
      );
    }
  });

  it('says what to choose while nothing is chosen to give or drop', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const brenna = snapshot.game?.view.party[0];
    const { user } = renderWithTable(<CharacterSheet memberId={brenna?.id ?? null} onClose={() => {}} />, {
      snapshot,
    });
    await user.click(await screen.findByRole('tab', { name: 'Inventory' }));
    await user.click(screen.getByRole('button', { name: 'Drop' }));
    const dialog = await screen.findByRole('dialog', { name: /Drop from/ });
    const submit = within(dialog).getByRole('button', { name: 'Drop' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).toHaveAccessibleDescription('Choose at least one item or some coins to drop.');
    await user.click(within(dialog).getByRole('button', { name: 'More torches' }));
    expect(within(dialog).getByRole('button', { name: 'Drop' })).not.toHaveAttribute('aria-disabled');
  });

  it('gives items one unit per entry with the coins', async () => {
    const api = createFakeApi();
    const snapshot = fixtureSnapshot('exploring', 'player');
    api.sendCommand.mockResolvedValue(accepted(snapshot));
    const [brenna, wren] = snapshot.game?.view.party ?? [];
    const { user, store } = renderWithTable(
      <CharacterSheet memberId={brenna?.id ?? null} onClose={() => {}} />,
      { api, snapshot },
    );
    await user.click(await screen.findByRole('tab', { name: 'Inventory' }));
    await user.click(screen.getByRole('button', { name: 'Give' }));
    const dialog = await screen.findByRole('dialog', { name: /Give from/ });
    await user.click(within(dialog).getByRole('button', { name: 'More torches' }));
    await user.click(within(dialog).getByRole('button', { name: 'More torches' }));
    await user.click(within(dialog).getByRole('button', { name: 'More gold pieces' }));
    await user.click(within(dialog).getByRole('button', { name: 'Give' }));
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalled());
    const command = api.sendCommand.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(store.getState().tableId).toBe(api.sendCommand.mock.calls[0]?.[0]);
    expect(command).toMatchObject({
      command_type: 'give_items',
      character_id: brenna?.id,
      recipient_id: wren?.id,
      item_ids: ['torch', 'torch'],
      coins: { gp: 1 },
    });
  });
});

describe('StoredCharacterCard', () => {
  it('opens the stored sheet and lets the owner delete the character after confirming', async () => {
    const api = createFakeApi();
    const character = stored as unknown as StoredCharacter;
    api.listCharacters.mockResolvedValue({
      items: [
        { id: character.id, name: character.name, class_id: 'fighter', level: 1, max_hp: 6, created_at: '' },
      ],
    });
    api.getCharacter.mockResolvedValue(character);
    api.deleteCharacter.mockResolvedValue(undefined);
    const { user } = renderWithTable(
      <StoredCharacterCard
        characterId={character.id}
        summary={{ name: character.name, class_id: 'fighter', level: 1 }}
      />,
      { api, snapshot: fixtureSnapshot('lobby', 'player') },
    );
    await user.click(screen.getByRole('button', { name: character.name }));
    expect(await screen.findByRole('group', { name: /^Strength 15/ })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Delete character' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(api.deleteCharacter).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Delete character' }));
    await waitFor(() => expect(api.deleteCharacter).toHaveBeenCalledWith(character.id));
  });
});

describe('rules links', () => {
  it('opens the compendium from the class name', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const brenna = snapshot.game?.view.party[0];
    const { user } = renderWithTable(<CharacterSheet memberId={brenna?.id ?? null} onClose={() => {}} />, {
      snapshot,
    });
    await user.click(await screen.findByRole('button', { name: 'fighter' }));
    expect(useTableUi.getState().compendiumEntry).toEqual({ kind: 'classes', id: 'fighter' });
  });

  it('never links a masked magic item', () => {
    const [entry] = readInventory({
      items: [
        {
          instance_type: 'magic_item',
          instance_id: 'magic-item-0001',
          display: 'a potion',
          identified: false,
        },
      ],
    }).pack;
    expect(entry && entryRule(entry)).toBeNull();
  });
});

describe('party light', () => {
  it("leaves the party light to the map and shows each lit member's light on their row", () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const game = snapshot.game;
    const brenna = game?.view.party[0];
    if (!game || !brenna) throw new Error('no game');
    game.view.effects = [{ character_id: brenna.id, kind: 'light', remaining_rounds: 359 }];
    renderWithTable(<PartyPanel />, { snapshot });
    expect(screen.queryByText('The party has no light.')).toBeNull();
    expect(screen.getByText('Torch, about 6 turns left')).toBeInTheDocument();
  });
});

describe('combat playback', () => {
  it('keeps the hit points from before the round while the round plays back', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const { store } = renderWithTable(<PartyPanel />, { snapshot });
    const game = store.getState().game;
    if (!game) throw new Error('no game');
    const first = game.view.party[0];
    if (!first) throw new Error('no member');
    useCombatStage.getState().setPlaying(true);
    const hurt = {
      ...game,
      revision: game.revision + 1,
      view: {
        ...game.view,
        party: [{ ...first, current_hp: 0, conditions: ['dead'] }, ...game.view.party.slice(1)],
      },
    };
    act(() => store.getState().receiveGame(hurt));
    expect(screen.queryByText('Dead')).toBeNull();
    act(() => useCombatStage.getState().setPlaying(false));
    expect(await screen.findByText('Dead')).toBeInTheDocument();
  });
});

/** The parts of a spell template the spells tab reads. */
function spellTemplate(
  id: string,
  name: string,
  extra: { range?: string; duration?: string; reversed?: { name: string; mode: string } } = {},
) {
  return {
    id,
    name,
    spell_list: 'magic_user',
    level: 1,
    range: extra.range ?? '60 feet',
    duration: extra.duration ?? 'Instant',
    intro: `${name} does something.`,
    modes: [{ key: id, prose: `${name} does something.`, targeting: { mode: 'single' } }],
    reversed_form: extra.reversed
      ? {
          name: extra.reversed.name,
          prose: '',
          modes: [{ key: extra.reversed.mode, prose: '', targeting: { mode: 'single' } }],
        }
      : null,
  };
}

/** An API whose rules catalog has Sleep and Light, and neither of the adventure's bundled spells. */
function spellApi() {
  const api = createFakeApi();
  api.fullCatalog.mockImplementation(async (name) =>
    name === 'spells'
      ? ({
          catalog: name,
          total: 2,
          items: [
            spellTemplate('sleep', 'Sleep', { range: '240’', duration: '4d4 turns' }),
            spellTemplate('light_mu', 'Light', { reversed: { name: 'Darkness', mode: 'darkness' } }),
          ],
        } as never)
      : ({ catalog: name, total: 0, items: [] } as never),
  );
  return api;
}

type ViewMember = NonNullable<ReturnType<typeof fixtureSnapshot>['game']>['view']['party'][number];

/**
 * The town snapshot with one member changed into a caster, and the view's spell maps set. The fixture's Osric is a
 * 1st-level cleric with five empty slots, and Wren is a thief.
 */
function casterSnapshot(
  index: number,
  member: Partial<ViewMember>,
  spells: {
    names?: Record<string, string>;
    levels?: Record<string, number>;
    reversed?: Record<string, string>;
  },
) {
  const snapshot = fixtureSnapshot('town', 'player');
  const view = snapshot.game?.view;
  const base = view?.party[index];
  if (!view || !base) throw new Error('no member');
  const caster = { ...base, memorized_spells: [], learnable_spells: [], ...member };
  view.party[index] = caster;
  view.spell_names = { ...view.spell_names, ...spells.names };
  view.spell_levels = { ...view.spell_levels, ...spells.levels };
  view.reversed_spell_names = { ...view.reversed_spell_names, ...spells.reversed };
  return { snapshot, caster };
}

/** A level 2 magic-user with Sleep and Light in the book, as Wren, who is played by the viewer's user. */
function mageSnapshot(member: Partial<ViewMember> = {}) {
  return casterSnapshot(
    1,
    {
      class_id: 'magic_user',
      class_name: 'Magic-user',
      level: 2,
      spell_slots: [2, 0, 0, 0, 0, 0],
      spell_book: ['sleep', 'light_mu'],
      preparable_spells: ['sleep', 'light_mu'],
      ...member,
    },
    {
      names: { sleep: 'Sleep', light_mu: 'Light' },
      levels: { sleep: 1, light_mu: 1 },
      reversed: { light_mu: 'Darkness' },
    },
  );
}

async function openSpells(user: ReturnType<typeof renderWithTable>['user']) {
  await user.click(await screen.findByRole('tab', { name: 'Spells' }));
}

describe('the spells tab, from the view', () => {
  it("lists a cleric's bundled spell by level with the level's count, and no reversed row", async () => {
    const { snapshot, caster } = casterSnapshot(
      1,
      {
        class_id: 'cleric',
        class_name: 'Cleric',
        level: 2,
        spell_book: [],
        spell_slots: [1, 0, 0, 0, 0],
        preparable_spells: ['cure_light_wounds', 'lantern_ward'],
      },
      {
        names: { cure_light_wounds: 'Cure Light Wounds', lantern_ward: 'Lantern Ward' },
        levels: { cure_light_wounds: 1, lantern_ward: 1 },
        reversed: { lantern_ward: 'Lantern Snuff' },
      },
    );
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api: spellApi(),
    });
    await openSpells(user);
    // With nothing memorized, the one Prepare button is the empty state's.
    expect(screen.getByText('No spells memorized')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Prepare spells' }));
    const dialog = await screen.findByRole('dialog', { name: "Prepare Wren's spells" });
    expect(dialog).not.toHaveAccessibleDescription(/replace/);
    const level = within(dialog).getByRole('region', { name: '1st-level spells' });
    expect(level).toHaveTextContent('0 of 1 slots chosen');
    expect(within(level).getByText('Lantern Ward')).toBeInTheDocument();
    expect(within(level).getByRole('spinbutton', { name: 'Copies of Lantern Ward' })).toBeInTheDocument();
    // A cleric reverses a spell as it's cast, so the dialog has no row for Lantern Snuff.
    expect(within(dialog).queryByText('Lantern Snuff')).toBeNull();
    expect(within(dialog).queryByText('Reversed')).toBeNull();
    const prepare = within(dialog).getByRole('button', { name: 'Prepare spells' });
    expect(prepare).toHaveAttribute('aria-disabled', 'true');
    expect(prepare).toHaveAccessibleDescription('Choose a spell to prepare.');
    await user.click(within(level).getByRole('button', { name: 'More copies of Lantern Ward' }));
    expect(level).toHaveTextContent('1 of 1 slots chosen');
    expect(
      within(level).getByRole('spinbutton', { name: 'Copies of Cure Light Wounds' }),
    ).toHaveAccessibleDescription('No 1st-level slots left.');
  });

  it('gives a book spell with a reverse its own row, and sends the reversed copies', async () => {
    const { snapshot, caster } = mageSnapshot();
    const api = spellApi();
    const game = snapshot.game;
    if (!game) throw new Error('no game');
    api.sendCommand.mockResolvedValue(accepted(snapshot));
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    await user.click(screen.getByRole('button', { name: 'Prepare spells' }));
    const dialog = await screen.findByRole('dialog', { name: "Prepare Wren's spells" });
    // The first choice is one copy of each book spell, which fills both slots.
    expect(within(dialog).getByRole('region', { name: '1st-level spells' })).toHaveTextContent(
      '2 of 2 slots chosen',
    );
    expect(within(dialog).getByText('Reversed')).toBeInTheDocument();
    const darkness = within(dialog).getByRole('spinbutton', { name: 'Copies of Darkness' });
    expect(darkness).toHaveValue('0');
    await user.click(within(dialog).getByRole('button', { name: 'Fewer copies of Light' }));
    await user.click(within(dialog).getByRole('button', { name: 'More copies of Darkness' }));
    await user.click(within(dialog).getByRole('button', { name: 'Prepare spells' }));
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalled());
    expect(api.sendCommand.mock.calls[0]?.[1]).toEqual({
      command_type: 'prepare_spells',
      character_id: caster.id,
      selections: [{ spell_id: 'sleep' }, { spell_id: 'light_mu', reversed: true }],
    });
  });

  it("keeps a refusal in the prepare dialog, as the refusal's sentence alone", async () => {
    const { snapshot, caster } = mageSnapshot();
    const api = spellApi();
    const game = snapshot.game;
    if (!game) throw new Error('no game');
    api.sendCommand.mockResolvedValue({
      accepted: false,
      rejections: [{ code: 'magic.memorize.needs_sleep', params: { character: caster.id } }],
      events: [],
      messages: [],
      game,
    } as unknown as CommandResult);
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    await user.click(screen.getByRole('button', { name: 'Prepare spells' }));
    const dialog = await screen.findByRole('dialog', { name: /Prepare/ });
    await user.click(within(dialog).getByRole('button', { name: 'Prepare spells' }));
    expect(await within(dialog).findByText(/rest/i)).toBeInTheDocument();
    expect(within(dialog).queryByText("Couldn't prepare spells")).toBeNull();
  });

  it("shows a custom caster's slots from the view, without the class catalog", async () => {
    const { snapshot, caster } = casterSnapshot(
      1,
      {
        class_id: 'hedge_mage',
        class_name: 'Hedge Mage',
        level: 2,
        spell_slots: [2, 0, 0, 0, 0, 0],
        spell_book: ['sleep'],
        preparable_spells: ['sleep'],
        memorized_spells: [{ spell_id: 'sleep' }],
      },
      { names: { sleep: 'Sleep' }, levels: { sleep: 1 } },
    );
    const api = spellApi();
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    const slots = screen.getByLabelText('Spell slots');
    expect(slots).toHaveTextContent('1st level1 of 2 memorized');
    expect(slots).not.toHaveTextContent('2nd level');
    expect((await screen.findAllByText('1st level · Range: 240’ · 4d4 turns')).length).toBeGreaterThan(0);
    expect(api.fullCatalog).not.toHaveBeenCalledWith('classes');
  });

  it('says a 1st-level cleric has no spell slots yet, and offers nothing to prepare', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    const osric = snapshot.game?.view.party[2];
    if (!osric) throw new Error('no Osric');
    expect(osric.spell_slots).toEqual([0, 0, 0, 0, 0]);
    const { user } = renderWithTable(<CharacterSheet memberId={osric.id} onClose={() => {}} />, {
      snapshot,
      api: spellApi(),
    });
    await openSpells(user);
    expect(screen.getByText('No spell slots yet')).toBeInTheDocument();
    expect(screen.queryByLabelText('Spell slots')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prepare spells' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Spell book' })).toBeNull();
  });

  it('learns a bundled spell from the list bxapi gives', async () => {
    const { snapshot, caster } = mageSnapshot({ learnable_spells: ['ember_dart'] });
    if (snapshot.game) {
      snapshot.game.view.spell_names.ember_dart = 'Ember Dart';
      snapshot.game.view.spell_levels.ember_dart = 1;
    }
    const api = spellApi();
    api.getSessionSpell.mockResolvedValue(spellTemplate('ember_dart', 'Ember Dart') as never);
    api.sendCommand.mockResolvedValue(accepted(snapshot));
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    await user.click(screen.getByRole('button', { name: 'Learn a spell' }));
    const dialog = await screen.findByRole('dialog', { name: 'Learn a spell' });
    expect(dialog).toHaveAccessibleDescription("Choose a spell to write into Wren's spell book.");
    const learn = within(dialog).getByRole('button', { name: 'Learn spell' });
    expect(learn).toHaveAccessibleDescription('Choose a spell first.');
    await user.click(within(dialog).getByRole('combobox', { name: 'Spell' }));
    const option = await screen.findByRole('option', { name: /Ember Dart/ });
    expect(option).toHaveTextContent('1st level');
    await user.click(option);
    await user.click(within(dialog).getByRole('button', { name: 'Learn Ember Dart' }));
    await waitFor(() =>
      expect(api.sendCommand.mock.calls[0]?.[1]).toEqual({
        command_type: 'learn_spell',
        character_id: caster.id,
        spell_id: 'ember_dart',
      }),
    );
  });

  it('disables Learn a spell with a reason when bxapi lists nothing to learn', async () => {
    const { snapshot, caster } = mageSnapshot({ learnable_spells: [] });
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api: spellApi(),
    });
    await openSpells(user);
    const learn = screen.getByRole('button', { name: 'Learn a spell' });
    expect(learn).toHaveAttribute('aria-disabled', 'true');
    expect(learn).toHaveAccessibleDescription("Wren can't learn a new spell now.");
  });

  it("loads a bundled spell's details from the game, and names it without a rules link", async () => {
    const { snapshot, caster } = mageSnapshot({
      spell_book: ['ember_dart'],
      preparable_spells: ['ember_dart'],
      memorized_spells: [{ spell_id: 'ember_dart' }],
    });
    if (snapshot.game) {
      snapshot.game.view.spell_names.ember_dart = 'Ember Dart';
      snapshot.game.view.spell_levels.ember_dart = 1;
    }
    const api = spellApi();
    api.getSessionSpell.mockResolvedValue(spellTemplate('ember_dart', 'Ember Dart') as never);
    const { user, store } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    const memorized = screen.getByRole('heading', { name: 'Memorized spells' }).closest('section');
    if (!memorized) throw new Error('no section');
    expect(await within(memorized).findByText('1st level · Range: 60 feet · Instant')).toBeInTheDocument();
    expect(api.getSessionSpell).toHaveBeenCalledWith(store.getState().tableId, 'ember_dart');
    expect(within(memorized).queryByRole('button', { name: 'Ember Dart' })).toBeNull();
    expect(within(memorized).getByText('Ember Dart')).toBeInTheDocument();
  });

  it("says when a bundled spell's details didn't load, and keeps its level", async () => {
    const { snapshot, caster } = mageSnapshot({
      spell_book: ['ember_dart'],
      preparable_spells: ['ember_dart'],
      memorized_spells: [{ spell_id: 'ember_dart' }],
    });
    if (snapshot.game) {
      snapshot.game.view.spell_names.ember_dart = 'Ember Dart';
      snapshot.game.view.spell_levels.ember_dart = 1;
    }
    const api = spellApi();
    api.getSessionSpell.mockRejectedValue(new Error('offline'));
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    const memorized = screen.getByRole('heading', { name: 'Memorized spells' }).closest('section');
    if (!memorized) throw new Error('no section');
    await waitFor(() => expect(api.getSessionSpell).toHaveBeenCalled());
    // The card's meta line keeps the level from the view, beside the slot display's own "1st level".
    await waitFor(() => expect(within(memorized).getAllByText('1st level')).toHaveLength(2));
    expect(within(memorized).queryByText(/Range:/)).toBeNull();
    await user.click(within(memorized).getByRole('button', { name: 'About Ember Dart' }));
    expect(
      await screen.findByText("This spell's details didn't load. Try again in a moment."),
    ).toBeInTheDocument();
  });

  it("casts a cleric's spell in reverse with the reversed form's own mode", async () => {
    const { snapshot, caster } = casterSnapshot(
      1,
      {
        class_id: 'cleric',
        class_name: 'Cleric',
        level: 2,
        spell_book: [],
        spell_slots: [1, 0, 0, 0, 0],
        preparable_spells: ['lantern_ward'],
        memorized_spells: [{ spell_id: 'lantern_ward' }],
      },
      {
        names: { lantern_ward: 'Lantern Ward' },
        levels: { lantern_ward: 1 },
        reversed: { lantern_ward: 'Lantern Snuff' },
      },
    );
    const api = spellApi();
    api.getSessionSpell.mockResolvedValue(
      spellTemplate('lantern_ward', 'Lantern Ward', {
        reversed: { name: 'Lantern Snuff', mode: 'snuff' },
      }) as never,
    );
    api.sendCommand.mockResolvedValue(accepted(snapshot));
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    await user.click(screen.getByRole('button', { name: 'Cast' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cast Lantern Ward' });
    expect(dialog).not.toHaveAccessibleDescription(/round/);
    const cast = within(dialog).getByRole('button', { name: 'Cast' });
    expect(cast).toHaveAccessibleDescription('Choose a target first.');
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Cast Lantern Snuff instead' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Target' }));
    await user.click(await screen.findByRole('option', { name: 'Brenna' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cast' }));
    await waitFor(() =>
      expect(api.sendCommand.mock.calls[0]?.[1]).toEqual({
        command_type: 'cast_spell',
        character_id: caster.id,
        spell_id: 'lantern_ward',
        mode: 'snuff',
        reversed: true,
        targets: ['character-0001'],
      }),
    );
  });

  it('leaves out a memorized copy of a spell bxapi no longer lists as preparable', async () => {
    const { snapshot, caster } = casterSnapshot(
      1,
      {
        class_id: 'magic_user',
        class_name: 'Magic-user',
        level: 1,
        spell_slots: [1, 0, 0, 0, 0, 0],
        spell_book: ['sleep'],
        preparable_spells: ['sleep'],
        memorized_spells: [{ spell_id: 'foreign_spell' }],
      },
      { names: { sleep: 'Sleep' }, levels: { sleep: 1 } },
    );
    const api = spellApi();
    api.sendCommand.mockResolvedValue(accepted(snapshot));
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    await user.click(screen.getByRole('button', { name: 'Prepare spells' }));
    const dialog = await screen.findByRole('dialog', { name: "Prepare Wren's spells" });
    expect(within(dialog).getByRole('region', { name: '1st-level spells' })).toHaveTextContent(
      '0 of 1 slots chosen',
    );
    expect(within(dialog).getByRole('button', { name: 'Prepare spells' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(within(dialog).getByRole('button', { name: 'More copies of Sleep' }));
    await user.click(within(dialog).getByRole('button', { name: 'Prepare spells' }));
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalled());
    expect(api.sendCommand.mock.calls[0]?.[1]).toEqual({
      command_type: 'prepare_spells',
      character_id: caster.id,
      selections: [{ spell_id: 'sleep' }],
    });
  });

  it('sends only the spells the prepare dialog still shows after the view changes under it', async () => {
    const { snapshot, caster } = casterSnapshot(
      1,
      {
        class_id: 'magic_user',
        class_name: 'Magic-user',
        level: 3,
        spell_slots: [1, 1, 0, 0, 0, 0],
        spell_book: ['sleep', 'web'],
        preparable_spells: ['sleep', 'web'],
        memorized_spells: [{ spell_id: 'sleep' }, { spell_id: 'web' }],
      },
      { names: { sleep: 'Sleep', web: 'Web' }, levels: { sleep: 1, web: 2 } },
    );
    const api = spellApi();
    api.getSessionSpell.mockResolvedValue(spellTemplate('web', 'Web') as never);
    api.sendCommand.mockResolvedValue(accepted(snapshot));
    const { user, store } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    await user.click(screen.getByRole('button', { name: 'Prepare spells' }));
    const dialog = await screen.findByRole('dialog', { name: "Prepare Wren's spells" });
    expect(within(dialog).getByRole('region', { name: '2nd-level spells' })).toBeInTheDocument();
    const game = store.getState().game;
    if (!game) throw new Error('no game');
    const changed = {
      ...game,
      revision: game.revision + 1,
      view: {
        ...game.view,
        party: game.view.party.map((m) =>
          m.id === caster.id ? { ...m, spell_slots: [1, 0, 0, 0, 0, 0], preparable_spells: ['sleep'] } : m,
        ),
      },
    };
    act(() => store.getState().receiveGame(changed));
    expect(within(dialog).queryByRole('region', { name: '2nd-level spells' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Prepare spells' }));
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalled());
    expect(api.sendCommand.mock.calls[0]?.[1]).toEqual({
      command_type: 'prepare_spells',
      character_id: caster.id,
      selections: [{ spell_id: 'sleep' }],
    });
  });

  it('moves focus to the memorized spells heading when the first preparation removes its button', async () => {
    const { snapshot, caster } = mageSnapshot();
    const api = spellApi();
    const game = snapshot.game;
    if (!game) throw new Error('no game');
    const prepared = {
      ...game,
      revision: game.revision + 1,
      view: {
        ...game.view,
        party: game.view.party.map((m) =>
          m.id === caster.id
            ? { ...m, memorized_spells: [{ spell_id: 'sleep' }, { spell_id: 'light_mu' }] }
            : m,
        ),
      },
    };
    api.sendCommand.mockResolvedValue({
      accepted: true,
      rejections: [],
      events: [],
      messages: [],
      game: prepared,
    } as unknown as CommandResult);
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await openSpells(user);
    const opener = screen.getByRole('button', { name: 'Prepare spells' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: "Prepare Wren's spells" });
    await user.click(within(dialog).getByRole('button', { name: 'Prepare spells' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: "Prepare Wren's spells" })).toBeNull());
    expect(opener).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Memorized spells' })).toHaveFocus());
  });

  it('offers a magic-user no reversed form as a book spell is cast, since it was chosen when memorized', async () => {
    const { snapshot, caster } = mageSnapshot({ memorized_spells: [{ spell_id: 'light_mu' }] });
    const { user } = renderWithTable(<CharacterSheet memberId={caster.id} onClose={() => {}} />, {
      snapshot,
      api: spellApi(),
    });
    await openSpells(user);
    await user.click(screen.getByRole('button', { name: 'Cast' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cast Light' });
    // The spell's details load before the form choice could show.
    await within(dialog).findByText('Light does something.');
    expect(within(dialog).queryByRole('checkbox', { name: /instead/ })).toBeNull();
  });

  it('marks the caster in the party panel while the party is in town', async () => {
    const { snapshot, caster } = mageSnapshot();
    const { user } = renderWithTable(<PartyPanel />, { snapshot, api: spellApi() });
    await user.click(await screen.findByRole('button', { name: /^No spells memorized for Wren/ }));
    expect(useTableUi.getState().sheetMemberId).toBe(caster.id);
    expect(useTableUi.getState().sheetTab).toBe('spells');
  });
});

describe('names the player view states', () => {
  /** The exploring snapshot with Brenna as a member of a class the adventure wrote. */
  function customClassSnapshot() {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const party = snapshot.game?.view.party ?? [];
    const brenna = party[0];
    if (!brenna) throw new Error('no Brenna');
    party[0] = { ...brenna, class_id: 'hollow_knight', class_name: 'Hollow knight' };
    return { snapshot, brenna: party[0] };
  }

  it('shows a custom class on the sheet and in the party panel', async () => {
    const { snapshot, brenna } = customClassSnapshot();
    renderWithTable(<CharacterSheet memberId={brenna.id} onClose={() => {}} />, { snapshot });
    expect(await screen.findByRole('button', { name: 'hollow knight' })).toBeInTheDocument();
  });

  it('describes a party row with the view’s class name', () => {
    const { snapshot } = customClassSnapshot();
    renderWithTable(<PartyPanel />, { snapshot });
    const row = screen.getAllByRole('button', { description: /Opens the character sheet/ })[0];
    expect(row).toHaveAccessibleDescription(/level \d+ hollow knight/);
  });

  it('keeps the capitals of a proper name inside a custom class name', () => {
    const { snapshot } = customClassSnapshot();
    const party = snapshot.game?.view.party ?? [];
    const brenna = party[0];
    if (!brenna) throw new Error('no Brenna');
    party[0] = { ...brenna, class_name: 'Warlock of Sarn' };
    renderWithTable(<PartyPanel />, { snapshot });
    const row = screen.getAllByRole('button', { description: /Opens the character sheet/ })[0];
    expect(row).toHaveAccessibleDescription(/level \d+ warlock of Sarn/);
  });

  it('names a spell the adventure bundles, and the reverse of a spell, from the view', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const view = snapshot.game?.view;
    const wren = view?.party[1];
    if (!view || !wren) throw new Error('no Wren');
    view.party[1] = {
      ...wren,
      class_id: 'magic_user',
      spell_book: ['ember_lash', 'light_mu'],
      memorized_spells: [{ spell_id: 'light_mu', reversed: true }, { spell_id: 'ember_lash' }],
    };
    view.spell_names = { ember_lash: 'Ember Lash', light_mu: 'Light' };
    view.reversed_spell_names = { light_mu: 'Darkness' };
    const { user } = renderWithTable(<CharacterSheet memberId={wren.id} onClose={() => {}} />, {
      snapshot,
    });
    await user.click(await screen.findByRole('tab', { name: 'Spells' }));
    const memorized = await screen.findByRole('heading', { name: 'Memorized spells' });
    const section = memorized.closest('section');
    if (!section) throw new Error('no section');
    expect(within(section).getByText('Ember Lash')).toBeInTheDocument();
    expect(within(section).getByText('Darkness')).toBeInTheDocument();
    expect(within(section).queryByText(/ember_lash|light_mu/i)).toBeNull();
    const book = screen.getByRole('heading', { name: 'Spell book' }).closest('section');
    if (!book) throw new Error('no book');
    expect(within(book).getByText('Ember Lash')).toBeInTheDocument();
  });

  it('names an effect that is a spell by the view’s spell name', () => {
    const ctx = emptyContext();
    ctx.spells.ember_lash = 'Ember Lash';
    expect(effectLabel('ember_lash', ctx)).toBe('Ember Lash');
    expect(effectLabel('light', ctx)).toBe('Light');
    expect(effectLabel('protection_from_evil')).toBe('Protection from evil');
  });
});
