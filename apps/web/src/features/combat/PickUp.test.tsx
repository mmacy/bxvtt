import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { PickUp } from './Aftermath';

/** The exploring fixture with a cache on the party's cell, whose trap the party knows in `trapState`. */
function withChest(trapState: 'found' | 'sprung' | 'removed' | null) {
  const snapshot = fixtureSnapshot('exploring', 'player');
  const game = snapshot.game;
  const level = game?.view.explored[0];
  const position = game?.view.location.position;
  if (!level || !position) throw new Error('The party is in town.');
  level.features = [
    ...level.features,
    {
      id: 'feature:chest',
      kind: 'treasure_cache',
      description: 'An iron-bound chest.',
      cell: [position[0], position[1]],
      area_id: null,
      trap_state: trapState,
    },
  ];
  return snapshot;
}

describe('the aftermath pick-up', () => {
  it('names a found trap and lets the party take the treasure anyway', () => {
    renderWithTable(<PickUp />, { snapshot: withChest('found') });
    expect(
      screen.getByText('The party found a trap on this. Taking it may spring the trap.'),
    ).toBeInTheDocument();
    const take = screen.getByRole('button', { name: 'Take anyway' });
    // The visible description may be cut off, so the button's description is the full text.
    expect(take).toHaveAccessibleDescription('An iron-bound chest.');
    expect(screen.queryByRole('button', { name: 'Take treasure' })).toBeNull();
  });

  it.each(['sprung', 'removed', null] as const)('offers Take treasure when the trap state is %s', (state) => {
    renderWithTable(<PickUp />, { snapshot: withChest(state) });
    expect(screen.getByRole('button', { name: 'Take treasure' })).toHaveAccessibleDescription(
      'An iron-bound chest.',
    );
    expect(screen.queryByText(/found a trap/)).toBeNull();
  });

  it('says treasure lies here for a rolled treasure with no description', () => {
    const snapshot = withChest(null);
    const chest = snapshot.game?.view.explored[0]?.features.find((f) => f.id === 'feature:chest');
    if (chest) chest.description = '';
    renderWithTable(<PickUp />, { snapshot });
    expect(screen.getByRole('button', { name: 'Take treasure' })).toHaveAccessibleDescription(
      'Treasure lies here.',
    );
  });
});
