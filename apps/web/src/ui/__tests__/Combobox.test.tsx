import './cleanup';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, defaultComboboxFilter, type ComboboxOption } from '../components/Combobox';
import { Field } from '../components/Field';

const spells: ComboboxOption[] = [
  { value: 'cure', label: 'Cure light wounds', description: 'Cleric, level 1' },
  { value: 'sleep', label: 'Sleep', description: 'Magic-user, level 1', keywords: ['mu'] },
  { value: 'missile', label: 'Magic missile', description: 'Magic-user, level 1', keywords: ['mu'] },
  { value: 'shield', label: 'Shield', description: 'Magic-user, level 1', disabled: true },
];

function Picker({ onChange }: { onChange?: (value: string | null) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Field label="Spell">
      <Combobox
        options={spells}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        emptyText="No spell by that name"
      />
    </Field>
  );
}

describe('Combobox', () => {
  it('filters options as the user types', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const input = screen.getByRole('combobox', { name: 'Spell' });
    await user.type(input, 'mag');
    const list = screen.getByRole('listbox');
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['SleepMagic-user, level 1', 'Magic missileMagic-user, level 1', 'ShieldMagic-user, level 1']);

    await user.clear(input);
    await user.type(input, 'missile');
    expect(within(list).getAllByRole('option')).toHaveLength(1);

    await user.clear(input);
    await user.type(input, 'fireball');
    expect(within(list).queryAllByRole('option')).toHaveLength(0);
    expect(list).toHaveTextContent('No spell by that name');
  });

  it('matches keywords and picks the active option with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Spell' });
    await user.type(input, 'mu');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('missile');
    expect(input).toHaveValue('Magic missile');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape and keeps the chosen label', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const input = screen.getByRole('combobox', { name: 'Spell' });
    await user.type(input, 'sle');
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('Sleep');
    await user.type(input, 'x');
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('Sleep');
  });

  it('ignores disabled options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    await user.type(screen.getByRole('combobox', { name: 'Spell' }), 'shield');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('requires every word of the query', () => {
    const missile = spells[2] as ComboboxOption;
    expect(defaultComboboxFilter(missile, 'magic mu')).toBe(true);
    expect(defaultComboboxFilter(missile, 'magic cleric')).toBe(false);
  });
});
