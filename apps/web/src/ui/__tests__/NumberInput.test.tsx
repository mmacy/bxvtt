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
});
