import type { SuppliesView } from '@bxvtt/shared/bxapi';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { PartySupplies, TopBarSupplies, foodBadge, lightBadge, lightTime } from './Supplies';

/** A new party's supplies in the priory: six torches, no tinder box, and no rations. */
function supplies(fields: Partial<SuppliesView> = {}): SuppliesView {
  return {
    light_burning_rounds: 0,
    light_permanent: false,
    light_reserve_rounds: 2160,
    light_reserve_usable: false,
    torches: 6,
    oil_flasks: 0,
    lanterns: 0,
    rations: 0,
    rations_standard: 0,
    rations_iron: 0,
    food_days: 0,
    food_days_shared: 0,
    food_short_first_ids: [],
    ...fields,
  };
}

const party = [
  { id: 'character-0001', name: 'Flarg', conditions: [] },
  { id: 'character-0002', name: 'Tinks', conditions: [] },
  { id: 'character-0003', name: 'Clarence', conditions: [] },
];

describe('light left', () => {
  it('reads in hours from one hour, turns from one turn, and rounds below that', () => {
    expect(lightTime(2160)).toBe('6 hours');
    expect(lightTime(400)).toBe('1 hour');
    expect(lightTime(359)).toBe('5 turns');
    expect(lightTime(60)).toBe('1 turn');
    expect(lightTime(59)).toBe('59 rounds');
    expect(lightTime(0)).toBe('none');
  });

  it("warns when the party can't light its spare torches, and leaves them out of the total", () => {
    expect(lightBadge(supplies())).toEqual({
      text: 'No light',
      tone: 'danger',
      tooltip: 'Burning now: none. No one can light the spare torches and oil now',
    });
    expect(lightBadge(supplies({ light_burning_rounds: 360 }))).toMatchObject({
      text: '1 hour',
      tone: 'warning',
    });
  });

  it('adds the reserve the party can light, and grows urgent as the total falls', () => {
    expect(lightBadge(supplies({ light_reserve_usable: true }))).toEqual({
      text: '6 hours',
      tone: 'neutral',
      tooltip: 'Burning now: none. Spare torches and oil: 6 hours',
    });
    const low = supplies({ light_reserve_usable: true, light_reserve_rounds: 0, light_burning_rounds: 90 });
    expect(lightBadge(low)).toMatchObject({ text: '1 turn', tone: 'warning' });
    expect(lightBadge(supplies({ light_permanent: true }))).toMatchObject({
      text: 'Permanent',
      tone: 'neutral',
    });
  });
});

describe('food left', () => {
  it('says when no one carries rations', () => {
    expect(foodBadge(supplies(), party)).toEqual({
      text: 'No food',
      tone: 'danger',
      tooltip: 'No one in the party carries rations',
    });
  });

  it('names who carries none, and how long the rations last shared out', () => {
    const one = supplies({
      rations: 7,
      food_days: 0,
      food_days_shared: 2,
      food_short_first_ids: ['character-0001', 'character-0003'],
    });
    expect(foodBadge(one, party)).toEqual({
      text: '0 days',
      tone: 'danger',
      tooltip: 'Flarg and Clarence carry no rations. Shared out, the rations last 2 days',
    });
  });

  it('names who runs out first, or says everyone does together', () => {
    const uneven = supplies({
      rations: 7,
      food_days: 1,
      food_days_shared: 2,
      food_short_first_ids: ['character-0002'],
    });
    expect(foodBadge(uneven, party)).toEqual({
      text: '1 day',
      tone: 'warning',
      tooltip: 'Food for 1 day. Tinks runs out first. Shared out, the rations last 2 days',
    });
    const even = supplies({
      rations: 9,
      food_days: 3,
      food_days_shared: 3,
      food_short_first_ids: ['character-0001', 'character-0002', 'character-0003'],
    });
    expect(foodBadge(even, party)).toEqual({
      text: '3 days',
      tone: 'neutral',
      tooltip: 'Food for 3 days. Everyone runs out together',
    });
  });
});

describe('the supply badges', () => {
  function render(value: SuppliesView | null, mode = 'exploring') {
    const snapshot = fixtureSnapshot('exploring', 'player');
    if (snapshot.game === null) throw new Error('The fixture has no game.');
    snapshot.game.view = { ...snapshot.game.view, supplies: value, mode } as typeof snapshot.game.view;
    return renderWithTable(
      <>
        <TopBarSupplies />
        <PartySupplies />
      </>,
      { snapshot },
    );
  }

  it('names each badge for a screen reader', () => {
    render(supplies({ light_reserve_usable: true }));
    expect(screen.getAllByText('Light left:')[0]?.parentElement).toHaveTextContent('Light left: 6 hours');
    expect(screen.getAllByText('Food left:')[0]?.parentElement).toHaveTextContent('Food left: No food');
  });

  it('shows nothing for a stored view without supplies', () => {
    render(null);
    expect(screen.queryByText('Light left:')).toBeNull();
    expect(screen.queryByText('Supplies')).toBeNull();
  });

  it('shows nothing once the game has ended', () => {
    render(supplies(), 'victory');
    expect(screen.queryByText('Food left:')).toBeNull();
  });
});
