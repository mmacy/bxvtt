import './cleanup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { List, ListItem } from '../components/List';

const REASON = 'Only Ruth, who plays Osric, can have Osric turn undead.';

function Turners({ onValueChange }: { onValueChange: (value: string) => void }) {
  return (
    <List aria-label="Choose who turns undead" onValueChange={onValueChange}>
      <ListItem value="brenna" title="Brenna" />
      <ListItem value="osric" title="Osric" disabled disabledReason={REASON} />
      <ListItem value="tamsin" title="Tamsin" disabled />
      <ListItem value="wren" title="Wren" />
    </List>
  );
}

describe('ListItem', () => {
  it('shows an unavailable item’s reason under its label, as its description and not its name', () => {
    render(<Turners onValueChange={() => {}} />);
    const osric = screen.getByRole('option', { name: 'Osric' });
    expect(osric).toHaveAttribute('aria-disabled', 'true');
    expect(osric).toHaveAccessibleDescription(REASON);
    expect(screen.getByText(REASON)).toBeVisible();
  });

  it('keeps an item with a reason reachable by the arrow keys and ignores choosing it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Turners onValueChange={onValueChange} />);
    await user.tab();
    expect(screen.getByRole('option', { name: 'Brenna' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    const osric = screen.getByRole('option', { name: 'Osric' });
    expect(osric).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(osric);
    expect(onValueChange).not.toHaveBeenCalled();
    // A disabled item without a reason is skipped, as before.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Wren' })).toHaveFocus();
    expect(screen.getByRole('option', { name: 'Tamsin' })).not.toHaveAccessibleDescription();
  });
});
