import './cleanup';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { TextInput } from '../components/TextInput';

function RenameDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Rename table</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Rename table"
        description="Everyone at the table sees the new name."
        footer={<Button variant="primary">Rename</Button>}
      >
        <TextInput aria-label="Table name" defaultValue="Thursday" />
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('moves focus inside, keeps Tab inside, and returns focus on Escape', async () => {
    const user = userEvent.setup();
    render(<RenameDialog />);
    const trigger = screen.getByRole('button', { name: 'Rename table' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Rename table' });
    expect(dialog).toHaveAccessibleDescription('Everyone at the table sees the new name.');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    // Tab through every control twice; focus never leaves the dialog.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Radix returns focus on the next tick after the dialog unmounts.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    render(<RenameDialog />);
    await user.click(screen.getByRole('button', { name: 'Rename table' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('starts on cancel, and confirming runs the action and closes', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<Button>Restore save</Button>}
        title="Restore the save?"
        description="Anything after the save is lost."
        confirmLabel="Restore save"
        tone="danger"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Restore save' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Restore the save?' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(
      screen.getAllByRole('button', { name: 'Restore save' }).find((b) => dialog.contains(b)) as HTMLElement,
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
