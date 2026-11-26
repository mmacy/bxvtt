import type { DeclarationsState, FeedEntry } from '@bxvtt/shared/protocol';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePreferences } from '@/app';
import { fixtureSnapshot, type Snapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import { BattleBoard } from './BattleBoard';
import { resetCombatMemory } from './memory';
import { resetCombatUi } from './state';

function stubRules(api: FakeApi) {
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
});

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

  it('says in the composer that choosing declares, and marks the saved choice', async () => {
    const api = createFakeApi();
    stubRules(api);
    const { user } = renderWithTable(<BattleBoard />, { snapshot: fixtureSnapshot('battle', 'player'), api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const wren = screen.getByRole('region', { name: 'Declare for Wren' });
    expect(wren).toHaveTextContent(
      'Choosing an action declares it for Wren this round. You can change it until the round resolves.',
    );
    await user.click(within(wren).getByRole('button', { name: "Close Wren's actions" }));
    await user.click(within(row('Brenna')).getByRole('button', { name: 'Change' }));
    const brenna = screen.getByRole('region', { name: 'Declare for Brenna' });
    expect(brenna).toHaveTextContent(
      'Brenna has declared: Attack the goblins. Choose another action to change it before the round resolves.',
    );
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
    const quick = within(row('Wren')).getAllByRole('button')[0];
    if (!quick) throw new Error('No quick action.');
    await user.click(quick);
    expect(api.declare).toHaveBeenCalledWith(
      store.getState().tableId,
      'character-0002',
      expect.objectContaining({ target_group_id: 'group-0001' }),
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
    expect(within(row('Brenna')).getByText(/front rank/)).toBeInTheDocument();
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
    expect(resolve).toHaveAccessibleDescription('Brenna has to choose another action first.');
    expect(footer()).toHaveTextContent(
      'The round waits for Brenna to choose another action, because the session would refuse that declaration.',
    );
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

  it('offers the hide to a thief the view leaves out of can_hide, and shows the refusal on her row', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const encounter = snapshot.game?.view.encounter;
    if (encounter) encounter.can_hide = [];
    const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Hide' }));
    await user.click(within(composer).getByRole('button', { name: 'Hide in shadows' }));
    expect(api.declare).toHaveBeenCalledWith(store.getState().tableId, 'character-0002', { action: 'hide' });
    // The server's preview refuses it while Wren would stand in the front rank, and the row says why.
    const declarations = structuredClone(store.getState().declarations) as DeclarationsState;
    declarations.declarations['character-0002'] = { character_id: 'character-0002', action: 'hide' } as never;
    declarations.declared = [...declarations.declared, 'character-0002'];
    declarations.refusals = [
      {
        member_id: 'character-0002',
        code: 'battle.declaration.hide_in_front_rank',
        params: { character: 'character-0002' },
      },
    ];
    act(() => store.getState().receive({ type: 'declarations', declarations }));
    await waitFor(() =>
      expect(
        within(row('Wren')).getAllByText(/Wren will stand in the front rank this round, so they can't hide/)
          .length,
      ).toBeGreaterThan(0),
    );
  });

  it('offers no hide to a member without thief skills who is not in can_hide', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'referee');
    const encounter = snapshot.game?.view.encounter;
    if (encounter) encounter.can_hide = [];
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Tamsin')).getByRole('button', { name: /Declare for Tamsin|Actions/ }));
    const composer = screen.getByRole('region', { name: 'Declare for Tamsin' });
    expect(within(composer).queryByRole('radio', { name: 'Hide' })).not.toBeInTheDocument();
  });

  it('offers a back-stab to a hiding member, and leaves the judgement to the session', async () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const encounter = snapshot.game?.view.encounter;
    if (!encounter) throw new Error('No encounter in the fixture.');
    encounter.party_free_round = false;
    encounter.hiding = ['character-0002'];
    const { user } = renderWithTable(<BattleBoard />, { snapshot, api });
    await user.click(within(row('Wren')).getByRole('button', { name: 'Actions' }));
    const composer = screen.getByRole('region', { name: 'Declare for Wren' });
    await user.click(within(composer).getByRole('radio', { name: 'Attack' }));
    expect(within(composer).getByRole('checkbox', { name: /Back-stab/ })).toBeInTheDocument();
  });

  it('marks where a member will stand after the declared moves', () => {
    const api = createFakeApi();
    stubRules(api);
    const snapshot = fixtureSnapshot('battle', 'player');
    const declarations = snapshot.declarations as DeclarationsState;
    declarations.projection = {
      advance_feet: { 'character-0001': 35, 'character-0002': 0, 'character-0003': 0, 'character-0004': 0 },
      front_rank: { 'group-0001': ['character-0001'] },
    };
    renderWithTable(<BattleBoard />, { snapshot, api });
    expect(screen.getAllByText(/^Brenna, .*moves to 35 feet forward this round/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Wren, .*this round/)).not.toBeInTheDocument();
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
