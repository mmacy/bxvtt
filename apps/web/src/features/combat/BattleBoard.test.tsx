import type { DeclarationsState, FeedEntry } from '@bxvtt/shared/protocol';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePreferences } from '@/app';
import { fixtureSnapshot, type Snapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import { BattleBoard } from './BattleBoard';
import { resetCombatMemory } from './memory';
import { resetQuickActions } from './quick';
import { resetCombatUi } from './state';

function stubRules(api: FakeApi) {
  // bxapi's preview accepts every quick action unless a test says otherwise.
  api.previewCandidates.mockImplementation(async (_tableId, candidates) => ({
    revision: 0,
    accepted: Object.keys(candidates),
  }));
  api.rules.mockImplementation(async (path: string) => {
    if (path === 'classes/cleric') return { id: 'cleric', abilities: [{ tag: 'turn_undead' }] } as never;
    if (path.startsWith('classes/')) return { id: path.slice(8), abilities: [] } as never;
    return { abilities: [] } as never;
  });
}

function row(name: string): HTMLElement {
  const item = screen.getAllByRole('listitem').find((li) => within(li).queryByText(name, { exact: true }));
  if (!item) throw new Error(`No row for ${name}.`);
  return item;
}

beforeEach(() => {
  resetCombatMemory();
  resetCombatUi();
  resetQuickActions();
});

/**
 * The battle fixture with bxapi's hide and back-stab lists set: on the encounter, and on the preview's projection,
 * or with no projection when `projection` is `null`.
 */
function withLists(lists: {
  role?: 'player' | 'referee';
  encounter?: { can_hide?: string[]; can_back_stab?: string[] };
  projection?: { can_hide?: string[]; can_back_stab?: string[] } | null;
}): Snapshot {
  const snapshot = fixtureSnapshot('battle', lists.role ?? 'player');
  const encounter = snapshot.game?.view.encounter;
  const declarations = snapshot.declarations;
  if (!encounter || !declarations?.projection) throw new Error('The fixture has no encounter or projection.');
  Object.assign(encounter, lists.encounter);
  if (lists.projection === null) declarations.projection = null;
  else Object.assign(declarations.projection, lists.projection);
  return snapshot;
}

/** The battle fixture with every declarer declared, and automatic resolution on or off. */
function everyoneDeclared(role: 'player' | 'referee', autoResolve: boolean): Snapshot {
  const snapshot = fixtureSnapshot('battle', role);
  const declarations = snapshot.declarations as DeclarationsState;
  declarations.declared = [...declarations.declarers];
  for (const id of declarations.declarers)
    declarations.declarations[id] ??= { action: 'hold', character_id: id } as never;
  if (snapshot.table) snapshot.table.settings.auto_resolve = autoResolve;
  return snapshot;
}

/** The board's footer, which says who still has to declare and what starts the round. */
function footer(): HTMLElement {
  return screen.getByRole('contentinfo');
}

/** A resolved round in the feed, as the server pushes it. */
function roundEntry(snapshot: Snapshot, offset: number, round: number): FeedEntry {
  const last = snapshot.feed.entries.at(-1)?.seq ?? 0;
  return {
    seq: last + offset,
    created_at: '2026-11-22T05:20:00Z',
    user_id: null,
    visibility: 'everyone',
    to: [],
    kind: 'game',
    command_type: 'resolve_battle_round',
    revision: (snapshot.game?.revision ?? 0) + offset,
    session_id: snapshot.game?.session_id ?? '',
    messages: [],
    events: [
      { event_type: 'battle_round', code: 'battle.round.started', visibility: 'player', round },
      {
        event_type: 'damage_dealt',
        code: 'combat.damage.dealt',
        visibility: 'player',
        target_id: 'character-0001',
        attacker_id: 'monster-0001',
        amount: round,
        rolls: [round],
        keys: [],
        non_regenerable: false,
      },
    ] as never,
  };
}

describe('BattleBoard', () => {
  it('shows a player each saved declaration, who the table waits for, and what starts the round', () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<BattleBoard />, { snapshot: fixtureSnapshot('battle', 'player'), api });
    expect(within(row('Brenna')).getByText(/Declared:/)).toBeInTheDocument();
    expect(within(row('Brenna')).getByText(/Attack the goblins/)).toBeInTheDocument();
    expect(within(row('Brenna')).getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(within(row('Wren')).getByText('Not declared yet')).toBeInTheDocument();
    expect(within(row('Osric')).getByText('Waiting for Ruth')).toBeInTheDocument();
    expect(footer()).toHaveTextContent('1 of 4 declared for round 1');
    expect(footer()).toHaveTextContent(/Waiting for.*you \(Wren\).*Ruth \(Osric and Tamsin\)/);
    expect(footer()).toHaveTextContent('The round resolves by itself as soon as everyone has declared.');
    // Only a referee can resolve early.
    expect(screen.queryByRole('button', { name: 'Resolve now' })).not.toBeInTheDocument();
  });

  it("asks a player to declare while one of their characters hasn't", () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<BattleBoard />, { snapshot: fixtureSnapshot('battle', 'player'), api });
    expect(screen.getByText('Declare an action for each of your characters.')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for the party to declare.')).not.toBeInTheDocument();
  });

  it('says the board waits for the party once all of the viewer’s characters have declared', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.declarations['character-0002'] = { action: 'hold', character_id: 'character-0002' } as never;
    declarations.declared = [...declarations.declared, 'character-0002'];
    renderWithTable(<BattleBoard />, { snapshot, api });
    expect(screen.getByText('Waiting for the party to declare.')).toBeInTheDocument();
    expect(screen.queryByText('Declare an action for each of your characters.')).not.toBeInTheDocument();
  });

  it('leaves the strip above the rows empty once everyone has declared, since the footer says so', () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<BattleBoard />, { snapshot: everyoneDeclared('player', false), api });
    expect(screen.queryByText('Declare an action for each of your characters.')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for the party to declare.')).not.toBeInTheDocument();
    expect(footer()).toHaveTextContent('Everyone has declared');
  });

  it('tells a player who is not the caller who resolves the round once everyone has declared', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = everyoneDeclared('player', false);
    const ruth = snapshot.table?.members.find((m) => m.role === 'referee')?.user_id ?? null;
    if (snapshot.table) snapshot.table.settings.caller_user_id = ruth;
    renderWithTable(<BattleBoard />, { snapshot, api });
    expect(footer()).toHaveTextContent('4 of 4 declared');
    expect(footer()).toHaveTextContent('Everyone has declared');
    expect(footer()).toHaveTextContent(
      'Everyone has declared. Waiting for Ruth (the caller) or the referee to resolve the round.',
    );
    expect(screen.queryByRole('button', { name: 'Resolve round' })).not.toBeInTheDocument();
  });

  it('lets the caller resolve the round once everyone has declared, with automatic resolution off', async () => {
    const api = createFakeApi();
    stubRules(api);
    api.resolveRound.mockRejectedValue(new Error('stop here'));
    const { user, store } = renderWithTable(<BattleBoard />, {
      snapshot: everyoneDeclared('player', false),
      api,
    });
    expect(footer()).toHaveTextContent("Everyone has declared. Resolve the round when you're ready.");
    await user.click(screen.getByRole('button', { name: 'Resolve round' }));
    await waitFor(() => expect(api.resolveRound).toHaveBeenCalledWith(store.getState().tableId, false));
  });

  it('shows a referee the same status, and what Resolve now does with those who have not declared', () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<BattleBoard />, { snapshot: fixtureSnapshot('battle', 'referee'), api });
    expect(within(row('Brenna')).getByText(/Declared:/)).toBeInTheDocument();
    expect(footer()).toHaveTextContent('1 of 4 declared for round 1');
    expect(footer()).toHaveTextContent(/Waiting for.*Sam \(Wren\).*you \(Osric and Tamsin\)/);
    expect(footer()).toHaveTextContent(
      "The round resolves by itself as soon as everyone has declared. Resolve now starts it at once, and anyone who hasn't declared holds.",
    );
    expect(screen.getByRole('button', { name: 'Resolve now' })).toBeInTheDocument();
  });

  it('shows a referee that everyone has declared and offers to resolve the round', () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<BattleBoard />, { snapshot: everyoneDeclared('referee', false), api });
    expect(footer()).toHaveTextContent("Everyone has declared. Resolve the round when you're ready.");
    expect(screen.getByRole('button', { name: 'Resolve round' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve now' })).not.toBeInTheDocument();
  });

  it('marks the saved choice in the composer, and leaves the row to say what is declared', async () => {
    const api = createFakeApi();
    stubRules(api);
    const { user } = renderWithTable(<BattleBoard />, { snapshot: fixtureSnapshot('battle', 'player'), api });
    await user.click(within(row('Brenna')).getByRole('button', { name: 'Change' }));
    const brenna = screen.getByRole('region', { name: 'Declare for Brenna' });
    // The row already says "Declared:" and offers Change, so the composer doesn't repeat it.
    expect(brenna).not.toHaveTextContent(/has declared/);
    expect(within(row('Brenna')).getByText(/Declared:/)).toBeInTheDocument();
    expect(
      within(brenna).getByRole('button', { name: /^(Attack|Close in and attack): the goblins/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('declares the common case in one click', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    api.declare.mockResolvedValue(snapshot.declarations as DeclarationsState);
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(await within(row('Wren')).findByRole('button', { name: /goblins/ }));
    expect(api.declare).toHaveBeenCalledWith(
      store.getState().tableId,
      'character-0002',
      expect.objectContaining({ target_group_id: 'group-0001' }),
    );
  });

  it('offers no quick action until bxapi answers, and none that bxapi refuses', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const wren = snapshot.game?.view.party.find((m) => m.name === 'Wren');
    if (!wren) throw new Error('No Wren in the fixture.');
    // Wren carries only a sling, so her one choice to check is a shot at the goblins.
    wren.inventory = {
      ...wren.inventory,
      wielded: [
        {
          instance_type: 'item',
          quantity: 1,
          template: {
            item_type: 'weapon',
            id: 'sling',
            name: 'Sling',
            qualities: ['blunt', 'missile'],
            missile_ranges: { long: { max_feet: 160 } },
          },
        },
      ],
    };
    let answer: () => void = () => undefined;
    api.previewCandidates.mockImplementation(async () => {
      await new Promise<void>((resolve) => (answer = resolve));
      return { revision: 0, accepted: [] };
    });
    renderWithTable(<BattleBoard />, { snapshot, api });
    await waitFor(() =>
      expect(api.previewCandidates).toHaveBeenCalledWith(expect.any(String), {
        'character-0002': { action: 'attack', target_group_id: 'group-0001' },
      }),
    );
    expect(within(row('Wren')).queryByRole('button', { name: /goblins/ })).not.toBeInTheDocument();
    await act(async () => answer());
    // bxapi refused the shot, so Wren's row offers only Actions.
    await waitFor(() => expect(api.previewCandidates).toHaveBeenCalledTimes(1));
    expect(within(row('Wren')).getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(within(row('Wren')).queryByRole('button', { name: /goblins/ })).not.toBeInTheDocument();
  });

  it('keeps the previous quick button in place, busy, while bxapi answers for the new state', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    let release: () => void = () => undefined;
    let calls = 0;
    api.previewCandidates.mockImplementation(async (_tableId, candidates) => {
      calls += 1;
      if (calls > 1) await new Promise<void>((resolve) => (release = resolve));
      return { revision: 0, accepted: Object.keys(candidates) };
    });
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    const quick = await within(row('Wren')).findByRole('button', { name: /goblins/ });
    expect(quick).not.toHaveAttribute('aria-busy');
    // Another member's declaration changes the state, and bxapi's new answer is out.
    const declarations = snapshot.declarations as DeclarationsState;
    act(() => {
      store.getState().receive({
        type: 'declarations',
        declarations: {
          ...declarations,
          declarations: {
            ...declarations.declarations,
            'character-0003': { action: 'hold', character_id: 'character-0003' } as never,
          },
          declared: [...declarations.declared, 'character-0003'],
        },
      });
    });
    await waitFor(() => expect(calls).toBe(2));
    const waiting = within(row('Wren')).getByRole('button', { name: /goblins/ });
    expect(waiting).toHaveAttribute('aria-busy', 'true');
    await user.click(waiting);
    expect(api.declare).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() =>
      expect(within(row('Wren')).getByRole('button', { name: /goblins/ })).not.toHaveAttribute('aria-busy'),
    );
  });

  it('declares from the composer', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    api.declare.mockResolvedValue(snapshot.declarations as DeclarationsState);
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Hold' }));
    await user.click(within(composer).getByRole('button', { name: 'Hold this round' }));
    expect(api.declare).toHaveBeenCalledWith(store.getState().tableId, 'character-0002', { action: 'hold' });
  });

  it('offers an attack on a group however far it stands, and leaves the reach to the preview', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const encounter = snapshot.game?.view.encounter;
    const group = encounter?.groups[0];
    if (!encounter || !group) throw new Error('No group in the fixture.');
    // Wren stands far behind the others, out of any reach the browser could work out.
    group.member_distance_feet['character-0002'] = 400;
    group.front_rank = [];
    encounter.advance_feet = { ...encounter.advance_feet, 'character-0002': -300 };
    api.declare.mockResolvedValue(snapshot.declarations as DeclarationsState);
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Attack' }));
    const close = within(composer).getByRole('button', { name: /^Close in and attack: the goblins/ });
    expect(close).not.toHaveAttribute('aria-disabled');
    expect(composer).not.toHaveTextContent(/Out of (reach|range)/);
    await user.click(close);
    expect(api.declare).toHaveBeenCalledWith(store.getState().tableId, 'character-0002', {
      action: 'attack',
      target_group_id: 'group-0001',
      move: 'close',
    });
  });

  it('shows a refused declaration next to its member', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.refusals = [
      {
        member_id: 'character-0001',
        code: 'battle.declaration.not_in_front_rank',
        params: { character: 'character-0001' },
      },
    ];
    renderWithTable(<BattleBoard />, { snapshot, api });
    const line = within(row('Brenna')).getByText(/front rank/);
    // The line is a polite live region, so a new refusal is announced without interrupting.
    expect(line).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps the round from resolving while the preview refuses a declaration, and says who has to change', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = everyoneDeclared('player', false);
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.refusals = [
      {
        member_id: 'character-0001',
        code: 'combat.attack.out_of_reach',
        params: { character: 'character-0001', distance_feet: 40 },
      },
    ];
    renderWithTable(<BattleBoard />, { snapshot, api });
    const resolve = screen.getByRole('button', { name: 'Resolve round' });
    expect(resolve).toHaveAttribute('aria-disabled', 'true');
    expect(resolve).toHaveAccessibleDescription('Brenna needs a different action first.');
    expect(footer()).toHaveTextContent('Brenna needs a different action before the round can resolve.');
  });

  it("marks a refused member's row as won't work, with the reason as the Change button's description", () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.refusals = [
      {
        member_id: 'character-0001',
        code: 'battle.declaration.not_in_front_rank',
        params: { character: 'character-0001' },
      },
    ];
    renderWithTable(<BattleBoard />, { snapshot, api });
    const brenna = row('Brenna');
    expect(brenna).toHaveTextContent(/Won't work: Attack the goblins/);
    expect(within(brenna).queryByText(/Declared:/)).not.toBeInTheDocument();
    const change = within(brenna).getByRole('button', { name: 'Change' });
    expect(change).toHaveAccessibleDescription(/Brenna isn't in the front rank/);
    // The note that the round waits sits in the footer's polite live region, not in an alert on the row.
    expect(within(brenna).queryByRole('alert')).not.toBeInTheDocument();
    const note = within(footer()).getByText('Brenna needs a different action before the round can resolve.');
    expect(note.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('shows the refusal once in the composer, under the saved choice, or as a line at the top on another tab', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.refusals = [
      {
        member_id: 'character-0001',
        code: 'battle.declaration.not_in_front_rank',
        params: { character: 'character-0001' },
      },
    ];
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Brenna')).getByRole('button', { name: 'Change' }));
    const composer = screen.getByRole('region', { name: 'Declare for Brenna' });
    const saved = within(composer).getByRole('button', {
      name: /^(Attack|Close in and attack): the goblins/,
    });
    expect(saved).toHaveAttribute('aria-pressed', 'true');
    expect(saved).toHaveAccessibleDescription(/Brenna isn't in the front rank/);
    expect(composer.textContent?.match(/Brenna isn't in the front rank/g)).toHaveLength(1);
    await user.click(within(composer).getByRole('radio', { name: 'Move' }));
    // On another tab it shows once at the top, as a line, not a banner, and the row's live region speaks it.
    expect(composer.textContent?.match(/Brenna isn't in the front rank/g)).toHaveLength(1);
    expect(within(composer).queryByRole('status')).not.toBeInTheDocument();
    expect(within(composer).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the round resolve when a refusal names a member who can no longer act', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = everyoneDeclared('player', false);
    const declarations = snapshot.declarations as DeclarationsState;
    // Tamsin fell, so she isn't a declarer any more, and a stale refusal still names her.
    declarations.declarers = declarations.declarers.filter((id) => id !== 'character-0004');
    declarations.declared = [...declarations.declarers];
    declarations.refusals = [
      {
        member_id: 'character-0004',
        code: 'combat.attack.out_of_reach',
        params: { character: 'character-0004', distance_feet: 40 },
      },
    ];
    renderWithTable(<BattleBoard />, { snapshot, api });
    const resolve = screen.getByRole('button', { name: 'Resolve round' });
    expect(resolve).not.toHaveAttribute('aria-disabled');
    expect(footer()).not.toHaveTextContent(/needs a different action/);
  });

  it('keeps Resolve round unavailable after bxapi refused the round as a whole, until an action changes', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = everyoneDeclared('player', false);
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.refusals = [
      { member_id: null, code: 'combat.attack.out_of_reach', params: { distance_feet: 40 } },
    ];
    renderWithTable(<BattleBoard />, { snapshot, api });
    const resolve = screen.getByRole('button', { name: 'Resolve round' });
    expect(resolve).toHaveAttribute('aria-disabled', 'true');
    expect(resolve).toHaveAccessibleDescription("The round can't resolve until an action changes.");
  });

  it("says when the actions can't be checked, as a polite status, and keeps Resolve round available", () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = everyoneDeclared('player', false);
    (snapshot.declarations as DeclarationsState).preview_unavailable = true;
    renderWithTable(<BattleBoard />, { snapshot, api });
    const line = within(footer()).getByRole('status');
    expect(line).toHaveTextContent(
      "Actions can't be checked right now. If one won't work, you'll find out when the round resolves.",
    );
    expect(within(footer()).queryByRole('alert')).not.toBeInTheDocument();
    const resolve = screen.getByRole('button', { name: 'Resolve round' });
    expect(resolve).not.toHaveAttribute('aria-disabled');
    expect(resolve).not.toHaveAccessibleDescription();
  });

  it('says nothing about checking while the actions can be checked', () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<BattleBoard />, { snapshot: everyoneDeclared('player', false), api });
    expect(within(footer()).queryByText(/can't be checked/)).not.toBeInTheDocument();
  });

  it("marks a hiding member without saying whether the hide worked, and offers the hide to the view's list", async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const encounter = snapshot.game?.view.encounter;
    if (!encounter) throw new Error('No encounter in the fixture.');
    encounter.can_hide = ['character-0002'];
    encounter.hiding = ['character-0001'];
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    expect(within(row('Brenna')).getByText('Hiding')).toBeInTheDocument();
    expect(within(row('Wren')).queryByText('Hiding')).not.toBeInTheDocument();
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Hide' }));
    await user.click(within(composer).getByRole('button', { name: 'Hide in shadows' }));
    expect(api.declare).toHaveBeenCalledWith(store.getState().tableId, 'character-0002', { action: 'hide' });
  });

  it("keeps the Hide tab for a member's own saved hide when the lists leave her out, and shows the refusal", async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({ encounter: { can_hide: [] }, projection: { can_hide: [] } });
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.declarations['character-0002'] = { character_id: 'character-0002', action: 'hide' } as never;
    declarations.declared = [...declarations.declared, 'character-0002'];
    declarations.refusals = [
      {
        member_id: 'character-0002',
        code: 'battle.declaration.hide_in_front_rank',
        params: { character: 'character-0002' },
      },
    ];
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    // The row names the hide as the button did, not as "An action", and says why it won't work.
    expect(row('Wren')).toHaveTextContent(/Won't work: Hide in shadows/);
    expect(
      within(row('Wren')).getAllByText(/Wren will be in the front rank this round and can't hide there/)
        .length,
    ).toBeGreaterThan(0);
    await user.click(within(row('Wren')).getByRole('button', { name: 'Change' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    expect(within(composer).getByRole('radio', { name: 'Hide' })).toBeChecked();
    await user.click(within(composer).getByRole('button', { name: 'Hide in shadows' }));
    expect(api.declare).toHaveBeenCalledWith(store.getState().tableId, 'character-0002', { action: 'hide' });
  });

  it("offers Hide from the encounter's list when there is no preview, and to no one else", async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({
      role: 'referee',
      encounter: { can_hide: ['character-0002'] },
      projection: null,
    });
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: /Declare for Wren|Actions/ }));
    expect(
      within(screen.getByRole('region', { name: 'Declare for Wren' })).getByRole('radio', { name: 'Hide' }),
    ).toBeInTheDocument();
    await user.click(within(row('Tamsin')).getByRole('button', { name: /Declare for Tamsin|Actions/ }));
    expect(
      within(screen.getByRole('region', { name: 'Declare for Tamsin' })).queryByRole('radio', {
        name: 'Hide',
      }),
    ).not.toBeInTheDocument();
  });

  it("reads Hide and Back-stab from the preview's lists over the encounter's", async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({
      encounter: { can_hide: ['character-0002'], can_back_stab: [] },
      projection: { can_hide: [], can_back_stab: ['character-0002'] },
    });
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    expect(within(composer).queryByRole('radio', { name: 'Hide' })).not.toBeInTheDocument();
    await user.click(within(composer).getByRole('radio', { name: 'Attack' }));
    expect(within(composer).getByRole('checkbox', { name: 'Back-stab' })).toBeChecked();
  });

  it("shows no Back-stab to a member the lists leave out, unless it's her own saved choice", async () => {
    const api = createFakeApi();
    stubRules(api);
    const empty = withLists({ encounter: { can_back_stab: [] }, projection: { can_back_stab: [] } });
    const first = renderWithTable(<BattleBoard />, { snapshot: empty, api });
    await first.user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    let composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await first.user.click(within(composer).getByRole('radio', { name: 'Attack' }));
    expect(within(composer).queryByRole('checkbox', { name: 'Back-stab' })).not.toBeInTheDocument();
    first.unmount();

    const saved = withLists({ encounter: { can_back_stab: [] }, projection: { can_back_stab: [] } });
    const declarations = saved.declarations as DeclarationsState;
    declarations.declarations['character-0002'] = {
      character_id: 'character-0002',
      action: 'attack',
      target_group_id: 'group-0001',
      move: 'close',
      back_stab: true,
    } as never;
    declarations.declared = [...declarations.declared, 'character-0002'];
    const second = renderWithTable(<BattleBoard />, { snapshot: saved, api });
    await second.user.click(within(row('Wren')).getByRole('button', { name: 'Change' }));
    composer = screen.getByRole('region', { name: 'Declare for Wren' });
    expect(within(composer).getByRole('checkbox', { name: 'Back-stab' })).toBeChecked();
  });

  it('keeps the open Hide tab, disabled with a reason, when the member leaves can_hide', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({ projection: { can_hide: ['character-0002'] } });
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Hide' }));
    // Another member's planned move puts Wren in the front rank, so the preview drops her from the list.
    const declarations = structuredClone(store.getState().declarations) as DeclarationsState;
    if (declarations.projection) declarations.projection.can_hide = [];
    act(() => store.getState().receive({ type: 'declarations', declarations }));
    const hide = within(composer).getByRole('button', { name: 'Hide in shadows' });
    await waitFor(() => expect(hide).toHaveAttribute('aria-disabled', 'true'));
    expect(hide).toHaveAccessibleDescription("Wren can't hide this round.");
    expect(within(composer).getByRole('radio', { name: 'Hide' })).toBeChecked();
  });

  it('offers no hide to a member who is not in can_hide', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({
      role: 'referee',
      encounter: { can_hide: [] },
      projection: { can_hide: [] },
    });
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Tamsin')).getByRole('button', { name: /Declare for Tamsin|Actions/ }));
    const composer = screen.getByRole('region', { name: 'Declare for Tamsin' });
    expect(within(composer).queryByRole('radio', { name: 'Hide' })).not.toBeInTheDocument();
  });

  it("offers a back-stab to a member in the encounter's can_back_stab when there is no preview", async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({ encounter: { can_back_stab: ['character-0002'] }, projection: null });
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Attack' }));
    expect(within(composer).getByRole('checkbox', { name: /Back-stab/ })).toBeInTheDocument();
  });

  it('offers a member in can_back_stab a back-stab as the quick action, and starts the Back-stab box checked', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({ projection: { can_back_stab: ['character-0002'] } });
    api.declare.mockResolvedValue(snapshot.declarations as DeclarationsState);
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    // The goblins stand 30 feet off, within Wren's move, so she closes in to strike.
    const quick = await within(row('Wren')).findByRole('button', {
      name: 'Back-stab the goblins, closing in',
    });
    await user.click(quick);
    expect(api.declare).toHaveBeenCalledWith(
      store.getState().tableId,
      'character-0002',
      expect.objectContaining({ action: 'attack', target_group_id: 'group-0001', back_stab: true }),
    );
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Attack' }));
    const box = within(composer).getByRole('checkbox', { name: 'Back-stab' });
    expect(box).toBeChecked();
    expect(box).toHaveAccessibleDescription("Strike a monster that hasn't noticed Wren.");
  });

  it('offers a thief outside can_back_stab the usual quick action, not a back-stab', async () => {
    const api = createFakeApi();
    stubRules(api);
    renderWithTable(<BattleBoard />, { snapshot: withLists({ projection: { can_back_stab: [] } }), api });
    expect(await within(row('Wren')).findByRole('button', { name: /goblins/ })).toBeInTheDocument();
    expect(within(row('Wren')).queryByRole('button', { name: /^Back-stab/ })).not.toBeInTheDocument();
  });

  it("disables the Close in tile for a member already in melee, from the group's front rank", async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({ role: 'referee' });
    const group = snapshot.game?.view.encounter?.groups[0];
    if (!group) throw new Error('No group in the fixture.');
    group.front_rank = ['character-0002'];
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: /Declare for Wren|Actions/ }));
    let composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Move' }));
    const close = within(composer).getByRole('button', { name: /^Close in on/ });
    expect(close).toHaveAttribute('aria-disabled', 'true');
    expect(close).toHaveAccessibleDescription('Wren is already in melee with the goblins.');
    const retreat = within(composer).getByRole('button', { name: 'Retreat' });
    expect(retreat).toHaveAccessibleDescription('Turn and run without attacking.');
    // The trade-places choice has a visible label, and its options are the members.
    const trade = within(composer).getByRole('combobox', { name: 'Trade places with' });
    expect(within(composer).getByText('Trade places with')).toBeVisible();
    await user.click(trade);
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'No one',
      'Brenna',
      'Osric',
      'Tamsin',
    ]);
    await user.keyboard('{Escape}');
    await user.click(within(row('Tamsin')).getByRole('button', { name: /Declare for Tamsin|Actions/ }));
    composer = screen.getByRole('region', { name: 'Declare for Tamsin' });
    await user.click(within(composer).getByRole('radio', { name: 'Move' }));
    expect(within(composer).getByRole('button', { name: /^Close in on/ })).toHaveAccessibleDescription(
      'Move toward them without attacking.',
    );
  });

  it('gives the Hide tab one line that sets up the back-stab, without restating who may hide', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Hide' }));
    expect(
      within(composer).getByText(
        'Wren slips into the shadows to set up a back-stab. The referee rolls in secret.',
      ),
    ).toBeInTheDocument();
    expect(composer).not.toHaveTextContent(/front rank/);
  });

  it('marks where a member will stand after the declared moves', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.projection = {
      advance_feet: { 'character-0001': 35, 'character-0002': 0, 'character-0003': 0, 'character-0004': 0 },
      front_rank: { 'group-0001': ['character-0001'] },
      can_hide: [],
      can_back_stab: [],
    };
    renderWithTable(<BattleBoard />, { snapshot, api });
    expect(
      screen.getAllByText(/^Brenna, .*will move to 35 feet past the party line$/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/^Wren, .*will (move|fall back)/)).not.toBeInTheDocument();
  });

  it('marks each planned place with a faded portrait in a ring, and draws no line to it', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.projection = {
      advance_feet: { 'character-0001': 35, 'character-0002': 20, 'character-0003': 0, 'character-0004': 0 },
      front_rank: { 'group-0001': ['character-0001', 'character-0002'] },
      can_hide: [],
      can_back_stab: [],
    };
    const { container } = renderWithTable(<BattleBoard />, { snapshot, api });
    // Every element styled for the plan is a marker, one per mover, so no connector line joins them.
    const planned = [...container.querySelectorAll('[class*="planned"]')];
    expect(planned).toHaveLength(2);
    for (const marker of planned) {
      expect(marker).toHaveAttribute('aria-hidden', 'true');
      expect(marker.querySelector('svg')).not.toBeNull();
    }
  });

  it('lets the referee resolve early after a confirmation, holding for the rest', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'referee');
    api.resolveRound.mockRejectedValue(new Error('stop here'));
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(screen.getByRole('button', { name: 'Resolve now' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/Wren, Osric, and Tamsin haven't declared/);
    await user.click(within(dialog).getByRole('button', { name: 'Resolve now' }));
    await waitFor(() => expect(api.resolveRound).toHaveBeenCalledWith(store.getState().tableId, true));
  });

  it('plays a resolved round back, and sums it up at once with reduced motion', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const { store, user } = renderWithTable(<BattleBoard />, {
      snapshot,
      api,
      preferences: { motion: 'reduce' },
    });
    act(() => store.getState().receive({ type: 'feed', entry: roundEntry(snapshot, 1, 2) }));
    expect(await screen.findByText('Round 2 result')).toBeInTheDocument();
    expect(screen.getByText('2 damage taken')).toBeInTheDocument();
    // A replay starts paused, so a viewer who reduces motion steps through it.
    await user.click(screen.getByRole('button', { name: 'Replay' }));
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Round 2 begins.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Step forward' }));
    expect(screen.getByText(/Brenna takes 2 damage|2 damage/)).toBeInTheDocument();
  });

  it('pauses a round, and a round that resolves meanwhile replaces it, still paused, with the old one a step back', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const { store, user } = renderWithTable(<BattleBoard />, {
      snapshot,
      api,
      preferences: { motion: 'full', playbackSpeed: 'slow' },
    });
    act(() => store.getState().receive({ type: 'feed', entry: roundEntry(snapshot, 1, 2) }));
    expect(await screen.findByText('Round 2 begins.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause playback' }));
    expect(screen.getByText('Paused')).toBeInTheDocument();

    // Another player declared and the next round resolved while this viewer was paused.
    act(() => store.getState().receive({ type: 'feed', entry: roundEntry(snapshot, 2, 3) }));
    expect(await screen.findByText('Round 3 begins.')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume playback' })).toBeInTheDocument();
    // The declarations below the strip are the live ones, whatever the playback shows.
    expect(footer()).toHaveTextContent('1 of 4 declared');

    // One step back reaches the end of the round that was replaced.
    await user.click(screen.getByRole('button', { name: 'Step back' }));
    expect(screen.queryByText('Round 3 begins.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume playback' })).toBeInTheDocument();

    // Skip lands on the summary of the newest round.
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Round 3 result')).toBeInTheDocument();
  });

  it('dims the rows and the footer while a round plays back, keeps them usable, and holds the live Hiding badge', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const encounter = snapshot.game?.view.encounter;
    if (!encounter) throw new Error('No encounter in the fixture.');
    encounter.hiding = ['character-0001'];
    api.declare.mockResolvedValue(snapshot.declarations as DeclarationsState);
    const { store, user } = renderWithTable(<BattleBoard />, {
      snapshot,
      api,
      preferences: { motion: 'full', playbackSpeed: 'slow' },
    });
    const list = screen.getByRole('list', { name: 'Actions this round' });
    expect(within(row('Brenna')).getByText('Hiding')).toBeInTheDocument();
    // A keyboard user is on Brenna's Change button when the round resolves.
    const change = within(row('Brenna')).getByRole('button', { name: 'Change' });
    change.focus();
    act(() => store.getState().receive({ type: 'feed', entry: roundEntry(snapshot, 1, 2) }));
    expect(await screen.findByText('Round 2 begins.')).toBeInTheDocument();
    expect(list).not.toHaveAttribute('inert');
    expect(footer()).not.toHaveAttribute('inert');
    expect(row('Brenna').className).toMatch(/dimmedForPlayback/);
    expect(footer().className).toMatch(/dimmedForPlayback/);
    // Focus stays where it was.
    expect(change).toHaveFocus();
    // The live view already lists the hide, but the round that sets it up hasn't played yet.
    expect(within(row('Brenna')).queryByText('Hiding')).not.toBeInTheDocument();

    // The player declares for the next round while the last one plays back.
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Hold' }));
    await user.click(within(composer).getByRole('button', { name: 'Hold this round' }));
    expect(api.declare).toHaveBeenCalledWith(store.getState().tableId, 'character-0002', { action: 'hold' });
    expect(screen.getByText('Round 2 begins.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Round 2 result')).toBeInTheDocument();
    expect(row('Brenna').className).not.toMatch(/dimmedForPlayback/);
    expect(footer().className).not.toMatch(/dimmedForPlayback/);
    expect(within(row('Brenna')).getByText('Hiding')).toBeInTheDocument();
  });

  it('remembers the speed each viewer chooses', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const { store, user } = renderWithTable(<BattleBoard />, {
      snapshot,
      api,
      preferences: { motion: 'full' },
    });
    act(() => store.getState().receive({ type: 'feed', entry: roundEntry(snapshot, 1, 2) }));
    await user.click(await screen.findByRole('button', { name: 'Playback speed: Normal' }));
    // A screen reader hears which speed is chosen: each speed is a checkable menu item.
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Normal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemcheckbox', { name: 'Fast' })).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Fast' }));
    expect(screen.getByRole('button', { name: 'Playback speed: Fast' })).toBeInTheDocument();
    expect(usePreferences.getState().playbackSpeed).toBe('fast');
  });

  it('keeps keyboard focus in the strip when a round finishes, and when a replay starts', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const { store, user } = renderWithTable(<BattleBoard />, {
      snapshot,
      api,
      preferences: { motion: 'full', playbackSpeed: 'fastest' },
    });
    act(() => store.getState().receive({ type: 'feed', entry: roundEntry(snapshot, 1, 2) }));
    // The keyboard user pauses, resumes, and lets the round finish.
    const pause = await screen.findByRole('button', { name: 'Pause playback' });
    pause.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Resume playback' })).toHaveFocus();
    await user.keyboard('{Enter}');
    const replay = await screen.findByRole('button', { name: 'Replay' }, { timeout: 4000 });
    expect(replay).toHaveFocus();
    // Replay hands focus back to the pause button.
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Pause playback' })).toHaveFocus();
  });
});

describe('the composer sends only what it shows', () => {
  /** The body of the last declaration the API received. */
  function lastBody(api: FakeApi): Record<string, unknown> {
    const call = api.declare.mock.calls.at(-1);
    if (!call) throw new Error('Nothing was declared.');
    return call[2] as Record<string, unknown>;
  }

  it('sends no back-stab once the lists drop the member and the Back-stab box goes', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({
      encounter: { can_back_stab: [] },
      projection: { can_back_stab: ['character-0002'] },
    });
    api.declare.mockResolvedValue(snapshot.declarations as DeclarationsState);
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Attack' }));
    expect(within(composer).getByRole('checkbox', { name: 'Back-stab' })).toBeChecked();
    const declarations = structuredClone(store.getState().declarations) as DeclarationsState;
    if (declarations.projection) declarations.projection.can_back_stab = [];
    act(() => store.getState().receive({ type: 'declarations', declarations }));
    await waitFor(() =>
      expect(within(composer).queryByRole('checkbox', { name: 'Back-stab' })).not.toBeInTheDocument(),
    );
    await user.click(within(composer).getByRole('button', { name: /the goblins/ }));
    expect(lastBody(api).back_stab).not.toBe(true);
  });

  it('sends no back-stab after the player unchecks a saved one the lists no longer offer', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({ encounter: { can_back_stab: [] }, projection: { can_back_stab: [] } });
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.declarations['character-0002'] = {
      character_id: 'character-0002',
      action: 'attack',
      target_group_id: 'group-0001',
      move: 'close',
      back_stab: true,
    } as never;
    declarations.declared = [...declarations.declared, 'character-0002'];
    api.declare.mockResolvedValue(declarations);
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Change' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('checkbox', { name: 'Back-stab' }));
    await user.click(within(composer).getByRole('button', { name: /the goblins/ }));
    expect(lastBody(api).back_stab).not.toBe(true);
  });

  it("starts at no guard when a saved mirror guard's member no longer carries a mirror", async () => {
    const api = createFakeApi();
    api.rules.mockImplementation(async (path: string) => {
      if (path === 'monsters') return { items: [{ id: 'goblin' }], total: 1 } as never;
      if (path === 'monsters/goblin')
        return { abilities: [{ tag: 'petrification', params: { vector: 'gaze' } }] } as never;
      if (path.startsWith('classes/')) return { id: path.slice(8), abilities: [] } as never;
      return { abilities: [] } as never;
    });
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.declarations['character-0002'] = {
      character_id: 'character-0002',
      action: 'hold',
      gaze_defense: 'mirror',
    } as never;
    declarations.declared = [...declarations.declared, 'character-0002'];
    api.declare.mockResolvedValue(declarations);
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Change' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    const guard = await within(composer).findByRole('combobox', { name: 'Guard against the gaze' });
    expect(guard).toHaveTextContent('No guard');
    await user.click(within(composer).getByRole('button', { name: 'Hold this round' }));
    expect(lastBody(api)).toEqual({ action: 'hold' });
  });
});

describe("the preview's projection after a round resolves", () => {
  it("falls back to the encounter's lists and plans no places until the new round's declarations arrive", async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = withLists({
      encounter: { can_back_stab: [] },
      projection: { can_back_stab: ['character-0002'] },
    });
    const declarations = snapshot.declarations as DeclarationsState;
    if (declarations.projection)
      declarations.projection.advance_feet = {
        ...declarations.projection.advance_feet,
        'character-0001': 35,
      };
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    expect(
      screen.getAllByText(/^Brenna, .*will move to 35 feet past the party line$/).length,
    ).toBeGreaterThan(0);
    // The resolved round's game arrives before the declarations frame for the new round.
    const game = store.getState().game;
    if (!game) throw new Error('No game.');
    act(() => store.getState().receive({ type: 'game', game: { ...game, revision: game.revision + 1 } }));
    await waitFor(() => expect(screen.queryByText(/^Brenna, .*will move to/)).not.toBeInTheDocument());
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Attack' }));
    expect(within(composer).queryByRole('checkbox', { name: 'Back-stab' })).not.toBeInTheDocument();
  });
});

describe('the board keeps one size through the fight (#64)', () => {
  it('keeps the track full height while a composer is open, and collapses only on Collapse', async () => {
    const api = createFakeApi();
    stubRules(api);
    const { user } = renderWithTable(<BattleBoard />, { snapshot: fixtureSnapshot('battle', 'player'), api });
    const track = screen.getByRole('figure', { name: /^Battlefield/ });
    const before = track.className;
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('region', { name: 'Declare for Wren' })).toBeInTheDocument();
    expect(track.className).toBe(before);
    const collapse = screen.getByRole('button', { name: 'Collapse the battle board' });
    expect(collapse).toHaveTextContent('Collapse');
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute(
      'aria-controls',
      screen.getByRole('list', { name: 'Actions this round' }).id,
    );
    await user.click(collapse);
    const expand = screen.getByRole('button', { name: 'Expand the battle board' });
    expect(expand).toHaveTextContent('Expand');
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    // The member list isn't in the document while the board is collapsed, so the button controls nothing then.
    expect(expand).not.toHaveAttribute('aria-controls');
    expect(screen.getByRole('figure', { name: /^Battlefield/ }).className).not.toBe(before);
  });

  it('closes a composer opened in a round once that round resolves, and keeps one opened for the next round', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    // Focus sits inside the composer when its round resolves.
    within(composer).getAllByRole('button')[0]?.focus();
    expect(composer).toContainElement(document.activeElement as HTMLElement);
    const declarations = snapshot.declarations as DeclarationsState;
    const nextRound = (declarations.round ?? 1) + 1;
    act(() => {
      store.getState().receive({
        type: 'declarations',
        declarations: { ...declarations, round: nextRound, declared: [], declarations: {}, refusals: [] },
      });
    });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Declare for Wren' })).not.toBeInTheDocument(),
    );
    // Focus returns to the row's Actions button rather than to the page.
    expect(within(row('Wren')).getByRole('button', { name: 'Actions' })).toHaveFocus();
    // A composer opened now is for the new round, and it stays when the same round's state arrives again.
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    act(() => {
      store.getState().receive({
        type: 'declarations',
        declarations: { ...declarations, round: nextRound, declared: [], declarations: {}, refusals: [] },
      });
    });
    expect(screen.getByRole('region', { name: 'Declare for Wren' })).toBeInTheDocument();
  });
});
