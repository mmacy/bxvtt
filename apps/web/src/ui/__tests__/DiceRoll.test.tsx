import './cleanup';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitProvider } from '../components/KitProvider';
import { DICE_ROLL_MAX_MS, DiceRoll, formatDiceFormula } from '../dice/DiceRoll';

function shownValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-value]')).map(
    (el) => el.getAttribute('data-value') ?? '',
  );
}

describe('DiceRoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lands on the results the server supplied, within the time budget', () => {
    const onSettled = vi.fn();
    const { container } = render(
      <DiceRoll
        label="Strength"
        dice={[
          { sides: 6, value: 4 },
          { sides: 6, value: 2 },
          { sides: 6, value: 6 },
        ]}
        onSettled={onSettled}
      />,
    );
    expect(screen.getByRole('group', { name: 'Strength roll' })).toHaveAttribute('aria-busy', 'true');
    expect(onSettled).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(DICE_ROLL_MAX_MS));
    expect(shownValues(container)).toEqual(['4', '2', '6']);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group', { name: 'Strength roll' })).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('Strength: rolled 4, 2, and 6 on 3d6, total 12.')).toBeInTheDocument();
    expect(DICE_ROLL_MAX_MS).toBeLessThanOrEqual(1200);
  });

  it('lands at once when the user skips', () => {
    const { container } = render(<DiceRoll dice={[{ sides: 20, value: 17 }]} modifier={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(shownValues(container)).toEqual(['17']);
    expect(screen.getByText('rolled 17 on 1d20 + 1, total 18.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  });

  it('shows the result immediately when animation is off', () => {
    const onSettled = vi.fn();
    const { container } = render(
      <DiceRoll
        dice={[{ sides: 8, value: 3 }]}
        total={5}
        animate={false}
        label="Damage"
        onSettled={onSettled}
      />,
    );
    expect(shownValues(container)).toEqual(['3']);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Damage: rolled 3 on 1d8, total 5.')).toBeInTheDocument();
  });

  it('marks a dropped die, leaves it out of the total, and names it in the announcement', () => {
    const { container } = render(
      <DiceRoll
        label="Strength"
        dice={[
          { sides: 6, value: 5 },
          { sides: 6, value: 4 },
          { sides: 6, value: 3 },
          { sides: 6, value: 1, dropped: true },
        ]}
        animate={false}
      />,
    );
    expect(shownValues(container)).toEqual(['5', '4', '3', '1']);
    const marked = Array.from(container.querySelectorAll('[data-dropped]')).map((el) =>
      el.getAttribute('data-value'),
    );
    expect(marked).toEqual(['1']);
    expect(screen.getByText('4d6')).toBeInTheDocument();
    expect(
      screen.getByText('Strength: rolled 5, 4, 3, and 1 on 4d6 and dropped the 1, total 12.'),
    ).toBeInTheDocument();
  });

  it('keeps rolling when the parent re-renders with a new array of the same dice', () => {
    const { container, rerender } = render(<DiceRoll dice={[{ sides: 6, value: 5 }]} />);
    act(() => vi.advanceTimersByTime(200));
    rerender(<DiceRoll dice={[{ sides: 6, value: 5 }]} />);
    act(() => vi.advanceTimersByTime(DICE_ROLL_MAX_MS));
    expect(shownValues(container)).toEqual(['5']);
  });
});

describe('DiceRoll for a caller that names rolls itself', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('can stay silent and drop its header and Skip button', () => {
    const { container } = render(
      <DiceRoll label="Attack" dice={[{ sides: 20, value: 12 }]} announce={false} hideHeader hideSkip />,
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(screen.queryByText('1d20')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(DICE_ROLL_MAX_MS));
    expect(shownValues(container)).toEqual(['12']);
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('shows the result at once when the app asks for reduced motion', () => {
    const onSettled = vi.fn();
    render(
      <KitProvider reducedMotion>
        <DiceRoll label="Strength" dice={[{ sides: 6, value: 4 }]} onSettled={onSettled} />
      </KitProvider>,
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduce');
  });

  it('lets its own prop override the app setting', () => {
    render(
      <KitProvider reducedMotion>
        <DiceRoll dice={[{ sides: 6, value: 4 }]} reducedMotion={false} />
      </KitProvider>,
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });
});

describe('formatDiceFormula', () => {
  it('groups dice by size and appends the modifier', () => {
    expect(
      formatDiceFormula(
        [
          { sides: 6, value: 1 },
          { sides: 6, value: 2 },
          { sides: 4, value: 3 },
        ],
        -1,
      ),
    ).toBe('2d6 + 1d4 − 1');
    expect(formatDiceFormula([{ sides: 100, value: 42 }])).toBe('1d%');
  });
});
