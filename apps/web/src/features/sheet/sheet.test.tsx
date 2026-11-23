import type { CommandResult, StoredCharacter } from '@bxvtt/shared/protocol';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMyCharacters } from '@/app';
import { useCombatStage, useTableUi } from '@/app';
import catalog from '../wizard/__fixtures__/catalog.json';
import stored from '../wizard/__fixtures__/stored.json';
import { StoredCharacterCard } from './StoredCharacterCard';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { CharacterSheet } from './CharacterSheet';
import { entryRule } from './InventoryTab';
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
    expect(screen.getByText(/Only Ruth, who plays Osric, can have Osric /)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'Unequip' })) expect(button).toBeDisabled();
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
    await user.click(screen.getByRole('button', { name: `${character.name}, open the character sheet` }));
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
    await user.click(await screen.findByRole('button', { name: 'Fighter in the rules reference' }));
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

describe('a caster with nothing memorized', () => {
  /** The exploring snapshot with Wren as a magic-user who knows Sleep and has memorized nothing. */
  function casterSnapshot(stage: 'exploring' | 'town') {
    const snapshot = fixtureSnapshot(stage, 'player');
    const party = snapshot.game?.view.party ?? [];
    const wren = party[1];
    if (!wren) throw new Error('no Wren');
    party[1] = { ...wren, class_id: 'magic_user', spell_book: ['sleep'], memorized_spells: [] };
    return { snapshot, wren: party[1] };
  }
  function casterApi() {
    const api = createFakeApi();
    api.rules.mockImplementation(async (path: string) =>
      path === 'spells'
        ? { items: catalog.spells.items, total: catalog.spells.items.length, limit: 200, offset: 0 }
        : { items: [], total: 0, limit: 200, offset: 0 },
    );
    api.fullCatalog.mockImplementation(async (name) =>
      name === 'classes'
        ? ({ catalog: name, total: 1, items: [catalog.details.magic_user] } as never)
        : ({ catalog: name, total: 0, items: [] } as never),
    );
    return api;
  }

  it('says why the caster cannot cast and keeps a refusal in the prepare dialog', async () => {
    const { snapshot, wren } = casterSnapshot('exploring');
    const api = casterApi();
    const game = snapshot.game;
    if (!game) throw new Error('no game');
    api.sendCommand.mockResolvedValue({
      accepted: false,
      rejections: [{ code: 'magic.memorize.needs_sleep', params: { character: wren.id } }],
      events: [],
      messages: [],
      game,
    } as unknown as CommandResult);
    const { user } = renderWithTable(<CharacterSheet memberId={wren.id} onClose={() => {}} />, {
      snapshot,
      api,
    });
    await user.click(await screen.findByRole('tab', { name: 'Spells' }));
    expect(
      await screen.findByText("Wren knows Sleep but hasn't memorized it, so they can't cast it yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("A caster prepares spells after a night's rest.")).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Prepare spells' })[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: /Prepare/ });
    // One copy of Sleep fills the one first-level slot, so the count can't go higher.
    expect(within(dialog).getByRole('button', { name: 'More copies of Sleep' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Prepare spells' }));
    // The refusal stays in the dialog, where the player can change the choice.
    expect(await within(dialog).findByText(/rest/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Prepare/ })).toBeInTheDocument();
    expect(api.sendCommand).toHaveBeenCalledWith(
      expect.any(String),
      { command_type: 'prepare_spells', character_id: wren.id, selections: expect.any(Array) },
      game.revision,
    );
  });

  it('marks the caster in the party panel while the party is in town', async () => {
    const { snapshot, wren } = casterSnapshot('town');
    const { user } = renderWithTable(<PartyPanel />, { snapshot, api: casterApi() });
    await user.click(await screen.findByRole('button', { name: /^No spells memorized for Wren/ }));
    expect(useTableUi.getState().sheetMemberId).toBe(wren.id);
    expect(useTableUi.getState().sheetTab).toBe('spells');
  });
});
