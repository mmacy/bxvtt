import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { PlayShell } from './PlayShell';

describe('PlayShell', () => {
  it("shows the mode, the clock, and the caller in a player's exploring game", () => {
    renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('exploring', 'player') });
    expect(screen.getByRole('heading', { name: 'Thursday at the Drowned Bell' })).toBeInTheDocument();
    expect(screen.getByText('Exploring')).toBeInTheDocument();
    expect(screen.getByText(/^Day 1, /)).toBeInTheDocument();
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
    expect(screen.getByText('Encounter', { selector: 'p' })).toBeInTheDocument();
    unmount();
    renderWithTable(<PlayShell />, { snapshot: fixtureSnapshot('battle', 'player') });
    expect(screen.getByText('Battle', { selector: 'p' })).toBeInTheDocument();
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
