import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot, type Snapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { addFeatureAtParty, addPileAtParty } from '@/app/testing/views';
import { ScenePanel } from '../explore/ScenePanel';
import { PickUp } from './Aftermath';

/** The exploring fixture with a cache in reach on the party's cell, whose trap the party knows in `trapState`. */
function withChest(trapState: 'found' | 'sprung' | 'removed' | null) {
  const snapshot = fixtureSnapshot('exploring', 'player');
  addFeatureAtParty(snapshot, {
    id: 'feature:chest',
    description: 'An iron-bound chest.',
    trap_state: trapState,
  });
  return snapshot;
}

/** Makes Ruth, the referee, the caller, so Sam can't take treasure. */
function notTheCaller(snapshot: Snapshot) {
  const ruth = snapshot.table.members.find((member) => member.role === 'referee');
  if (!ruth) throw new Error('The fixture has no referee.');
  snapshot.table.settings.caller_user_id = ruth.user_id;
  if (snapshot.game) snapshot.game.caller_user_id = ruth.user_id;
}

describe('the aftermath pick-up', () => {
  it('marks a found trap with a badge and lets the party take the treasure anyway', () => {
    renderWithTable(<PickUp />, { snapshot: withChest('found') });
    expect(screen.getByText('Trapped')).toBeInTheDocument();
    expect(screen.queryByText(/Taking it may spring the trap/)).toBeNull();
    const take = screen.getByRole('button', { name: 'Take anyway' });
    // The visible description may be cut off, so the button's description is the full text.
    expect(take).toHaveAccessibleDescription('An iron-bound chest.');
    expect(screen.queryByRole('button', { name: 'Take' })).toBeNull();
  });

  it('shows the whole description once, as the visible text the Take button points at', () => {
    renderWithTable(<PickUp />, { snapshot: withChest('found') });
    const [text, ...copies] = screen.getAllByText('An iron-bound chest.');
    expect(copies).toEqual([]);
    expect(text).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('button', { name: 'Take anyway' })).toHaveAttribute('aria-describedby', text?.id);
  });

  it.each(['sprung', 'removed', null] as const)('offers Take when the trap state is %s', (state) => {
    renderWithTable(<PickUp />, { snapshot: withChest(state) });
    expect(screen.getByRole('button', { name: 'Take' })).toHaveAccessibleDescription('An iron-bound chest.');
    expect(screen.queryByText('Trapped')).toBeNull();
  });

  it('disables Take with the reason for a player who isn’t the caller', () => {
    const snapshot = withChest(null);
    notTheCaller(snapshot);
    renderWithTable(<PickUp />, { snapshot });
    const take = screen.getByRole('button', { name: 'Take' });
    expect(take).toHaveAttribute('aria-disabled', 'true');
  });

  it('says treasure lies here for a rolled treasure with no description, and numbers two of them', () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    addFeatureAtParty(snapshot, { id: 'feature:hoard', kind: 'generated_cache' });
    const one = renderWithTable(<PickUp />, { snapshot });
    expect(screen.getByRole('button', { name: 'Take' })).toHaveAccessibleDescription('Treasure lies here.');
    one.unmount();
    addFeatureAtParty(snapshot, { id: 'feature:hoard-2', kind: 'generated_cache' });
    renderWithTable(<PickUp />, { snapshot });
    const [first, second] = screen.getAllByRole('button', { name: 'Take' });
    expect(first).toHaveAccessibleDescription('Treasure 1 lies here.');
    expect(second).toHaveAccessibleDescription('Treasure 2 lies here.');
  });

  it('numbers a rolled treasure among every cache here, as the scene panel does', () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    addFeatureAtParty(snapshot, { id: 'feature:hoard', kind: 'generated_cache', emptied: true });
    addFeatureAtParty(snapshot, { id: 'feature:hoard-2', kind: 'generated_cache' });
    const aftermath = renderWithTable(<PickUp />, { snapshot });
    expect(screen.getByRole('button', { name: 'Take' })).toHaveAccessibleDescription('Treasure 2 lies here.');
    aftermath.unmount();
    renderWithTable(<ScenePanel />, { snapshot });
    expect(screen.getByRole('button', { name: 'Take' })).toHaveAccessibleDescription('Treasure 2 lies here.');
  });

  it('lists only the caches in reach that the party hasn’t emptied', () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    addFeatureAtParty(snapshot, { id: 'feature:far', description: 'A far chest.' }, { inReach: false });
    addFeatureAtParty(snapshot, { id: 'feature:empty', description: 'An empty chest.', emptied: true });
    renderWithTable(<PickUp />, { snapshot });
    expect(screen.queryByText('A far chest.')).toBeNull();
    expect(screen.queryByText('An empty chest.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take' })).toBeNull();
  });

  it('lists what lies in the dropped goods under the row', () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    addPileAtParty(snapshot, {
      coins: { pp: 0, gp: 0, ep: 0, sp: 12, cp: 0 },
      contents: [{ item_id: 'torch', quantity: 2 }],
    });
    renderWithTable(<PickUp />, { snapshot });
    expect(screen.getByText('Dropped goods lie here.')).toBeInTheDocument();
    expect(screen.getByText('12 silver pieces and 2 torches.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick up' })).toHaveAccessibleDescription(
      '12 silver pieces and 2 torches.',
    );
  });
});
