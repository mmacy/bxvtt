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
    expect(
      await screen.findByText('Ruth is the caller, so Ruth leads the party out. Ask Ruth or the referee.'),
    ).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'Set out' })) expect(button).toBeDisabled();
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
    expect(within(dialog).getByText('A tinder box to light it')).toBeInTheDocument();
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
    expect(await within(dialog).findByText("The party can't set out")).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Add one lot of Torches (6)' }));
    await user.click(screen.getByRole('button', { name: 'Add Sword to the cart' }));
    const cart = screen.getByRole('list', { name: 'Cart' });
    expect(within(cart).getByText('2 lots are 12 torches')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Wield Sword now' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenLastCalledWith(
        store.getState().tableId,
        { command_type: 'equip_item', character_id: 'character-0001', item_id: 'sword' },
        game.revision + 1,
      ),
    );
    expect(
      await screen.findByText(/Clerics can use only certain weapons/, { selector: 'span' }),
    ).toBeInTheDocument();
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
    expect(
      await screen.findByText("That costs 20 gp, and there isn't enough gold to pay for it."),
    ).toBeInTheDocument();
    expect(useTownUi.getState().carts['character-0001']).toEqual({ leather: 1 });
  });

  it('copies one cart to the other members the viewer shops for, and shops for each in turn', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Outfitter' }));
    await user.click(await screen.findByRole('button', { name: 'Add Rope (50’) to the cart' }));
    await user.click(screen.getByRole('button', { name: 'Same for everyone you shop for' }));
    expect(useTownUi.getState().carts['character-0002']).toEqual({ rope: 1 });
    expect(screen.getByRole('button', { name: 'Buy every cart (2)' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Same for everyone you shop for' }));
    await user.click(screen.getByRole('button', { name: /^Buy every cart/ }));
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
    await user.click(screen.getByRole('button', { name: 'Same for everyone you shop for' }));
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
    const group = await screen.findByRole('group', { name: 'Who is treated' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent?.slice(0, 5)),
    ).toEqual(['Osric', 'Wren1', 'Brenn', 'Tamsi']);
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
    expect(screen.getByText(/The whole party pays, not only the patient/)).toBeInTheDocument();
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
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/Only the player in Osric's seat or the referee can act for Osric/),
    ).toBeInTheDocument();
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
    expect(await screen.findByText('Nobody carries gems or jewellery')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Rest a night' }));
    await waitFor(() =>
      expect(api.sendCommand).toHaveBeenCalledWith(
        store.getState().tableId,
        { command_type: 'rest', kind: 'night' },
        game.revision,
      ),
    );
    expect(await screen.findByText('The party rests for a night.')).toBeInTheDocument();
  });

  it('states each length once and gives no dungeon rule', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Rest and prepare' }));
    const lengths = await screen.findAllByText(/of game time$/);
    expect(lengths).toHaveLength(3);
    expect(screen.queryByText(/six turns|10 minutes\./)).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /^Temple/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Set out/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^Treasure buyers/ }));
    expect(screen.getByRole('tab', { name: 'Treasure buyers', selected: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Outfitter/ }));
    expect(screen.getByRole('tab', { name: 'Outfitter', selected: true })).toBeInTheDocument();
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
  const REST = 'Tamsin has no spells memorized. Rest for a night, then prepare spells.';

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
    const banner = await screen.findByText("Spells aren't prepared");
    expect(banner).toBeInTheDocument();
    expect(screen.getAllByText(REST).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Looks ready')).not.toBeInTheDocument();
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
    await screen.findByText("Spells aren't prepared");
    await user.click(screen.getAllByRole('button', { name: 'Set out' })[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(REST)).toBeInTheDocument();
    expect(within(dialog).getByText('A tinder box to light it')).toBeInTheDocument();
  });

  it('says nothing about a new first-level cleric', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    makeCaster(snapshot, 'Tamsin', 'cleric');
    const { api } = setup(snapshot);
    await screen.findByRole('heading', { name: 'Hollin Ferry' });
    await waitFor(() => expect(api.fullCatalog).toHaveBeenCalledWith('classes'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Spells aren't prepared")).not.toBeInTheDocument();
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
    const group = await screen.findByRole('group', { name: 'Who is treated' });
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
    expect(await screen.findByText("The temple can't do that for Osric")).toBeInTheDocument();
    expect(api.sendCommand).toHaveBeenCalled();
  });

  it('shows the cleric level field to a referee only', async () => {
    const referee = setup(fixtureSnapshot('town', 'referee'));
    await referee.user.click(screen.getByRole('tab', { name: 'Temple' }));
    expect(await screen.findByText("Temple cleric's level (optional)")).toBeInTheDocument();
    referee.unmount();
    const player = setup(fixtureSnapshot('town', 'player'));
    await player.user.click(screen.getByRole('tab', { name: 'Temple' }));
    await screen.findByRole('group', { name: 'Who is treated' });
    expect(screen.queryByText("Temple cleric's level (optional)")).not.toBeInTheDocument();
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

  it('reads the spell line for a screen reader as "Spells to prepare: Tamsin has none memorized"', async () => {
    const snapshot = fixtureSnapshot('town', 'player');
    makeCaster(snapshot, 'Tamsin', 'magic_user', { book: 1 });
    setup(snapshot);
    await screen.findByText("Spells aren't prepared");
    expect(screen.getByText(': Tamsin has none memorized')).toBeInTheDocument();
  });
});
