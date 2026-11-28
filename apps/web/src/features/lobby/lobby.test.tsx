import type { AdventureListing, CreationRules, StartingRuleset, TableDetail } from '@bxvtt/shared/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMyCharacters } from '@/app';
import { draftKey, emptyDraft } from '@/features/wizard/draft';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { LobbyPage } from './LobbyPage';
import { moveItem } from './RosterPanel';
import { RULES_FOR_PLAY, creationRuleDifferences, matchStartingRuleset, rosterMark } from './rules';
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

/** The referee's button that swaps the Table rules summary for the form. */
function changeRules() {
  return screen.getByRole('button', { name: 'Change rules' });
}

/** Every boolean rule for play turned off. */
const NO_OPTIONAL_RULES = Object.fromEntries(
  RULES_FOR_PLAY.filter((rule) => rule.kind === 'boolean').map((rule) => [rule.key, false]),
);

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
    // The list under "Before you start" is the one place that says why, and the button points to it.
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription('Choose an adventure.');
    expect(screen.getByRole('list', { name: 'Before you start' })).toHaveTextContent('Choose an adventure.');
    await user.click(start);
    expect(api.startGame).not.toHaveBeenCalled();
    const leader = (store.getState().table as TableDetail).roster[0]!.name;
    const forward = screen.getByRole('button', { name: `Move ${leader} forward` });
    expect(forward).toHaveAccessibleDescription(`${leader} already leads the marching order.`);
    await user.click(forward);
    expect(api.reorderRoster).not.toHaveBeenCalled();
  });

  it("shows a player the lobby without the referee's cards while waiting for the referee", async () => {
    const { api, store } = renderWithTable(<LobbyPage />, {
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
    // The referee's cards don't render for a player, so the page has nothing that looks barred.
    expect(screen.queryByRole('heading', { name: 'Invite players' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Invite link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Table settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change rules' })).not.toBeInTheDocument();
  });

  it("shows a player the table's rules as a summary with no controls, and no marks on the party", async () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    const table: TableDetail = {
      ...snapshot.table,
      settings: {
        ...snapshot.table.settings,
        ability_score_rerolls: 2,
        ruleset: {
          ...snapshot.table.settings.ruleset,
          ...NO_OPTIONAL_RULES,
          weapon_reload: true,
          aoe_friendly_fire: true,
        },
      },
      roster: snapshot.table.roster.map((entry) => ({ ...entry, creation_rules: null })),
    };
    const fake = createFakeApi();
    fake.listRulesets.mockResolvedValue({ items: STARTING });
    fake.listCharacters.mockResolvedValue({ items: [] });
    const { user } = renderWithTable(<LobbyPage />, { snapshot: { ...snapshot, table }, api: fake });
    const panel = screen.getByRole('heading', { name: 'Table rules' }).closest('section');
    if (panel === null) throw new Error('No Table rules panel.');
    const rules = within(panel);
    // The badge names the starting rules, unless the table's rules match neither.
    expect(await rules.findByText('Custom')).toBeInTheDocument();
    const creating = within(rules.getByRole('region', { name: 'Creating a character' }));
    expect(creating.getByText('Ability scores').nextSibling).toHaveTextContent('Roll 3d6');
    expect(creating.getByText('Rerolls').nextSibling).toHaveTextContent('2 per character');
    expect(creating.getByText('First-level hit points').nextSibling).toHaveTextContent(
      'Roll, and reroll a 1 or 2',
    );
    expect(creating.getByText('Poor ability scores').nextSibling).toHaveTextContent('Keep the character');
    const playing = within(rules.getByRole('region', { name: 'Playing' }));
    expect(playing.getByText('Encumbrance').nextSibling).toHaveTextContent('Basic');
    expect(playing.getByText('Optional rules').nextSibling).toHaveTextContent('Weapon reload, Friendly fire');
    // Nothing in the panel changes a rule.
    expect(rules.queryByRole('switch')).toBeNull();
    expect(rules.queryByRole('combobox')).toBeNull();
    expect(rules.queryByRole('spinbutton')).toBeNull();
    expect(rules.queryByText(/Only a referee can change the rules/)).toBeNull();
    expect(screen.queryByText(/Rules unknown|Other table|Different rules/)).toBeNull();
    // A rule's name opens its explanation in place.
    await user.click(rules.getByRole('button', { name: 'Friendly fire' }));
    expect(await screen.findByRole('dialog', { name: 'Friendly fire' })).toHaveTextContent(
      'An area spell cast at monsters in melee also hits the party members fighting them.',
    );
    expect(fake.updateTable).not.toHaveBeenCalled();
  });

  it('says none when no optional rule is on, and names the standard starting rules', async () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    const table: TableDetail = {
      ...snapshot.table,
      settings: {
        ...snapshot.table.settings,
        ability_score_rerolls: null,
        sub_par_restart: true,
        party_control: 'anyone',
        ruleset: { ...snapshot.table.settings.ruleset, ...NO_OPTIONAL_RULES, max_hp_at_first_level: true },
      },
    };
    const fake = createFakeApi();
    fake.listRulesets.mockResolvedValue({ items: STARTING });
    fake.listCharacters.mockResolvedValue({ items: [] });
    renderWithTable(<LobbyPage />, { snapshot: { ...snapshot, table }, api: fake });
    const summary = within(await screen.findByRole('region', { name: 'Creating a character' }));
    expect(summary.getByText('Rerolls').nextSibling).toHaveTextContent('Unlimited');
    expect(summary.getByText('First-level hit points').nextSibling).toHaveTextContent('Maximum');
    expect(summary.getByText('Poor ability scores').nextSibling).toHaveTextContent('Can start over');
    const playing = within(screen.getByRole('region', { name: 'Playing' }));
    expect(playing.getByText('Moving the party').nextSibling).toHaveTextContent('Anyone with a character');
    expect(playing.getByText('Optional rules').nextSibling).toHaveTextContent('None');
  });

  it('gives a referee the same summary, and a form that Done closes', async () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const fake = createFakeApi();
    fake.listRulesets.mockResolvedValue({ items: STARTING });
    fake.listAdventures.mockResolvedValue({ items: [] });
    fake.listCharacters.mockResolvedValue({ items: [] });
    const { user } = renderWithTable(<LobbyPage />, { snapshot, api: fake });
    const panel = screen.getByRole('heading', { name: 'Table rules' }).closest('section');
    if (panel === null) throw new Error('No Table rules panel.');
    expect(await within(panel).findByText('Standard B/X')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Creating a character' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Starting rules' })).toBeNull();
    await user.click(changeRules());
    expect(screen.queryByRole('region', { name: 'Creating a character' })).toBeNull();
    // Focus moves to the first control of the form.
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Starting rules' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('region', { name: 'Creating a character' })).toBeInTheDocument();
    expect(changeRules()).toHaveFocus();
    expect(fake.updateTable).not.toHaveBeenCalled();
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
    await user.click(changeRules());
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
    await user.click(changeRules());
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
  describe('the wizard button', () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    const tableId = snapshot.table.id;
    /** An unfinished character at the lobby's table, as the wizard stores it. */
    const unfinished = JSON.stringify({
      ...emptyDraft(),
      step: 'class',
      roll: {
        id: 'rol_test',
        scores: { str: 15, int: 9, wis: 10, dex: 12, con: 11, cha: 8 },
        eligible_class_ids: ['fighter'],
        used: false,
        created_at: '2026-11-21T00:00:00Z',
        table_id: tableId,
      },
    });

    function renderLobby() {
      const fake = createFakeApi();
      fake.listCharacters.mockResolvedValue({ items: [] });
      return renderWithTable(<LobbyPage />, { snapshot, api: fake });
    }

    beforeEach(() => localStorage.clear());

    it('offers to create a character when none is unfinished at this table', async () => {
      localStorage.setItem(draftKey(null, 'tbl_other'), unfinished);
      renderLobby();
      expect(await screen.findByText("You haven't created any characters yet.")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Resume character' })).toBeNull();
    });

    it('offers to resume an unfinished character, and returns focus to that button on close', async () => {
      localStorage.setItem(draftKey(null, tableId), unfinished);
      const { user } = renderLobby();
      await user.click(screen.getByRole('button', { name: 'Resume character' }));
      expect(await screen.findByRole('dialog', { name: 'Create a character' })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Resume character' })).toHaveFocus());
    });

    it('reads storage again when the wizard closes', async () => {
      const { user } = renderLobby();
      await user.click(screen.getByRole('button', { name: 'Create a character' }));
      await screen.findByRole('dialog', { name: 'Create a character' });
      // The wizard saves the character once the player rolls ability scores.
      localStorage.setItem(draftKey(null, tableId), unfinished);
      await user.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Resume character' })).toHaveFocus());
    });
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
    await user.click(changeRules());
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
