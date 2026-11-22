import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { DungeonMap, type DungeonMapHandle } from './DungeonMap';
import { fixture } from './fixtures/fixtures';
import { fromPlayerView, fromReferee } from './model';

describe('DungeonMap', () => {
  it('renders a focusable map with an accessible name and the party status', () => {
    const map = fromPlayerView(fixture('showcase-explored').view);
    render(<DungeonMap map={map} ariaLabel="Party map" />);
    const canvas = screen.getByRole('application', { name: 'Party map' });
    expect(canvas).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('The party is at 16, 15, facing south.')).toBeInTheDocument();
  });

  it('exposes an imperative handle that works without a canvas context', () => {
    const ref = createRef<DungeonMapHandle>();
    render(<DungeonMap ref={ref} map={null} />);
    expect(ref.current?.getCamera().zoom).toBeGreaterThan(0);
    expect(() => {
      ref.current?.zoomIn();
      ref.current?.fitToExplored();
      ref.current?.centerOnParty();
    }).not.toThrow();
  });

  it('shows the wandering monster chip on a referee map only', () => {
    const { rerender } = render(<DungeonMap map={fromReferee(fixture('hills').referee)} />);
    expect(screen.getByText(/Wandering monsters: 1 in 6 every 2 turns, level table/)).toBeInTheDocument();
    rerender(<DungeonMap map={fromPlayerView(fixture('hills').view)} />);
    expect(screen.queryByText(/Wandering monsters/)).toBeNull();
  });

  it('leaves positioning to the caller', () => {
    const { container } = render(
      <DungeonMap map={null} className="stage-map" style={{ position: 'absolute', inset: 0 }} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('stage-map');
    expect(root.style.position).toBe('absolute');
    const { container: plain } = render(<DungeonMap map={null} className="stage-map" />);
    // The map's own default lives in a rule with no specificity, so the caller's class wins.
    expect((plain.firstElementChild as HTMLElement).style.position).toBe('');
  });

  it('keeps the empty tooltip hidden, so it never needs a name', () => {
    render(<DungeonMap map={fromPlayerView(fixture('showcase-explored').view)} />);
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    expect(tooltip).not.toBeVisible();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('gives the canvas the class that draws its keyboard focus ring', () => {
    render(<DungeonMap map={null} />);
    const canvas = screen.getByRole('application', { name: 'Dungeon map' });
    expect(canvas.className).toMatch(/canvas/);
  });
});
