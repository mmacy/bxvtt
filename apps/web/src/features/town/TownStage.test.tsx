import type { GameEvent } from '@bxvtt/shared/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { ShortcutLayer } from '@/app';
import { ActionBar } from '@/ui';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureSnapshot, type Snapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { resetDungeonCache } from './hooks';
import {
  accepted,
  gameEntry,
  giveValuables,
  makeCaster,
  partyWithPackItem,
  refused,
  stubCatalog,
} from './testKit';
import { useTableUi } from '@/app';
import { TownActions } from './TownActions';
import { TownStage } from './TownStage';
import { useTownUi } from './townUi';

const ADVENTURES = {
  items: [
    {
      id: 'sample:the-drowned-bell',
      source: 'sample',
      info: { name: 'The Drowned Bell', dungeons: [{ id: 'priory', name: "The priory on Corvane's Holm" }] },
      uploaded_by: null,
      uploaded_at: null,
    },
  ],
};

function event(fields: Record<string, unknown>): GameEvent {
  return { visibility: 'player', ...fields } as unknown as GameEvent;
}

function setup(snapshot: Snapshot = fixtureSnapshot('town', 'player')) {
  const api = createFakeApi();
  stubCatalog(api, ADVENTURES);
  return { ...renderWithTable(<TownStage />, { snapshot, api }), api, snapshot };
}

beforeEach(() => {
  useTownUi.getState().reset();
  resetDungeonCache();
});

describe('the town square', () => {
  it('leaves the game clock to the top bar', () => {
    setup();
    expect(screen.queryByText(/^Day \d+, \d\d:\d\d$/)).not.toBeInTheDocument();
  });

  it('shows the town, what it offers, and the party', async () => {
    setup();
    expect(screen.getByRole('heading', { level: 2, name: 'Hollin Ferry' })).toBeInTheDocument();
    expect(screen.getByText(/huddle of reed-thatched houses/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Ostler's store" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Brenna' })).toBeInTheDocument();
    expect(await screen.findByText("The priory on Corvane's Holm")).toBeInTheDocument();
    expect(screen.getByText('Break the Red Thumbs')).toBeInTheDocument();
    expect(screen.getByText('Now: Kill Gashnak One-Ear')).toBeInTheDocument();
  });

  it("hides a tab for a service the town doesn't list", () => {
    const snapshot = fixtureSnapshot('town', 'player');
    if (!snapshot.game) throw new Error('No game.');
    snapshot.game.view.town_services = ["Hob Tanner's smithy and store: weapons, armour, and gear"];
    setup(snapshot);
    expect(screen.getByRole('tab', { name: 'Outfitter' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Temple' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Treasure buyers' })).not.toBeInTheDocument();
  });

  it('shows a tab only for a service whose command is legal', () => {
    const snapshot = fixtureSnapshot('town', 'player');
    if (!snapshot.game) throw new Error('No game.');
    snapshot.game.commands = snapshot.game.commands.filter(
      (command) => command.command_type !== 'purchase_equipment' && command.command_type !== 'sell_treasure',
    );
    setup(snapshot);
    expect(screen.queryByRole('tab', { name: 'Outfitter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Treasure buyers' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Temple' })).toBeInTheDocument();
  });

  it('says who the caller is to someone who may not lead the party out', async () => {
    const snapshot = fixtureSnapshot('town', 'referee');
    if (!snapshot.game) throw new Error('No game.');
    // Ruth is the referee and may act, so look at the same table as a player who is not the caller.
    const player = fixtureSnapshot('town', 'player');
    if (!player.game) throw new Error('No game.');
    player.game.caller_user_id = snapshot.user.id;
    const settings = player.table.settings;
    player.table = { ...player.table, settings: { ...settings, caller_user_id: snapshot.user.id } };
    setup(player);
    const reason = /^Only the caller can enter a dungeon\. Ruth is the caller\./;
    expect(await screen.findByText(reason)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'Set out' })) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(reason);
    }
  });
});

describe('leaving town', () => {
  it('names the dungeon, lists what the party might want, and sends enter_dungeon', async () => {
    const { api, user, store } = setup();
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    api.sendCommand.mockResolvedValue(accepted(game));
    await user.click(await screen.findByRole('button', { name: 'Set out' }));
    const dialog = await screen.findByRole('dialog', { name: "Set out for the priory on Corvane's Holm?" });
    expect(within(dialog).getByText('Tinder box')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Set out' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'enter_dungeon', dungeon_id: 'priory' },
        game.revision,
      ),
    );
  });

  it("shows bxapi's refusal inside the dialog", async () => {
    const { api, user, store } = setup();
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    api.sendCommand.mockResolvedValue(refused(game, 'session.command.wrong_mode', { mode: 'exploring' }));
    await user.click(await screen.findByRole('button', { name: 'Set out' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Set out' }));
    expect(await within(dialog).findByText("Can't set out")).toBeInTheDocument();
  });
});

describe('the outfitter', () => {
  it('buys several lots in one command and offers to equip a weapon', async () => {
    const { api, user, store } = setup();
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    expect(await screen.findByRole('button', { name: 'Add Torches (6) to the cart' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Torches (6) to the cart' }));
    await user.click(screen.getByRole('button', { name: 'Add one lot of torches' }));
    await user.click(screen.getByRole('button', { name: 'Add Sword to the cart' }));
    const cart = screen.getByRole('list', { name: 'Cart' });
    expect(within(cart).getByText('Comes as 12 torches')).toBeInTheDocument();
    expect(screen.getByText('12 gp')).toBeInTheDocument();

    api.sendCommand.mockResolvedValue(
      accepted(
        game,
        [
          event({
            event_type: 'item_acquired',
            code: 'exploration.item.acquired',
            character_id: 'character-0001',
            item_ids: ['sword', 'torch', 'torch'],
            coins_gp_value: 0,
            coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
            origin: 'purchase',
          }),
        ],
        {
          party: partyWithPackItem(game, 'character-0001', {
            id: 'sword',
            name: 'Sword',
            itemType: 'weapon',
          }),
        },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Buy for Brenna' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        {
          command_type: 'purchase_equipment',
          character_id: 'character-0001',
          item_ids: ['sword', 'torch', 'torch'],
        },
        game.revision,
      ),
    );
    expect(await screen.findByRole('region', { name: "Brenna's purchase" })).toBeInTheDocument();
    api.sendCommand.mockResolvedValue(
      refused(game, 'items.equip.weapon_not_allowed', { class: 'cleric', item: 'sword' }),
    );
    await user.click(screen.getByRole('button', { name: 'Wield Sword' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenLastCalledWith(
        store.getState().tableId,
        { command_type: 'equip_item', character_id: 'character-0001', item_id: 'sword' },
        game.revision + 1,
      ),
    );
    expect(await screen.findByText(/can't wield/i, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/^Brenna buys /)).toBeInTheDocument();
    expect(useTownUi.getState().carts['character-0001']).toEqual({});
  });

  it('shows the refusal next to the cart and keeps the cart', async () => {
    const { api, user, store } = setup();
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    await user.click(await screen.findByRole('button', { name: 'Add Leather to the cart' }));
    api.sendCommand.mockResolvedValue(refused(game, 'items.purchase.insufficient_funds', { cost_gp: 20 }));
    await user.click(screen.getByRole('button', { name: 'Buy for Brenna' }));
    expect(await screen.findByText("That costs 20 gp, but you don't have enough gold.")).toBeInTheDocument();
    expect(useTownUi.getState().carts['character-0001']).toEqual({ leather: 1 });
  });

  it('copies one cart to the other members the viewer shops for, and shops for each in turn', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    await user.click(await screen.findByRole('button', { name: 'Add Rope (50’) to the cart' }));
    await user.click(screen.getByRole('button', { name: 'Copy to your other characters' }));
    expect(useTownUi.getState().carts['character-0002']).toEqual({ rope: 1 });
    expect(screen.getByRole('button', { name: 'Buy all carts (2)' })).toBeInTheDocument();
  });

  it('keeps each cart while the viewer visits another part of town', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    await user.click(await screen.findByRole('button', { name: 'Add Rope (50’) to the cart' }));
    await user.click(screen.getByRole('tab', { name: 'Temple' }));
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    expect(await screen.findByRole('list', { name: 'Cart' })).toHaveTextContent('Rope (50’)');
  });

  it('buys every cart in turn and names the member whose purchase was refused', async () => {
    const snapshot = fixtureSnapshot('town', 'referee');
    const { api, user, store } = setup(snapshot);
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    api.sendCommand
      .mockResolvedValueOnce(accepted(game))
      .mockResolvedValueOnce(refused(game, 'items.purchase.insufficient_funds', { cost_gp: 20 }));
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    await user.click(await screen.findByRole('button', { name: 'Add Rope (50’) to the cart' }));
    await user.click(screen.getByRole('button', { name: 'Copy to your other characters' }));
    await user.click(screen.getByRole('button', { name: /^Buy all carts/ }));
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledTimes(4), { timeout: 3000 });
    const ids = api.sendCommand.mock.calls.map((call) => (call[1] as { character_id?: string }).character_id);
    expect(ids).toEqual(['character-0001', 'character-0002', 'character-0003', 'character-0004']);
  });

  it('copies a cart only to members who can shop, and says who it skipped', async () => {
    const snapshot = fixtureSnapshot('town', 'referee');
    const osric = snapshot.game?.view.party.find((member) => member.name === 'Osric');
    if (!osric) throw new Error('No Osric.');
    osric.conditions = ['dead'];
    osric.current_hp = 0;
    const { user } = setup(snapshot);
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    await user.click(await screen.findByRole('button', { name: 'Add Rope (50’) to the cart' }));
    await user.click(screen.getByRole('button', { name: 'Copy to your other characters' }));
    expect(screen.getByText('Skips Osric, who is dead.')).toBeInTheDocument();
    expect(useTownUi.getState().carts['character-0003']).toBeUndefined();
    expect(useTownUi.getState().carts['character-0004']).toEqual({ rope: 1 });
  });

  it("offers only the viewer's own members as buyers", async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    const group = await screen.findByRole('group', { name: 'Shopping for' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([expect.stringContaining('Brenna'), expect.stringContaining('Wren')]);
  });

  it('filters by search and type', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    await screen.findByRole('button', { name: 'Add Sword to the cart' });
    expect(screen.getByRole('button', { name: /^Sword, 1d8, melee, show details$/ })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search equipment' }), 'rope');
    expect(screen.queryByRole('button', { name: 'Add Sword to the cart' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Rope (50’) to the cart' })).toBeInTheDocument();
  });
});

describe('the temple', () => {
  function hurtParty(snapshot: Snapshot) {
    const party = snapshot.game?.view.party ?? [];
    const [, wren, osric] = party;
    if (!wren || !osric) throw new Error('The fixture party changed.');
    wren.current_hp = 1;
    osric.conditions = ['dead'];
    osric.current_hp = 0;
  }

  it('lists the members who need help first, and prices from the town', async () => {
    const snapshot = fixtureSnapshot('town', 'referee');
    hurtParty(snapshot);
    const { user } = setup(snapshot);
    await user.click(screen.getByRole('tab', { name: 'Temple' }));
    const group = await screen.findByRole('group', { name: 'Patient' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent?.slice(0, 5)),
    ).toEqual(['Osric', 'Wren ', 'Brenn', 'Tamsi']);
    expect(screen.getByText('20 gp')).toBeInTheDocument();
    expect(screen.getByText('1,000 gp')).toBeInTheDocument();
  });

  it('sends the service for the chosen patient and explains who pays', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    hurtParty(snapshot);
    const { api, user, store } = setup(snapshot);
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    await user.click(screen.getByRole('tab', { name: 'Temple' }));
    api.sendCommand.mockResolvedValue(
      accepted(game, [
        event({
          event_type: 'healing_purchased',
          code: 'town.healing.purchased',
          character_id: 'character-0002',
          service: 'cure_light_wounds',
          cost_gp: 20,
          payers: ['character-0002'],
          payments_gp: [20],
        }),
      ]),
    );
    expect(screen.getByText(/The whole party shares temple fees/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Buy cure light wounds for Wren' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'purchase_healing', character_id: 'character-0002', service: 'cure_light_wounds' },
        game.revision,
      ),
    );
    expect(
      await screen.findByText('Wren buys cure light wounds at the temple for 20 gp.'),
    ).toBeInTheDocument();
  });

  it("disables a service for a member the viewer can't act for, with the reason", async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    hurtParty(snapshot);
    const { user } = setup(snapshot);
    await user.click(screen.getByRole('tab', { name: 'Temple' }));
    await user.click(await screen.findByRole('button', { name: /^Osric/ }));
    const button = screen.getByRole('button', { name: 'Buy raise dead for Osric' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(/Only Ruth, who plays Osric, can have Osric buy healing/);
    expect(
      screen.getAllByText(/Only Ruth, who plays Osric, can have Osric buy healing/).length,
    ).toBeGreaterThan(0);
  });
});

describe('the treasure buyers', () => {
  it('sells the selected pieces with their instance IDs', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    giveValuables(snapshot, 'Brenna', [
      { id: 'valuable-0001', kind: 'gem', name: 'A river pearl', value: 100 },
      { id: 'valuable-0002', kind: 'jewellery', name: "The abbot's seal ring", value: 900 },
    ]);
    const { api, user, store } = setup(snapshot);
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    await user.click(screen.getByRole('tab', { name: 'Treasure buyers' }));
    expect(await screen.findByText('Widow Marl, moneychanger')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: "The abbot's seal ring" }));
    expect(screen.getByText('1 for 900 gp')).toBeInTheDocument();
    expect(screen.getByText('2 for 1,000 gp')).toBeInTheDocument();
    api.sendCommand.mockResolvedValue(
      accepted(game, [
        event({
          event_type: 'treasure_sold',
          code: 'town.treasure.sold',
          character_id: 'character-0001',
          instance_ids: ['valuable-0002'],
          gp_value: 900,
        }),
      ]),
    );
    await user.click(screen.getByRole('button', { name: 'Sell selected' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'sell_treasure', item_ids: ['valuable-0002'] },
        game.revision,
      ),
    );
    expect(await screen.findByText('Brenna sells a valuable for 900 gp.')).toBeInTheDocument();
  });

  it('says so when nobody carries treasure', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Treasure buyers' }));
    expect(await screen.findByText('No gems or jewellery to sell')).toBeInTheDocument();
  });
});

describe('rest and preparation', () => {
  it('sends the chosen rest and shows what it did', async () => {
    const { api, user, store } = setup();
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    api.rules.mockImplementation(async () => {
      throw new Error('not stubbed');
    });
    await user.click(screen.getByRole('tab', { name: 'Rest and prepare' }));
    api.sendCommand.mockResolvedValue(
      accepted(game, [event({ event_type: 'rested', code: 'exploration.rest.rested', kind: 'night' })]),
    );
    await user.click(screen.getByRole('button', { name: 'Rest for a night' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'rest', kind: 'night' },
        game.revision,
      ),
    );
    expect(await screen.findByText('The party rests for a night.')).toBeInTheDocument();
  });

  it('names each rest by what it is for, without a length that bxapi does not state', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Rest and prepare' }));
    expect(await screen.findByText('Sleep, so casters can prepare spells.')).toBeInTheDocument();
    expect(
      screen.getByText('Sleep, so casters can prepare spells, and recover hit points.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/of game time$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/six turns|10 minutes\./)).not.toBeInTheDocument();
  });

  it("counts a caster's spells and opens a 1st-level cleric's spells, though he has no slots yet", async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Rest and prepare' }));
    // The line names the class as the sheet does. The fighters aren't casters, so their rows say nothing about
    // spells.
    expect(await screen.findAllByText(/, none memorized$/)).toHaveLength(1);
    expect(screen.queryByText(/in spell book/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Open Osric's spells" }));
    const { useTableUi } = await import('@/app');
    expect(useTableUi.getState().sheetTab).toBe('spells');
  });

  it('opens the character sheet from the party list', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Rest and prepare' }));
    await user.click(screen.getByRole('button', { name: "Open Wren's sheet" }));
    const { useTableUi } = await import('@/app');
    expect(useTableUi.getState().sheetMemberId).toBe('character-0002');
  });
});

describe('the action bar', () => {
  it('moves between parts of town with shortcuts and disables what is not legal', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    if (!snapshot.game) throw new Error('No game.');
    snapshot.game.commands = snapshot.game.commands.filter(
      (command) => command.command_type !== 'purchase_healing',
    );
    const api = createFakeApi();
    stubCatalog(api, ADVENTURES);
    const { user } = renderWithTable(
      <>
        <TownStage />
        <ActionBar aria-label="Party actions">
          <TownActions />
        </ActionBar>
      </>,
      { snapshot, api },
    );
    const temple = screen.getByRole('button', { name: /^Temple/ });
    expect(temple).toHaveAttribute('aria-disabled', 'true');
    expect(temple).toHaveAccessibleDescription(/buy healing/);
    expect(screen.getByRole('button', { name: /^Set out/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^Treasure buyers/ }));
    expect(screen.getByRole('tab', { name: 'Treasure buyers', selected: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Outfitter/ }));
    expect(screen.getByRole('tab', { name: 'Outfitter', selected: true })).toBeInTheDocument();
  });
});

describe('the action bar rest menu', () => {
  it('names each rest as the rest panel does', async () => {
    const api = createFakeApi();
    stubCatalog(api, ADVENTURES);
    const { user } = renderWithTable(
      <ActionBar aria-label="Party actions">
        <TownActions />
      </ActionBar>,
      { snapshot: fixtureSnapshot('town', 'player'), api },
    );
    await user.click(screen.getByRole('button', { name: /^Rest/ }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(
      expect.arrayContaining(['Rest for one turn', 'Rest for a night', 'Rest for a full day']),
    );
  });
});

describe('the rest panel caster line', () => {
  it('writes the level and class as the sheet does', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    makeCaster(snapshot, 'Tamsin', 'magic_user', { book: 1, className: 'Magic-User' });
    const { user } = setup(snapshot);
    await user.click(screen.getByRole('tab', { name: 'Rest and prepare' }));
    expect(
      await screen.findByText('Level 1 magic-user, 1 in spell book, none memorized'),
    ).toBeInTheDocument();
  });
});

describe('the action bar reasons', () => {
  it("names the town when it doesn't list a service its commands allow", () => {
    const snapshot = fixtureSnapshot('town', 'player');
    if (!snapshot.game) throw new Error('No game.');
    snapshot.game.view.town_services = ["Hob Tanner's smithy and store: weapons, armour, and gear"];
    const api = createFakeApi();
    stubCatalog(api, ADVENTURES);
    renderWithTable(
      <ActionBar aria-label="Party actions">
        <TownActions />
      </ActionBar>,
      { snapshot, api },
    );
    expect(screen.getByRole('button', { name: /^Temple/ })).toHaveAccessibleDescription(
      'Hollin Ferry has no temple that offers healing.',
    );
    expect(screen.getByRole('button', { name: /^Treasure buyers/ })).toHaveAccessibleDescription(
      'Nobody in Hollin Ferry buys treasure.',
    );
    expect(screen.getByRole('button', { name: /^Outfitter/ })).toBeEnabled();
  });
});

describe('shortcuts', () => {
  it('opens a part of town with its key and ignores a key for a service that is not legal', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    if (!snapshot.game) throw new Error('No game.');
    snapshot.game.commands = snapshot.game.commands.filter(
      (command) => command.command_type !== 'purchase_healing',
    );
    const api = createFakeApi();
    stubCatalog(api, ADVENTURES);
    const { user } = renderWithTable(
      <>
        <ShortcutLayer />
        <TownStage />
        <ActionBar aria-label="Party actions">
          <TownActions />
        </ActionBar>
      </>,
      { snapshot, api },
    );
    await user.keyboard('t');
    expect(screen.getByRole('tab', { name: 'Town square', selected: true })).toBeInTheDocument();
    await user.keyboard('m');
    expect(screen.getByRole('tab', { name: 'Treasure buyers', selected: true })).toBeInTheDocument();
    await user.keyboard('{Shift>}r{/Shift}');
    await user.click(await screen.findByRole('menuitem', { name: 'Open rest and prepare' }));
    expect(screen.getByRole('tab', { name: 'Rest and prepare', selected: true })).toBeInTheDocument();
    await user.keyboard('g');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('the generic command form', () => {
  it('builds a form from the schema and sends the command it describes', async () => {
    const api = createFakeApi();
    stubCatalog(api, ADVENTURES);
    api.rules.mockImplementation(async (path: string) => {
      if (path === 'commands/light_source') {
        return {
          command_type: 'light_source',
          kind: 'play',
          allowed_modes: ['town'],
          summary: 'Light a source.',
          json_schema: {
            required: ['character_id', 'item_id'],
            properties: {
              command_type: { const: 'light_source' },
              character_id: { type: 'string' },
              item_id: { type: 'string' },
            },
          },
        } as never;
      }
      throw new Error(`The test did not stub ${path}.`);
    });
    const { store, user } = renderWithTable(<TownStage />, {
      snapshot: fixtureSnapshot('town', 'player'),
      api,
    });
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    api.sendCommand.mockResolvedValue(accepted(game));
    await user.click(screen.getByRole('tab', { name: 'Rest and prepare' }));
    await user.click(await screen.findByRole('button', { name: 'Light a torch or lantern' }));
    await user.click(await screen.findByRole('combobox', { name: /Who lights it/ }));
    await user.click(await screen.findByRole('option', { name: 'Brenna' }));
    await user.click(screen.getByRole('combobox', { name: /^Light/ }));
    await user.click(await screen.findByRole('option', { name: 'Torches (6)' }));
    await user.click(screen.getByRole('button', { name: 'Light' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'light_source', character_id: 'character-0001', item_id: 'torch' },
        game.revision,
      ),
    );
  });
});

describe('spells to prepare', () => {
  const REST = "Tamsin needs a night's rest before preparing spells.";

  function withMage() {
    const snapshot = fixtureSnapshot('town', 'player');
    makeCaster(snapshot, 'Tamsin', 'magic_user', { book: 1 });
    return snapshot;
  }

  it('warns on the town square with a button that rests for a night', async () => {
    const snapshot = withMage();
    const { api, user, store } = setup(snapshot);
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    expect((await screen.findAllByText('Spells to prepare')).length).toBeGreaterThanOrEqual(1);
    // The banner says it, and the checklist line below it names the advice without repeating it.
    expect(screen.getAllByText(REST)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Rest for a night' })).toHaveLength(1);
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    api.sendCommand.mockResolvedValue(accepted(game));
    await user.click(screen.getAllByRole('button', { name: 'Rest for a night' })[0] as HTMLElement);
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'rest', kind: 'night' },
        game.revision,
      ),
    );
  });

  it('changes to "can prepare" after a night and opens the Spells tab', async () => {
    const snapshot = withMage();
    snapshot.feed.entries.push(
      gameEntry(900, 'rest', [{ event_type: 'rested', code: 'exploration.rest.rested', kind: 'night' }]),
    );
    const { user } = setup(snapshot);
    expect((await screen.findAllByText('Tamsin can prepare spells now.')).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Rest for a night' })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: "Open Tamsin's spells" })[0] as HTMLElement);
    expect(useTableUi.getState().sheetMemberId).toBe('character-0004');
    expect(useTableUi.getState().sheetTab).toBe('spells');
  });

  it('lists it with the other advice in the set-out dialog', async () => {
    const { user } = setup(withMage());
    await screen.findAllByText(REST);
    await user.click(screen.getAllByRole('button', { name: 'Set out' })[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(REST)).toBeInTheDocument();
    expect(within(dialog).getByText('Tinder box')).toBeInTheDocument();
  });

  it('keeps the checklist line to its title and status under the banner, and gives it in full elsewhere', async () => {
    const { user } = setup(withMage());
    const checklist = (await screen.findByRole('heading', { name: 'Ready for the dungeon?' })).closest(
      'section',
    );
    if (!checklist) throw new Error('no checklist');
    expect(within(checklist).getByText('Spells to prepare')).toBeInTheDocument();
    expect(within(checklist).getByText(": Tamsin needs a night's rest")).toBeInTheDocument();
    expect(within(checklist).queryByText(REST)).toBeNull();
    expect(within(checklist).queryByRole('button', { name: 'Rest for a night' })).toBeNull();
    // The outfitter has no banner, so its checklist gives the advice in full.
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    const outfitter = (await screen.findByRole('heading', { name: 'Ready for the dungeon?' })).closest(
      'section',
    );
    if (!outfitter) throw new Error('no checklist');
    expect(within(outfitter).getByText(REST)).toBeInTheDocument();
    expect(within(outfitter).getByRole('button', { name: 'Rest for a night' })).toBeInTheDocument();
  });

  it('says nothing about a new first-level cleric', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    makeCaster(snapshot, 'Tamsin', 'cleric');
    setup(snapshot);
    await screen.findByRole('heading', { name: 'Hollin Ferry' });
    expect(screen.queryByText('Spells to prepare')).not.toBeInTheDocument();
    expect(screen.queryByText(/before preparing spells/)).not.toBeInTheDocument();
  });
});

describe('the temple and a dead member', () => {
  function withDeadOsric() {
    const snapshot = fixtureSnapshot('town', 'referee');
    const osric = snapshot.game?.view.party.find((member) => member.name === 'Osric');
    if (!osric) throw new Error('No Osric.');
    osric.conditions = ['dead'];
    osric.current_hp = 0;
    return snapshot;
  }

  it('names the button "Osric, dead", lists raise dead first, and leaves every Buy button enabled', async () => {
    const { user } = setup(withDeadOsric());
    await user.click(screen.getByRole('tab', { name: 'Temple' }));
    const group = await screen.findByRole('group', { name: 'Patient' });
    expect(within(group).getByRole('button', { name: 'Osric, dead' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /^Brenna, \d+ of \d+ hp$/ })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /^Buy .* for Osric$/ });
    expect(buttons[0]).toHaveAccessibleName('Buy raise dead for Osric');
    for (const button of buttons) expect(button).toBeEnabled();
  });

  it("shows bxapi's refusal when a service can't help a dead member", async () => {
    const { api, user, store } = setup(withDeadOsric());
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    api.sendCommand.mockResolvedValue(
      refused(game, 'town.healing.no_effect', { service: 'cure_light_wounds' }),
    );
    await user.click(screen.getByRole('tab', { name: 'Temple' }));
    await user.click(await screen.findByRole('button', { name: 'Buy cure light wounds for Osric' }));
    expect(await screen.findByText("Couldn't treat Osric")).toBeInTheDocument();
    expect(api.sendCommand).toHaveBeenCalled();
  });

  it('shows the cleric level field to a referee only', async () => {
    const referee = setup(fixtureSnapshot('town', 'referee'));
    await referee.user.click(screen.getByRole('tab', { name: 'Temple' }));
    expect(await screen.findByText('Cleric level (optional)')).toBeInTheDocument();
    referee.unmount();
    const player = setup(fixtureSnapshot('town', 'player'));
    await player.user.click(screen.getByRole('tab', { name: 'Temple' }));
    await screen.findByRole('group', { name: 'Patient' });
    expect(screen.queryByText('Cleric level (optional)')).not.toBeInTheDocument();
  });
});

describe('recently in town', () => {
  it('headlines a rest with the rest and opens the rest of the lines', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    snapshot.feed.entries.push(
      gameEntry(901, 'rest', [
        { event_type: 'fatigue', code: 'exploration.fatigue.recovered', visibility: 'player' },
        { event_type: 'rested', code: 'exploration.rest.rested', kind: 'day', visibility: 'player' },
      ]),
    );
    const { user } = setup(snapshot);
    expect(await screen.findByText('The party rests for a full day.')).toBeInTheDocument();
    const more = screen.getByRole('button', { name: '+1 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('The party recovers from fatigue.')).toBeInTheDocument();
  });

  it(`reads the spell line for a screen reader as "Spells to prepare: Tamsin needs a night's rest"`, async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    makeCaster(snapshot, 'Tamsin', 'magic_user', { book: 1 });
    setup(snapshot);
    expect(await screen.findByText(": Tamsin needs a night's rest")).toBeInTheDocument();
  });
});

/** Lower case, with every run of punctuation and spaces as one space, as axe compares a name with its text. */
function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

describe('member choosers name what they show', () => {
  function chooserButtons(group: HTMLElement) {
    return within(group).getAllByRole('button');
  }

  it('keeps every visible word, in order, in the accessible name of every state', async () => {
    const snapshot = fixtureSnapshot('town', 'referee');
    const party = snapshot.game?.view.party ?? [];
    const [brenna, wren, osric, tamsin] = party;
    if (!brenna || !wren || !osric || !tamsin) throw new Error('The fixture party changed.');
    wren.current_hp = 1;
    osric.conditions = ['dead'];
    osric.current_hp = 0;
    tamsin.conditions = ['poisoned'];
    tamsin.current_hp = 2;
    const { user } = setup(snapshot);
    await user.click(screen.getByRole('tab', { name: 'Temple' }));
    const temple = await screen.findByRole('group', { name: 'Patient' });
    for (const button of chooserButtons(temple)) {
      expect(words(button.getAttribute('aria-label') ?? '')).toContain(words(button.textContent ?? ''));
    }
    expect(chooserButtons(temple).map((button) => button.getAttribute('aria-label'))).toContain(
      'Osric, dead',
    );
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    const shopping = await screen.findByRole('group', { name: 'Shopping for' });
    await user.click(await screen.findByRole('button', { name: 'Add Rope (50’) to the cart' }));
    for (const button of chooserButtons(shopping)) {
      expect(words(button.getAttribute('aria-label') ?? '')).toContain(words(button.textContent ?? ''));
    }
    expect(chooserButtons(shopping)[0]?.textContent).toContain('1 in cart');
  });
});

describe('town tokens', () => {
  it("wear the color of the player in the member's seat", async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    const { container } = setup(snapshot);
    await screen.findByRole('heading', { name: 'Party purses' });
    const sam = snapshot.table.members.find((member) => member.name === 'Sam');
    const ruth = snapshot.table.members.find((member) => member.name === 'Ruth');
    if (!sam || !ruth) throw new Error('The fixture table changed.');
    const probe = document.createElement('div');
    const colorOf = (hex: string) => {
      probe.style.setProperty('--token-color', hex);
      return probe.style.getPropertyValue('--token-color');
    };
    const rows = [...container.querySelectorAll('li')].filter((li) => li.querySelector('h3'));
    const colorFor = (name: string) => {
      const row = rows.find((li) => li.querySelector('h3')?.textContent === name);
      return (row?.querySelector('[style*="--token-color"]') as HTMLElement | null)?.style.getPropertyValue(
        '--token-color',
      );
    };
    expect(colorFor('Brenna')).toBe(colorOf(sam.color));
    expect(colorFor('Osric')).toBe(colorOf(ruth.color));
  });
});
