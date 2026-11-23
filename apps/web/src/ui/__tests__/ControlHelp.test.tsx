import './cleanup';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from '../components/Button';
import { SegmentedControl } from '../components/Choice';
import { LinkButton } from '../components/Link';
import { DropdownMenu } from '../components/Menu';
import { CommandPalette } from '../components/CommandPalette';
import { Dialog } from '../components/Dialog';
import { Popover, Tooltip } from '../components/Popover';
import { Tabs, TabsList, TabsTrigger } from '../components/Tabs';
import { ActionBar, ActionBarMenu } from '../layout/ActionBar';
import { ToolRail, ToolRailButton } from '../layout/TableLayout';

const REASON = 'Add at least one character to the party to start the game.';

describe('tooltips on kit controls', () => {
  it('shows an icon button its label on hover, without changing its name', async () => {
    const user = userEvent.setup();
    render(<IconButton icon="settings" label="Table settings" />);
    const button = screen.getByRole('button', { name: 'Table settings' });
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Table settings');
    // The tooltip repeats the name, so it isn't a description too.
    expect(button).not.toHaveAccessibleDescription();
  });

  it('shows a tooltip on keyboard focus, with the shortcut', async () => {
    const user = userEvent.setup();
    render(
      <ToolRail aria-label="Map tools">
        <ToolRailButton icon="ping" label="Ping" shortcut="P" />
      </ToolRail>,
    );
    await user.tab();
    const button = screen.getByRole('button', { name: 'Ping' });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-keyshortcuts', 'P');
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Ping');
    expect(tip.parentElement?.querySelector('[data-key="P"], kbd')).not.toBeNull();
  });

  it('describes a control with a tooltip that adds to its label', async () => {
    const user = userEvent.setup();
    render(
      <Button tooltip="Search the room for secret doors and traps (1 turn)" shortcut="S">
        Search
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Search' });
    expect(button).toHaveAccessibleDescription('Search the room for secret doors and traps (1 turn)');
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Search the room for secret doors and traps (1 turn)');
    // One description, from the kit, not a second one from the open tooltip.
    expect(button.getAttribute('aria-describedby')?.split(' ')).toHaveLength(1);
  });

  it('keeps an icon button tooltip that says more as a description', () => {
    render(
      <IconButton icon="hourglass" label="Advance time" tooltip="Advance time by 1 turn (10 minutes)" />,
    );
    expect(screen.getByRole('button', { name: 'Advance time' })).toHaveAccessibleDescription(
      'Advance time by 1 turn (10 minutes)',
    );
  });

  it('gives a text button no tooltip when its label shows in full', async () => {
    const user = userEvent.setup();
    render(<Button>Cancel</Button>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows a text button its label when the label is cut off', async () => {
    const user = userEvent.setup();
    render(
      <Button icon="rest" shortcut="R">
        Rest the party
      </Button>,
    );
    const label = screen.getByText('Rest the party');
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 120 });
    Object.defineProperty(label, 'clientWidth', { configurable: true, value: 1 });
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Rest the party');
    expect(screen.getByRole('button', { name: 'Rest the party' })).not.toHaveAccessibleDescription();
  });

  it('lets a wrapping tooltip win, so a control never shows two', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Zoom in on the map" shortcut="+">
        <IconButton icon="plus" label="Zoom in" />
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'Zoom in' }));
    const tips = await screen.findAllByRole('tooltip');
    expect(tips).toHaveLength(1);
    expect(tips[0]).toHaveTextContent('Zoom in on the map');
  });

  it('shows an icon-only tab and segment their labels', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tabs defaultValue="notes">
          <TabsList aria-label="Referee tools">
            <TabsTrigger value="notes" icon="scroll" iconOnly>
              Notes
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <SegmentedControl
          aria-label="Map style"
          value="torchlit"
          onValueChange={() => {}}
          options={[{ value: 'torchlit', label: 'Torchlit map', icon: 'torch', iconOnly: true }]}
        />
      </>,
    );
    const segment = screen.getByRole('radio', { name: 'Torchlit map' });
    expect(segment).not.toHaveAttribute('title');
    await user.hover(screen.getByRole('tab', { name: 'Notes' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Notes');
  });
});

describe('unavailable controls', () => {
  it('stays focusable, announces itself as disabled, and describes its reason', async () => {
    const user = userEvent.setup();
    render(
      <Button variant="primary" disabled disabledReason={REASON}>
        Start game
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Start game' });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(REASON);
    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON);
  });

  it('shows its reason on hover', async () => {
    const user = userEvent.setup();
    render(
      <Button disabled disabledReason={REASON}>
        Start game
      </Button>,
    );
    await user.hover(screen.getByRole('button', { name: 'Start game' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON);
  });

  it('ignores clicks, Enter, and Space, and shows its reason when pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled disabledReason={REASON} onClick={onClick}>
        Start game
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Start game' });
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('names an icon button above its reason', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton
        icon="ping"
        label="Ping"
        disabled
        disabledReason="Only people at the table can ping the map."
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Ping' });
    expect(button).toHaveAccessibleDescription('Only people at the table can ping the map.');
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Ping');
    expect(tip).toHaveTextContent('Only people at the table can ping the map.');
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stays natively disabled without a reason', () => {
    render(<Button disabled>Start game</Button>);
    const button = screen.getByRole('button', { name: 'Start game' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('keeps a submit button from submitting its form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <label>
          Table name
          <input />
        </label>
        <Button type="submit" disabled disabledReason="Enter a table name.">
          Create table
        </Button>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Create table' }));
    await user.type(screen.getByRole('textbox', { name: 'Table name' }), 'Thursday{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps a loading submit button from submitting its form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Create table
        </Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'Create table' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps a menu shut when its trigger is unavailable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={
          <IconButton
            icon="more"
            label="Member actions"
            disabled
            disabledReason="You can't change yourself."
          />
        }
        items={[{ label: 'Make referee', onSelect }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Member actions' });
    await user.click(trigger);
    trigger.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('gives a link button the same unavailable state', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <LinkButton disabled disabledReason="The referee hasn't revealed this monster yet." onClick={onClick}>
        Gnoll
      </LinkButton>,
    );
    const link = screen.getByRole('button', { name: 'Gnoll' });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    await user.click(link);
    expect(onClick).not.toHaveBeenCalled();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      "The referee hasn't revealed this monster yet.",
    );
  });

  it('shows an unavailable menu item its reason and keeps it reachable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button>Member actions</Button>}
        items={[
          {
            label: 'Make player',
            disabled: true,
            disabledReason: 'Make another member a referee first.',
            onSelect,
          },
          { label: 'Remove from table', onSelect: () => {} },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Member actions' }));
    const menu = await screen.findByRole('menu');
    const item = within(menu).getByRole('menuitem', { name: 'Make player' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('Make another member a referee first.');
    expect(within(menu).getByText('Make another member a referee first.')).toBeVisible();
    await user.keyboard('{ArrowDown}');
    expect(item).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows an unavailable action bar menu its reason', async () => {
    const user = userEvent.setup();
    render(
      <ActionBar aria-label="Party actions">
        <ActionBarMenu
          label="Rest"
          icon="rest"
          shortcut="R"
          disabled
          disabledReason="Only the caller can rest the party."
          items={[{ label: 'Rest for a turn' }]}
        />
      </ActionBar>,
    );
    const button = screen.getByRole('button', { name: 'Rest' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Only the caller can rest the party.');
    await user.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Only the caller can rest the party.');
  });
});

describe('tooltips around other triggers', () => {
  it("passes a popover trigger's props through a tooltip", async () => {
    const user = userEvent.setup();
    render(
      <Popover
        title="Your profile"
        trigger={
          <Tooltip content="Change your name and color, or sign out">
            <button type="button">Ruth</button>
          </Tooltip>
        }
      >
        <p>Profile form</p>
      </Popover>,
    );
    const trigger = screen.getByRole('button', { name: 'Ruth' });
    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Change your name and color, or sign out');
    await user.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Your profile' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('stays closed when a menu chosen with the mouse returns focus to its trigger', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<IconButton icon="menu" label="Table menu" />} items={[{ label: 'Saves' }]} />,
    );
    const trigger = screen.getByRole('button', { name: 'Table menu' });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Saves' }));
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays closed when a dialog opened from the keyboard moves focus into itself', async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Keyboard shortcuts</Button>
          <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts">
            <p>Press B for the rules reference.</p>
          </Dialog>
        </>
      );
    }
    render(<Host />);
    await user.tab();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows an unavailable palette action its reason', () => {
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        actions={[
          {
            id: 'seats',
            label: 'Seats and caller',
            disabled: true,
            disabledReason: 'Only a referee can assign seats and choose the caller.',
            onRun: () => {},
          },
        ]}
      />,
    );
    const option = screen.getByRole('option', { name: 'Seats and caller' });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveAccessibleDescription('Only a referee can assign seats and choose the caller.');
  });
});
