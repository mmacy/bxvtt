import './cleanup';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BadgePopover } from '../components/Badge';
import { Checkbox, Switch } from '../components/Choice';
import { KitProvider } from '../components/KitProvider';
import { LinkButton } from '../components/Link';
import { NumberInput } from '../components/NumberInput';
import { Select } from '../components/Select';
import { Textarea } from '../components/TextInput';

describe('Textarea', () => {
  it('starts at the rows it asks for', () => {
    render(<Textarea aria-label="Message" minRows={1} />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('rows', '1');
  });

  it('grows with its text up to its most rows, and then scrolls', async () => {
    const user = userEvent.setup();
    function Composer() {
      const [text, setText] = useState('');
      return (
        <Textarea
          aria-label="Message"
          minRows={1}
          autoGrow
          maxRows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          style={{ lineHeight: '20px', paddingTop: '4px', paddingBottom: '4px' }}
        />
      );
    }
    render(<Composer />);
    const box = screen.getByRole('textbox', { name: 'Message' });
    // jsdom has no layout, so the content height follows the number of lines typed.
    Object.defineProperty(box, 'scrollHeight', {
      configurable: true,
      get: () => (box as HTMLTextAreaElement).value.split('\n').length * 20 + 8,
    });
    await user.type(box, 'Wren listens');
    expect(box.style.height).toBe('28px');
    expect(box.style.overflowY).toBe('hidden');
    await user.type(box, '{Shift>}{Enter}{/Shift}at the door');
    expect(box.style.height).toBe('48px');
    await user.type(box, '{Shift>}{Enter}{/Shift}and{Shift>}{Enter}{/Shift}hears water');
    expect(box.style.height).toBe('68px');
    expect(box.style.overflowY).toBe('auto');
  });
});

describe('LinkButton', () => {
  it('is a button that reads as a link', () => {
    const onClick = vi.fn();
    render(
      <p>
        Cast <LinkButton onClick={onClick}>sleep</LinkButton> on the goblins.
      </p>,
    );
    const link = screen.getByRole('button', { name: 'sleep' });
    expect(link).toHaveAttribute('type', 'button');
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('read-only choices', () => {
  it('report aria-readonly, stay in the tab order, and never change', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    const onCheck = vi.fn();
    render(
      <>
        <Switch
          label="Hit die reroll"
          description="Rolls again on a 1 or 2."
          checked
          readOnly
          onCheckedChange={onSwitch}
        />
        <Checkbox label="Unlimited" checked={false} readOnly onCheckedChange={onCheck} />
      </>,
    );
    const toggle = screen.getByRole('switch', { name: 'Hit die reroll' });
    expect(toggle).toHaveAttribute('aria-readonly', 'true');
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    await user.click(screen.getByText('Hit die reroll'));
    expect(toggle).toBeChecked();
    const box = screen.getByRole('checkbox', { name: 'Unlimited' });
    // The switch has focus after the click, and Tab reaches the box next.
    await user.tab();
    expect(box).toHaveFocus();
    await user.keyboard(' ');
    expect(box).not.toBeChecked();
    expect(onSwitch).not.toHaveBeenCalled();
    expect(onCheck).not.toHaveBeenCalled();
  });
});

describe('BadgePopover', () => {
  it('opens the reason on a click, named for what it reveals', async () => {
    const user = userEvent.setup();
    render(
      <KitProvider>
        <BadgePopover
          tone="info"
          buttonLabel="Other table: show why"
          popoverLabel="Other table"
          content="Rolled elsewhere."
        >
          Other table
        </BadgePopover>
      </KitProvider>,
    );
    expect(screen.queryByText('Rolled elsewhere.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Other table: show why' }));
    expect(await screen.findByRole('dialog', { name: 'Other table' })).toHaveTextContent('Rolled elsewhere.');
  });
});

describe('read-only values', () => {
  it('keep a select closed and its value unchanged', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        aria-label="Encumbrance"
        value="basic"
        readOnly
        onValueChange={onValueChange}
        options={[
          { value: 'none', label: 'None' },
          { value: 'basic', label: 'Basic' },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Encumbrance' });
    expect(trigger).toHaveAttribute('aria-readonly', 'true');
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
    trigger.focus();
    await user.keyboard('n');
    await user.keyboard('{ArrowDown}');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(trigger).toHaveTextContent('Basic');
  });

  it('keep a number field from stepping or taking typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberInput aria-label="Rerolls" value={2} readOnly onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Rerolls' });
    expect(input).toHaveAttribute('aria-readonly', 'true');
    await user.click(input);
    await user.keyboard('{ArrowUp}5{Enter}');
    expect(screen.getByRole('button', { name: 'Increase Rerolls' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('2');
  });
});
