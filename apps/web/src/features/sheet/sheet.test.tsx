import type { CommandResult, StoredCharacter } from '@bxvtt/shared/protocol';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMyCharacters } from '@/app';
import { useCombatStage, useTableUi } from '@/app';
import stored from '../wizard/__fixtures__/stored.json';
import { StoredCharacterCard } from './StoredCharacterCard';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { CharacterSheet } from './CharacterSheet';
import { lightPhrase } from './actions';
import { entryRule } from './InventoryTab';
import { readInventory } from './model';
import { PartyPanel, moveTo } from './PartyPanel';

function accepted(snapshot: ReturnType<typeof fixtureSnapshot>): CommandResult {
  const game = snapshot.game;
  if (!game) throw new Error('The fixture has no game.');
  return { accepted: true, rejections: [], events: [], messages: [], game } as unknown as CommandResult;
}

beforeEach(() => resetMyCharacters());

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
      ['A potion', 'magic-item-0001', false],
      ['6 torches', 'torch', true],
    ]);
    expect(inventory.wielded[0]?.commandId).toBe('sword');
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
    party.forEach((member, index) => expect(rows[index]).toHaveAccessibleName(new RegExp(`^${member.name}`)));
    // The name starts with what the row shows, and the numbers go in the description.
    expect(rows[0]).toHaveAccessibleDescription(/hit points, armour class/);
    await user.click(rows[1] as HTMLElement);
    expect(useTableUi.getState().sheetMemberId).toBe(party[1]?.id);
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
    expect(
      screen.getByText(/Only the player in Osric's seat or the referee can act for Osric/),
    ).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: `Open ${character.name}'s sheet` }));
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
  it('speaks of light only while the party is in a dungeon', () => {
    const { unmount } = renderWithTable(<PartyPanel />, { snapshot: fixtureSnapshot('town', 'player') });
    expect(screen.queryByText('The party has no light.')).toBeNull();
    unmount();
    renderWithTable(<PartyPanel />, { snapshot: fixtureSnapshot('exploring', 'player') });
    expect(screen.getByText('The party has no light.')).toBeInTheDocument();
  });

  it('words a burning light the way the map does', () => {
    expect(lightPhrase('Brenna', 359)).toBe("Brenna's light, about 6 turns left");
    expect(lightPhrase('Brenna', 12, 'torch')).toBe("Brenna's torch, 12 rounds left");
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
