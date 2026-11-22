import './cleanup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Field } from '../components/Field';
import { NumberInput } from '../components/NumberInput';

function Arrows() {
  const [value, setValue] = useState<number | null>(5);
  return (
    <Field label="Arrows" hint="Up to 20">
      <NumberInput value={value} onChange={setValue} min={0} max={20} />
    </Field>
  );
}

describe('NumberInput', () => {
  it('steps with the arrow keys and clamps to the limits', async () => {
    const user = userEvent.setup();
    render(<Arrows />);
    const input = screen.getByRole('spinbutton', { name: 'Arrows' });
    expect(input).toHaveAccessibleDescription('Up to 20');
    await user.click(input);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(input).toHaveValue('7');
    await user.keyboard('{End}');
    expect(input).toHaveValue('20');
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('20');
    await user.keyboard('{PageDown}{PageDown}{PageDown}');
    expect(input).toHaveValue('0');
  });

  it('clamps a typed value when the field loses focus', async () => {
    const user = userEvent.setup();
    render(<Arrows />);
    const input = screen.getByRole('spinbutton', { name: 'Arrows' });
    await user.clear(input);
    await user.type(input, '99');
    await user.tab();
    expect(input).toHaveValue('20');
    expect(input).toHaveAttribute('aria-valuenow', '20');
  });

  it('names its step buttons after the field', () => {
    render(<Arrows />);
    expect(screen.getByRole('button', { name: 'Increase Arrows' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease Arrows' })).toBeInTheDocument();
  });

  it('names its step buttons after its own label outside a field, or as the caller says', () => {
    render(
      <>
        <NumberInput value={3} onChange={() => {}} aria-label="Torches" />
        <NumberInput value={1} onChange={() => {}} aria-label="Rope" incrementLabel="One more rope" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Increase Torches' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'One more rope' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease Rope' })).toBeInTheDocument();
  });
});
