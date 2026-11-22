import './cleanup';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LinkButton } from '../components/Link';
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
