import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { END_GRACE_MS, END_STALL_MS, ShortcutLayer, useCombatStage, useTableUi } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { PlayShell } from './PlayShell';

describe('PlayShell', () => {
  it("shows the mode, the clock, and the caller in a player's exploring game", () => {
    renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('exploring', 'player') });
    const name = screen.getByRole('heading', { name: 'Thursday at the Drowned Bell' });
    const topBar = name.closest('header');
    if (topBar === null) throw new Error('The table name is outside the top bar.');
    expect(within(topBar).getByText('Exploring')).toBeInTheDocument();
    expect(within(topBar).getByText(/^Day 1, /)).toBeInTheDocument();
    expect(screen.getByText('You are the caller')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Map tools' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Referee lens' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Referee/ })).not.toBeInTheDocument();
  });

  it('shows the town stage without map tools in town', () => {
    renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('town', 'player') });
    expect(screen.getByText('In town')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Map tools' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rules reference' })).toBeInTheDocument();
  });

  it('shows the encounter and battle overlays in their modes', () => {
    const { unmount } = renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('encounter', 'player') });
    expect(screen.getByRole('region', { name: 'Encounter' })).toBeInTheDocument();
    unmount();
    renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('battle', 'player') });
    expect(screen.getByRole('region', { name: /^Battle, round/ })).toBeInTheDocument();
  });

  it('hides referee tools when the referee turns the lens off', async () => {
    const { user } = renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('exploring', 'referee') });
    expect(screen.getByRole('tab', { name: /Referee/ })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Referee lens' }));
    expect(screen.queryByRole('tab', { name: /Referee/ })).not.toBeInTheDocument();
  });

  it('offers "Delete table" in the table menu to a referee and not to a player', async () => {
    const player = renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('town', 'player') });
    await player.user.click(screen.getByRole('button', { name: 'Table menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Leave table' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete table' })).not.toBeInTheDocument();
    player.unmount();

    const referee = renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('town', 'referee') });
    await referee.user.click(screen.getByRole('button', { name: 'Table menu' }));
    await referee.user.click(await screen.findByRole('menuitem', { name: 'Delete table' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete table?' })).toBeInTheDocument();
  });

  it('gives a player the table rules to read, and a referee the invite link and the settings', async () => {
    const player = renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('town', 'player') });
    await player.user.click(screen.getByRole('button', { name: 'Table menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Table settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy invite link' })).not.toBeInTheDocument();
    await player.user.click(await screen.findByRole('menuitem', { name: 'Table rules' }));
    const dialog = await screen.findByRole('dialog', { name: 'Table rules' });
    expect(within(dialog).getByText('Ability scores')).toBeInTheDocument();
    expect(within(dialog).queryByText('Changes apply to the next new game.')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument();
    player.unmount();

    const referee = renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('town', 'referee') });
    await referee.user.click(screen.getByRole('button', { name: 'Table menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Copy invite link' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Table rules' })).not.toBeInTheDocument();
    await referee.user.click(screen.getByRole('menuitem', { name: 'Table settings' }));
    expect(await screen.findByRole('dialog', { name: 'Table settings' })).toBeInTheDocument();
  });

  it('says so when the connection drops, without unmounting the table', () => {
    renderWithTable(<PlayShell />, { data: { status: 'reconnecting' } });
    expect(screen.getByText('Connection lost. Reconnecting to the table.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thursday at the Drowned Bell' })).toBeInTheDocument();
  });
});

describe('PlayShell overlays', () => {
  it('closes the open rules reference with B', () => {
    renderWithTable(
      <>
        <PlayShell />
        <ShortcutLayer />
      </>,
    );
    act(() => useTableUi.getState().openCompendium({ kind: 'spells', id: 'sleep' }));
    fireEvent.keyDown(document.body, { key: 'b', code: 'KeyB' });
    expect(useTableUi.getState()).toMatchObject({ compendiumOpen: false, compendiumEntry: null });
    fireEvent.keyDown(document.body, { key: 'b', code: 'KeyB' });
    expect(useTableUi.getState()).toMatchObject({ compendiumOpen: true, compendiumEntry: null });
  });

  it('shows the after-fight slot after a fight and clears it when the next one starts', () => {
    renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('exploring', 'player') });
    act(() => useCombatStage.getState().showAftermath(<p>The goblins are beaten.</p>));
    expect(screen.getByText('The goblins are beaten.')).toBeInTheDocument();
    act(() => useCombatStage.getState().closeAftermath());
    expect(screen.queryByText('The goblins are beaten.')).not.toBeInTheDocument();
  });

  it('empties the after-fight slot when a fight is on', () => {
    useCombatStage.getState().showAftermath(<p>The goblins are beaten.</p>);
    renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('encounter', 'player') });
    expect(screen.queryByText('The goblins are beaten.')).not.toBeInTheDocument();
    expect(useCombatStage.getState().aftermath).toBeNull();
  });
});

describe('PlayShell at the end of a game', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function endTheGame() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const result = renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('battle', 'player') });
    const game = result.store.getState().game;
    if (!game) throw new Error('The fixture has no game.');
    return {
      ...result,
      end: () => act(() => result.store.setState({ game: { ...game, mode: 'game_over' } })),
    };
  }

  it('waits briefly for the last round to play before it shows the end screen', () => {
    const { end } = endTheGame();
    end();
    expect(screen.getByRole('region', { name: /^Battle, round/ })).toBeInTheDocument();
    expect(screen.queryByText('The party has fallen')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(END_GRACE_MS));
    expect(screen.getByText('The party has fallen')).toBeInTheDocument();
  });

  it('holds the end screen while combat playback runs, and shows it when playback stops', () => {
    const { end } = endTheGame();
    act(() => useCombatStage.getState().setPlaying(true));
    end();
    act(() => vi.advanceTimersByTime(END_GRACE_MS * 3));
    expect(screen.queryByText('The party has fallen')).not.toBeInTheDocument();
    act(() => useCombatStage.getState().setPlaying(false));
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText('The party has fallen')).toBeInTheDocument();
  });

  it('shows the end screen when a running playback stops reporting new beats', () => {
    const { end } = endTheGame();
    act(() => useCombatStage.getState().setPlaying(true));
    end();
    act(() => vi.advanceTimersByTime(END_STALL_MS));
    expect(screen.getByText('The party has fallen')).toBeInTheDocument();
  });

  it('holds the end screen as long as new beats arrive, past the limit in all', () => {
    const { end } = endTheGame();
    act(() => useCombatStage.getState().setPlaying(true));
    end();
    for (let beat = 0; beat < 4; beat += 1) {
      act(() => useCombatStage.getState().setProgress(`12-${beat}`, false));
      act(() => vi.advanceTimersByTime(END_STALL_MS - 1000));
    }
    expect(screen.queryByText('The party has fallen')).not.toBeInTheDocument();
    act(() => useCombatStage.getState().setPlaying(false));
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText('The party has fallen')).toBeInTheDocument();
  });

  it('holds the end screen while the viewer is paused on the last round, until they skip', () => {
    const { end } = endTheGame();
    act(() => useCombatStage.getState().setPlaying(true));
    act(() => useCombatStage.getState().setProgress('12-2', true));
    end();
    act(() => vi.advanceTimersByTime(END_STALL_MS * 10));
    expect(screen.queryByText('The party has fallen')).not.toBeInTheDocument();
    // Skipping ends the playback, and the end screen follows.
    act(() => useCombatStage.getState().setPlaying(false));
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText('The party has fallen')).toBeInTheDocument();
  });
});

describe('PlayShell sheet', () => {
  it('opens a member sheet at the tab the caller names', async () => {
    const { snapshot } = renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('exploring', 'player') });
    const member = snapshot.game?.view.party[0];
    if (!member) throw new Error('The fixture has no party.');
    act(() => useTableUi.getState().openCharacterSheet(member.id, 'inventory'));
    expect(await screen.findByRole('tab', { name: 'Inventory' })).toHaveAttribute('aria-selected', 'true');
  });
});
