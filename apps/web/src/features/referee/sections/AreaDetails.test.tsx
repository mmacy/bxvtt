import { emptyContext } from '@bxvtt/shared/text';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import bell from '../../../../../../adventures/the-drowned-bell.json';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { asAdventure, findArea, playRecord, type Adventure } from '../model/adventure';
import { AreaDetails } from './AreaDetails';

const adventure = asAdventure(bell.payload as unknown as Record<string, unknown>) as Adventure;

/** The area key for one area of The Drowned Bell, as the referee reads it at the start of the game. */
function renderArea(areaId: string) {
  const found = findArea(adventure, areaId);
  const referee = fixtureSnapshot('exploring', 'referee').game?.referee;
  if (!found || !referee) throw new Error('The fixture lacks the area or the referee state.');
  renderWithTable(
    <AreaDetails
      adventure={adventure}
      dungeonId={found.dungeon.id}
      level={found.level}
      area={found.area}
      record={playRecord(referee)}
      ctx={emptyContext()}
    />,
    { snapshot: fixtureSnapshot('exploring', 'referee') },
  );
}

describe('a feature in the area key', () => {
  it('shows what the players read on parchment and the referee notes in their own block', () => {
    renderArea('chapel');
    const altar = screen.getByText(/Two silver candlesticks stand on the al/).closest('li');
    if (!altar) throw new Error('No feature block for the altar.');
    expect(within(altar).getByText('Players read')).toBeInTheDocument();
    const notes = within(altar).getByRole('region', { name: 'Referee notes' });
    expect(within(notes).getByText('Referee notes')).toBeInTheDocument();
    const written = findArea(adventure, 'chapel')?.area.features.find((f) => f.id === 'chapel_altar');
    expect(written?.referee_notes).not.toBe('');
    expect(within(notes).getByText(written?.referee_notes ?? '')).toBeInTheDocument();
    expect(within(altar).getByText('Still here')).toBeInTheDocument();
  });

  it('shows no referee notes block for a feature without notes', () => {
    renderArea('gatehouse_stair');
    expect(screen.getByText(/The statue is Saint Corvane/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Referee notes' })).toBeNull();
  });
});
