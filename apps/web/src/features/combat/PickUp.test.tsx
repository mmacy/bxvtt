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
  it('holds back Take treasure while the party knows of an unsprung trap on the cache', () => {
    renderWithTable(<PickUp />, { snapshot: withChest('found') });
    expect(screen.getByText(/the party knows it is trapped/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take treasure' })).toBeNull();
  });

  it.each(['sprung', 'removed', null] as const)('offers Take treasure when the trap state is %s', (state) => {
    renderWithTable(<PickUp />, { snapshot: withChest(state) });
    expect(screen.getByRole('button', { name: 'Take treasure' })).toBeInTheDocument();
    expect(screen.queryByText(/the party knows it is trapped/)).toBeNull();
  });
});
