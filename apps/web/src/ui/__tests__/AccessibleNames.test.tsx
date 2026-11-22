import './cleanup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from '../components/Button';
import { Kbd, ariaKeyShortcuts } from '../components/Kbd';
import { DropdownMenu } from '../components/Menu';
import { Popover } from '../components/Popover';
import { CoinPurse } from '../game/StatBlock';
import { ActionBar, ActionBarItem, ActionBarMenu } from '../layout/ActionBar';

describe('key hints inside controls', () => {
  it('keeps a Kbd child out of the button name and text, and names the shortcut', () => {
    render(
      <Button aria-keyshortcuts="o">
        Outfitter
        <Kbd keys="O" />
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Outfitter' });
    expect(button).toHaveTextContent(/^Outfitter$/);
    expect(button).toHaveAttribute('aria-keyshortcuts', 'o');
  });

  it('renders the shortcut prop as a hint and sets aria-keyshortcuts', () => {
    render(<Button shortcut={['Shift', 'R']}>Rest</Button>);
    const button = screen.getByRole('button', { name: 'Rest' });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Shift+R');
    expect(button.querySelector('[data-key="R"]')).not.toBeNull();
    expect(button).toHaveTextContent(/^Rest$/);
  });

  it('names menu item shortcuts without adding them to the item name', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<Button>Table</Button>}
        items={[{ label: 'Save game', shortcut: ['Ctrl', 'S'], onSelect: () => {} }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Table' }));
    const item = screen.getByRole('menuitem', { name: 'Save game' });
    expect(item).toHaveAttribute('aria-keyshortcuts', 'Control+S');
  });

  it('names an action bar menu shortcut', () => {
    render(
      <ActionBar aria-label="Town actions">
        <ActionBarItem>
          <Button shortcut="G">Set out</Button>
        </ActionBarItem>
        <ActionBarMenu
          label="Rest"
          icon="rest"
          shortcut={['Shift', 'R']}
          items={[{ label: 'Rest a night' }]}
        />
      </ActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Set out' })).toHaveAttribute('aria-keyshortcuts', 'G');
    expect(screen.getByRole('button', { name: 'Rest' })).toHaveAttribute('aria-keyshortcuts', 'Shift+R');
  });

  it('keeps a Kbd in running text as text', () => {
    render(
      <p>
        Press <Kbd keys="Esc" /> to close.
      </p>,
    );
    expect(screen.getByText(/Press/)).toHaveTextContent('Press Esc to close.');
  });

  it('maps display keys to aria-keyshortcuts names', () => {
    expect(ariaKeyShortcuts(['Ctrl', 'K'])).toBe('Control+K');
    expect(ariaKeyShortcuts(['⌘', 'K'])).toBe('Meta+K');
    expect(ariaKeyShortcuts('Esc')).toBe('Escape');
    expect(ariaKeyShortcuts('g')).toBe('G');
  });
});

describe('Popover', () => {
  it('names its dialog by its title', async () => {
    const user = userEvent.setup();
    render(
      <Popover title="Who speaks for the party?" trigger={<Button>Talk</Button>}>
        <p>Pick a speaker.</p>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Talk' }));
    expect(screen.getByRole('dialog', { name: 'Who speaks for the party?' })).toBeInTheDocument();
  });

  it('takes a label when it has no title', async () => {
    const user = userEvent.setup();
    render(
      <Popover label="Party light" trigger={<Button>Light</Button>}>
        <p>Wren carries a torch.</p>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(screen.getByRole('dialog', { name: 'Party light' })).toBeInTheDocument();
  });
});

describe('CoinPurse', () => {
  it('reads and copies as amounts and units, without the coin letter', () => {
    render(<CoinPurse coins={{ gp: 70, sp: 5 }} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/^70 gp \(gold\)$/);
    expect(items[1]).toHaveTextContent(/^5 sp \(silver\)$/);
  });
});
