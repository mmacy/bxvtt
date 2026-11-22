import './cleanup';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../components/Button';
import { Combobox, type ComboboxOption } from '../components/Combobox';
import { Dialog, Drawer } from '../components/Dialog';
import { Field } from '../components/Field';
import { DropdownMenu } from '../components/Menu';

const monsters: ComboboxOption[] = [
  { value: 'goblin', label: 'Goblin' },
  { value: 'hobgoblin', label: 'Hobgoblin' },
  { value: 'orc', label: 'Orc' },
];

function Popups({ onAdd }: { onAdd: () => void }) {
  const [monster, setMonster] = useState<string | null>(null);
  return (
    <>
      <DropdownMenu
        trigger={<Button>Monster actions</Button>}
        items={[{ label: 'Add to the encounter', onSelect: onAdd }]}
      />
      <Field label="Monster">
        <Combobox options={monsters} value={monster} onChange={setMonster} />
      </Field>
    </>
  );
}

describe('Popups inside overlays', () => {
  it('opens a menu inside a dialog and runs its item, and the dialog stays open', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <Dialog defaultOpen title="Add a monster">
        <Popups onAdd={onAdd} />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Add a monster' });
    await user.click(within(dialog).getByRole('button', { name: 'Monster actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Add to the encounter' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: 'Add a monster' })).toBeInTheDocument();
  });

  it('opens a combobox list outside the dialog body, so the body cannot clip it', async () => {
    const user = userEvent.setup();
    render(
      <Dialog defaultOpen title="Add a monster">
        <Popups onAdd={() => {}} />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Add a monster' });
    const input = within(dialog).getByRole('combobox', { name: 'Monster' });
    await user.type(input, 'gob');
    const list = screen.getByRole('listbox');
    expect(dialog).not.toContainElement(list);
    expect(input).toHaveAttribute('aria-controls', list.id);
    expect(input).toHaveFocus();
    await user.click(screen.getByRole('option', { name: 'Hobgoblin' }));
    expect(input).toHaveValue('Hobgoblin');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Add a monster' })).toBeInTheDocument();
  });

  it('closes an open combobox list with Escape before the drawer around it', async () => {
    const user = userEvent.setup();
    render(
      <Drawer defaultOpen title="Encounter builder" dimmed={false}>
        <Popups onAdd={() => {}} />
      </Drawer>,
    );
    await user.type(screen.getByRole('combobox', { name: 'Monster' }), 'o');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Encounter builder' })).toBeInTheDocument();
  });

  it('stacks every portaled layer on one level, with toasts and tooltips above', () => {
    // Layers that share a level stack in the order they open, so a menu opened in a dialog lies above it. A
    // dropdown below the overlay level was the bug: it opened behind the dialog.
    const tokensCss = readFileSync(join(import.meta.dirname, '..', 'tokens.css'), 'utf8');
    const value = (name: string) => tokensCss.match(new RegExp(`--z-${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(value('layer')).toBe('1200');
    for (const name of ['dropdown', 'overlay', 'modal', 'popover'])
      expect(value(name)).toBe('var(--z-layer)');
    expect(Number(value('toast'))).toBeGreaterThan(1200);
    expect(Number(value('tooltip'))).toBeGreaterThan(Number(value('toast')));
  });

  it('returns focus to the menu button after a dialog that a menu item opened closes', async () => {
    const user = userEvent.setup();
    function TableMenu() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu
            trigger={<Button>Table menu</Button>}
            items={[{ label: 'Table settings', onSelect: () => setOpen(true) }]}
          />
          <Dialog open={open} onOpenChange={setOpen} title="Table settings">
            <Button>Save settings</Button>
          </Dialog>
        </>
      );
    }
    render(<TableMenu />);
    await user.click(screen.getByRole('button', { name: 'Table menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Table settings' }));
    expect(await screen.findByRole('dialog', { name: 'Table settings' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Table menu' })).toHaveFocus());
  });
});
