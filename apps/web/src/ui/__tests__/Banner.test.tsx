import './cleanup';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Banner } from '../components/Feedback';

describe('Banner', () => {
  it('interrupts with an alert for the warning and danger tones, and waits politely for the rest', () => {
    render(
      <>
        <Banner tone="danger">The connection dropped.</Banner>
        <Banner tone="warning">The torch is nearly out.</Banner>
        <Banner tone="info">Ruth is choosing the adventure.</Banner>
      </>,
    );
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual([
      'The connection dropped.',
      'The torch is nearly out.',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Ruth is choosing the adventure.');
  });

  it('lets a warning wait for a pause, or say nothing until the reader reaches it', () => {
    render(
      <>
        <Banner tone="warning" announce="status">
          Flarg can&apos;t reach the goblins this round.
        </Banner>
        <Banner tone="danger" announce="none">
          Tinks can&apos;t hide in the front rank.
        </Banner>
      </>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent("Flarg can't reach the goblins this round.");
    const quiet = screen.getByText("Tinks can't hide in the front rank.").closest('[class*="banner"]');
    expect(quiet).not.toHaveAttribute('role');
  });
});
