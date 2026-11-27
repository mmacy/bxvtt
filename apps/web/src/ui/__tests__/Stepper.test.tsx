import './cleanup';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stepper } from '../components/Stepper';

describe('Stepper', () => {
  it('keeps the current label in the step a screen reader reads, with no tooltip copy of it', () => {
    render(
      <Stepper
        aria-label="Character creation"
        current={1}
        steps={[
          { id: 'roll', label: 'Roll abilities' },
          { id: 'identity', label: 'Alignment and languages' },
          { id: 'review', label: 'Review' },
        ]}
      />,
    );
    // A narrow stepper hides the label visually instead of cutting it short, so the text stays in the step.
    const current = screen.getByText('Alignment and languages');
    expect(current.closest('[aria-current="step"]')).toHaveTextContent('Alignment and languages');
    expect(current).not.toHaveAttribute('title');
  });
});
