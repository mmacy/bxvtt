import type { AdventureListing, CreationRules, StartingRuleset, TableDetail } from '@bxvtt/shared/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMyCharacters } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { LobbyPage } from './LobbyPage';
import { moveItem } from './RosterPanel';
import { creationRuleDifferences, matchStartingRuleset, rosterMark } from './rules';
import { startChecks } from './StartGamePanel';
import { resetStartingRulesets } from './startingRulesets';

const bell: AdventureListing = {
  id: 'sample:the-drowned-bell',
  source: 'sample',
  uploaded_by: null,
  uploaded_at: null,
  info: {
    name: 'The Drowned Bell',
    description: 'A bell tolls under the Grey Mere.',
    hooks: ["Bring back the bell's tongue."],
    party: { min_level: 1, max_level: 1, min_size: 3, max_size: 6 },
    town: { id: 'hollin', name: 'Hollin Ferry', description: '', services: [] },
    dungeons: [],
    id: null,
    builtin: false,
    created_at: null,
  } as AdventureListing['info'],
};

beforeEach(() => {
  resetMyCharacters();
  resetStartingRulesets();
});

/** The table fixture stores osrlib's defaults with the hit die reroll on: the standard starting ruleset. */
const STANDARD = fixtureSnapshot('lobby', 'referee').table.settings.ruleset;
const STARTING: StartingRuleset[] = [
  { id: 'standard', ruleset: STANDARD },
  {
    id: 'creation_house_rules',
    ruleset: { ...STANDARD, ability_score_method: '4d6_drop_lowest', max_hp_at_first_level: true },
  },
];

/** The Rules panel's toggle, not the rules reference or a roster mark. */
function rulesToggle() {
  return screen.getByRole('button', { name: /^Rules$/ });
}

const TABLE_RULES: CreationRules = {
  ability_score_method: '3d6',
  hp_reroll_at_first_level: true,
  max_hp_at_first_level: false,
  ability_score_rerolls: 0,
  sub_par_restart: false,
};

describe('matchStartingRuleset', () => {
  it('names the starting ruleset whose every rule the table has, and none for a custom table', () => {
    expect(matchStartingRuleset(STANDARD, STARTING)).toBe('standard');
    expect(matchStartingRuleset(STARTING[1]!.ruleset, STARTING)).toBe('creation_house_rules');
    expect(
      matchStartingRuleset({ ...STANDARD, weapon_reload: !STANDARD.weapon_reload }, STARTING),
    ).toBeNull();
  });
});

describe('the roster mark', () => {
  const entry = { name: 'Wren', creation_rules: TABLE_RULES, rolled_at_other_table: false };

  it('marks nothing for a character rolled here under the same rules', () => {
    expect(rosterMark(entry, TABLE_RULES)).toBeNull();
  });

  it("lists each creation rule that differs, with the character's value", () => {
    const built = { ...TABLE_RULES, ability_score_rerolls: null, hp_reroll_at_first_level: false };
    expect(creationRuleDifferences(built, TABLE_RULES)).toEqual([
      'Hit die reroll: Off',
      'Ability score rerolls: Unlimited',
    ]);
    expect(rosterMark({ ...entry, creation_rules: built }, TABLE_RULES)).toEqual({
      label: 'Different rules',
      tone: 'warning',
      lines: ['Wren was created with:', 'Hit die reroll: Off', 'Ability score rerolls: Unlimited'],
    });
  });

  it('ignores a rule the character never recorded', () => {
    const { sub_par_restart: _missing, ...older } = TABLE_RULES;
    expect(
      creationRuleDifferences(older as CreationRules, { ...TABLE_RULES, sub_par_restart: true }),
    ).toEqual([]);
  });

  it('says where the scores were rolled first, and keeps one mark', () => {
    expect(rosterMark({ ...entry, rolled_at_other_table: true }, TABLE_RULES)?.tone).toBe('info');
    const differs = rosterMark(
      { ...entry, rolled_at_other_table: true, creation_rules: { ...TABLE_RULES, ability_score_rerolls: 3 } },
      TABLE_RULES,
    );
    expect(differs).toEqual({
      label: 'Other table',
      tone: 'warning',
      lines: ["Wren's ability scores were rolled at another table, with:", 'Ability score rerolls: 3'],
    });
    expect(rosterMark({ ...entry, creation_rules: null }, TABLE_RULES)?.label).toBe('Rules unknown');
  });
});

describe('moveItem', () => {
  it('moves one entry and keeps the rest in order', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 5)).toEqual(['a', 'b', 'c']);
  });
});

describe('startChecks', () => {
  it('keeps the start off without a party or an adventure', () => {
    const table: TableDetail = { ...fixtureSnapshot('lobby', 'referee').table, roster: [] };
    expect(startChecks(table, null).blockers).toEqual([
      'Add at least one character to the party.',
      'Choose an adventure.',
    ]);
  });

  it("warns when the party is outside the adventure's recommendation", () => {
    const table = fixtureSnapshot('lobby', 'referee').table;
    const small = { ...table, roster: table.roster.slice(0, 2) };
    const { blockers, warnings } = startChecks(small, bell);
    expect(blockers).toEqual([]);
    expect(warnings[0]).toBe('The Drowned Bell is written for at least 3 characters, but the party has 2.');
  });
});

describe('LobbyPage', () => {
  it('lets the referee reorder the marching order with the keyboard buttons', async () => {
    const { api, store, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'referee'),
    });
    api.listAdventures.mockResolvedValue({ items: [bell] });
    api.listCharacters.mockResolvedValue({ items: [] });
    const table = store.getState().table as TableDetail;
    const ids = table.roster.map((entry) => entry.id);
    const reordered = moveItem(ids, 1, 0);
    api.reorderRoster.mockResolvedValue({
      ...table,
      roster: reordered.map((id) => table.roster.find((entry) => entry.id === id) ?? table.roster[0]!),
    });
    await user.click(screen.getByRole('button', { name: 'Move Wren forward' }));
    expect(api.reorderRoster).toHaveBeenCalledWith(table.id, reordered);
    const party = screen.getByRole('list', { name: 'Party in marching order' });
    await waitFor(() => expect(within(party).getAllByRole('listitem')[0]).toHaveTextContent('Wren'));
  });

  it('starts the game with the chosen adventure', async () => {
    const fake = createFakeApi();
    fake.listAdventures.mockResolvedValue({ items: [bell] });
    fake.listCharacters.mockResolvedValue({ items: [] });
    const { api, store, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'referee'),
      api: fake,
    });
    const game = fixtureSnapshot('town', 'referee').game;
    api.startGame.mockResolvedValue(game!);
    await screen.findByRole('radio', { name: /The Drowned Bell/ });
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(api.startGame).toHaveBeenCalledWith(store.getState().tableId, {
      adventure_id: 'sample:the-drowned-bell',
    });
    await waitFor(() => expect(store.getState().game?.mode).toBe('town'));
  });

  it("says why the game can't start and why the leader can't move forward", async () => {
    const { api, store, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'referee'),
    });
    api.listAdventures.mockResolvedValue({ items: [] });
    api.listCharacters.mockResolvedValue({ items: [] });
    const start = screen.getByRole('button', { name: 'Start game' });
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(start).toHaveAccessibleDescription('Choose an adventure.');
    await user.click(start);
    expect(api.startGame).not.toHaveBeenCalled();
    const leader = (store.getState().table as TableDetail).roster[0]!.name;
    const forward = screen.getByRole('button', { name: `Move ${leader} forward` });
    expect(forward).toHaveAccessibleDescription(`${leader} already leads the marching order.`);
    await user.click(forward);
    expect(api.reorderRoster).not.toHaveBeenCalled();
  });

  it('shows a player the lobby read-only while waiting for the referee', async () => {
    const { api, store, user } = renderWithTable(<LobbyPage />, {
      snapshot: fixtureSnapshot('lobby', 'player'),
    });
    api.listCharacters.mockResolvedValue({ items: [] });
    expect(screen.getByText('Waiting for the referee to start')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move .* forward/ })).not.toBeInTheDocument();
    // Sam may take his own characters off the roster, but not the referee's.
    expect(screen.getByRole('button', { name: 'Remove Brenna from party' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Osric from party' })).not.toBeInTheDocument();
    expect(api.listAdventures).not.toHaveBeenCalled();
    expect(store.getState().role).toBe('player');
    await user.click(screen.getByRole('button', { name: 'Table settings' }));
    expect(await screen.findByText('Only a referee can change these settings.')).toBeInTheDocument();
  });

  it("shows a player the table's rules, read-only, and no marks on the party", async () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    const table: TableDetail = {
      ...snapshot.table,
      roster: snapshot.table.roster.map((entry) => ({ ...entry, creation_rules: null })),
    };
    const fake = createFakeApi();
    fake.listRulesets.mockResolvedValue({ items: STARTING });
    fake.listCharacters.mockResolvedValue({ items: [] });
    const { user } = renderWithTable(<LobbyPage />, { snapshot: { ...snapshot, table }, api: fake });
    // The collapsed panel names the starting rules the table matches.
    expect(await screen.findByText('Standard B/X')).toBeInTheDocument();
    await user.click(rulesToggle());
    expect(screen.getByText('Only a referee can change the rules.')).toBeInTheDocument();
    // The switches are read-only, not disabled, so their labels stay at full contrast and a click changes nothing.
    const reroll = screen.getByRole('switch', { name: /Hit die reroll/ });
    expect(reroll).toHaveAttribute('aria-readonly', 'true');
    expect(reroll).toBeChecked();
    await user.click(reroll);
    expect(reroll).toBeChecked();
    expect(fake.updateTable).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: /Back-stab from hiding/ })).toHaveAttribute(
      'aria-readonly',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Unlimited' })).toHaveAttribute('aria-readonly', 'true');
    // The selects and the number are read-only too, so the rules the table plays by stay easy to read.
    const startingRules = screen.getByRole('combobox', { name: 'Starting rules' });
    expect(startingRules).toHaveAttribute('aria-readonly', 'true');
    await user.click(startingRules);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Encumbrance' })).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('spinbutton', { name: 'Ability score rerolls' })).toHaveAttribute('readonly');
    // A player has nothing to choose, so the field has no hint about choosing.
    expect(screen.queryByText(/Choosing one changes every rule/)).toBeNull();
    expect(screen.queryByText(/Rules unknown|Other table|Different rules/)).toBeNull();
  });

  it('lets a referee pick starting rules, and asks first when it discards changes', async () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const [first, ...rest] = snapshot.table.roster;
    const custom: TableDetail = {
      ...snapshot.table,
      settings: { ...snapshot.table.settings, ruleset: { ...STANDARD, weapon_reload: true } },
      // A character created before the server recorded creation rules.
      roster: first === undefined ? [] : [{ ...first, creation_rules: null }, ...rest],
    };
    const fake = createFakeApi();
    fake.listRulesets.mockResolvedValue({ items: STARTING });
    fake.listAdventures.mockResolvedValue({ items: [] });
    fake.listCharacters.mockResolvedValue({ items: [] });
    const { api, user } = renderWithTable(<LobbyPage />, {
      snapshot: { ...snapshot, table: custom },
      api: fake,
    });
    api.updateTable.mockResolvedValue(snapshot.table);
    // A tap on the mark shows the reason, so a referee on a touch screen reads it too.
    await user.click(screen.getByRole('button', { name: 'Rules unknown: show why' }));
    expect(await screen.findByRole('dialog', { name: 'Rules unknown' })).toHaveTextContent(
      `No creation rules were recorded for ${first?.name ?? ''}.`,
    );
    await user.keyboard('{Escape}');
    await user.click(rulesToggle());
    await user.click(await screen.findByRole('combobox', { name: 'Starting rules' }));
    await user.click(await screen.findByRole('option', { name: 'Creation house rules' }));
    expect(await screen.findByText('Use creation house rules?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This changes every rule to creation house rules and discards the changes you made. Sub-par characters and ability score rerolls stay as they are.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use creation house rules' }));
    await waitFor(() =>
      expect(api.updateTable).toHaveBeenCalledWith(custom.id, {
        settings: { ruleset: STARTING[1]!.ruleset },
      }),
    );
  });

  it("sends a referee's rule changes one at a time, and unlimited rerolls as no limit", async () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const fake = createFakeApi();
    fake.listRulesets.mockResolvedValue({ items: STARTING });
    fake.listAdventures.mockResolvedValue({ items: [] });
    fake.listCharacters.mockResolvedValue({ items: [] });
    const { api, user } = renderWithTable(<LobbyPage />, { snapshot, api: fake });
    api.updateTable.mockResolvedValue(snapshot.table);
    await user.click(rulesToggle());
    await user.click(screen.getByRole('switch', { name: /4d6 drop lowest/ }));
    expect(api.updateTable).toHaveBeenCalledWith(snapshot.table.id, {
      settings: { ruleset: { ability_score_method: '4d6_drop_lowest' } },
    });
    // A typed number goes once, on Enter, not on each keystroke.
    const rerolls = screen.getByRole('spinbutton', { name: 'Ability score rerolls' });
    await user.clear(rerolls);
    await user.type(rerolls, '12{Enter}');
    expect(api.updateTable).toHaveBeenCalledTimes(2);
    expect(api.updateTable).toHaveBeenLastCalledWith(snapshot.table.id, {
      settings: { ability_score_rerolls: 12 },
    });
    await user.click(screen.getByRole('checkbox', { name: 'Unlimited' }));
    expect(api.updateTable).toHaveBeenLastCalledWith(snapshot.table.id, {
      settings: { ability_score_rerolls: null },
    });
  });

  it("adds one of the user's characters to the party", async () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    const fake = createFakeApi();
    fake.listCharacters.mockResolvedValue({
      items: [
        {
          id: 'chr_nnnnnnnnnnnnnnnnnnnnnn',
          name: 'Nell',
          class_id: 'elf',
          level: 1,
          max_hp: 5,
          created_at: '2026-11-22T05:00:00Z',
        },
      ],
    });
    const { api, store, user } = renderWithTable(<LobbyPage />, { snapshot, api: fake });
    api.addToRoster.mockResolvedValue(snapshot.table);
    await user.click(await screen.findByRole('button', { name: 'Add to party' }));
    expect(api.addToRoster).toHaveBeenCalledWith(store.getState().tableId, 'chr_nnnnnnnnnnnnnnnnnnnnnn');
  });
  it('keeps a newer rerolls number on screen while an older one saves, and saves a number left waiting', async () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const fake = createFakeApi();
    fake.listRulesets.mockResolvedValue({ items: STARTING });
    fake.listAdventures.mockResolvedValue({ items: [] });
    fake.listCharacters.mockResolvedValue({ items: [] });
    const answers: Array<() => void> = [];
    fake.updateTable.mockImplementation(
      (_id, body) =>
        new Promise((resolve) => {
          answers.push(() =>
            resolve({
              ...snapshot.table,
              settings: {
                ...snapshot.table.settings,
                ability_score_rerolls: body.settings?.ability_score_rerolls ?? 0,
              },
            }),
          );
        }),
    );
    const { user, unmount } = renderWithTable(<LobbyPage />, { snapshot, api: fake });
    await user.click(rulesToggle());
    const rerolls = screen.getByRole('spinbutton', { name: 'Ability score rerolls' });
    await user.clear(rerolls);
    await user.type(rerolls, '5{Enter}');
    await user.clear(rerolls);
    await user.type(rerolls, '6{Enter}');
    // The table stores 5 first. The 6 the referee chose since stays on screen until it's stored too.
    answers[0]?.();
    await waitFor(() => expect(fake.updateTable).toHaveBeenCalledTimes(2));
    expect(rerolls).toHaveValue('6');
    // A step waits a moment before it's sent. Closing the form sends it at once.
    await user.keyboard('{ArrowUp}');
    unmount();
    expect(fake.updateTable).toHaveBeenLastCalledWith(snapshot.table.id, {
      settings: { ability_score_rerolls: 7 },
    });
  });
});
