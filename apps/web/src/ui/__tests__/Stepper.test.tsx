import './cleanup';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stepper } from '../components/Stepper';

describe('Stepper', () => {
  it('keeps the whole current label for a pointer and a screen reader when a narrow box cuts it short', () => {
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
    const current = screen.getByText('Alignment and languages');
    expect(current).toHaveAttribute('title', 'Alignment and languages');
    expect(current.closest('[aria-current="step"]')).toHaveTextContent('Alignment and languages');
    expect(screen.getByText('Review')).not.toHaveAttribute('title');
  });
});
