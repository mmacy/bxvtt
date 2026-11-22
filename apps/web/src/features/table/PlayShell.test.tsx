import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortcutLayer, useCombatStage, useTableUi } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { PlayShell } from './PlayShell';
import { END_GRACE_MS, END_MAX_HOLD_MS } from './shownMode';

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

  it('never holds the end screen longer than its limit', () => {
    const { end } = endTheGame();
    act(() => useCombatStage.getState().setPlaying(true));
    end();
    act(() => vi.advanceTimersByTime(END_MAX_HOLD_MS));
    expect(screen.getByText('The party has fallen')).toBeInTheDocument();
  });
});
