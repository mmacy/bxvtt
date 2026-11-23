import { useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { Checkbox } from '../components/Choice';
import { Combobox, type ComboboxOption } from '../components/Combobox';
import { ConfirmDialog, Dialog, DialogClose, Drawer } from '../components/Dialog';
import { Field } from '../components/Field';
import { ContextMenu, DropdownMenu, type MenuEntry } from '../components/Menu';
import { Popover } from '../components/Popover';
import { Select } from '../components/Select';
import { toast } from '../components/toastStore';
import { Row, Specimen, Stack } from './parts';
import styles from './Gallery.module.css';

const monsters: ComboboxOption[] = [
  { value: 'goblin', label: 'Goblin', description: 'HD 1−1' },
  { value: 'hobgoblin', label: 'Hobgoblin', description: 'HD 1+1' },
  { value: 'kobold', label: 'Kobold', description: 'HD ½' },
  { value: 'orc', label: 'Orc', description: 'HD 1' },
  { value: 'skeleton', label: 'Skeleton', description: 'HD 1' },
];

const menuItems: MenuEntry[] = [
  { label: 'Add to the encounter', icon: 'plus', onSelect: () => toast.info('Added to the encounter.') },
  { label: 'Show the stat block', icon: 'book', onSelect: () => toast.info('Opened the stat block.') },
  { type: 'separator' },
  {
    type: 'submenu',
    label: 'Reaction',
    items: [
      { label: 'Friendly', onSelect: () => toast.info('The monsters are friendly.') },
      { label: 'Hostile', onSelect: () => toast.info('The monsters attack.') },
    ],
  },
];

/** Every popup kind in one container, so a reviewer can open each one and click it. */
function Popups() {
  const [monster, setMonster] = useState<string | null>(null);
  const [stance, setStance] = useState('wary');
  return (
    <Stack gap="md">
      <Row>
        <DropdownMenu
          trigger={
            <Button variant="secondary" iconEnd="chevron-down">
              Monster actions
            </Button>
          }
          items={menuItems}
        />
        <Popover trigger={<Button variant="secondary">Morale</Button>} title="Morale 8">
          <p className={styles.muted}>Roll 2d6 when the first monster falls.</p>
        </Popover>
        <IconButton icon="dice" label="Roll for surprise" shortcut="S" />
      </Row>
      <ContextMenu items={menuItems}>
        <div className={styles.contextTarget} tabIndex={0}>
          Right-click here, or press Shift and F10
        </div>
      </ContextMenu>
      <Field label="Monster">
        <Combobox options={monsters} value={monster} onChange={setMonster} placeholder="Search monsters" />
      </Field>
      <Field label="Stance">
        <Select
          value={stance}
          onValueChange={setStance}
          options={[
            { value: 'wary', label: 'Wary' },
            { value: 'hostile', label: 'Hostile' },
            { value: 'friendly', label: 'Friendly' },
          ]}
        />
      </Field>
      <Button variant="ghost" onClick={() => toast.success('A toast shows above the dialog.')}>
        Show a toast
      </Button>
    </Stack>
  );
}

/**
 * Menus, comboboxes, selects, popovers, tooltips, and toasts inside a dialog, a drawer, and a nested dialog.
 * Each opens above its container, because every portaled layer stacks in the order it opened.
 */
export function LayersSpecimen() {
  const [nestedOpen, setNestedOpen] = useState(false);
  const [keepSaves, setKeepSaves] = useState(true);
  return (
    <Specimen
      title="Popups inside overlays"
      note="Open a dialog or a drawer, then open each popup inside it. Every popup opens above its container."
    >
      <Row>
        <Dialog
          trigger={<Button variant="secondary">Popups in a dialog</Button>}
          title="Add a monster"
          description="Every popup here opens above the dialog."
          footer={
            <>
              <Button variant="ghost" onClick={() => setNestedOpen(true)}>
                Open a nested dialog
              </Button>
              <DialogClose>
                <Button variant="primary">Done</Button>
              </DialogClose>
            </>
          }
        >
          <Popups />
          <Dialog
            open={nestedOpen}
            onOpenChange={setNestedOpen}
            title="Nested dialog"
            description="It dims the dialog beneath it, and its popups open above both."
            size="sm"
          >
            <Popups />
          </Dialog>
        </Dialog>
        <Drawer
          trigger={<Button variant="secondary">Popups in a drawer</Button>}
          title="Encounter builder"
          description="The page stays in view behind this drawer."
          dimmed={false}
        >
          <Popups />
        </Drawer>
        <ConfirmDialog
          trigger={<Button variant="danger">End the game</Button>}
          title="Return the table to its lobby?"
          description="The game ends for everyone."
          confirmLabel="Return to the lobby"
          tone="danger"
          onConfirm={() => {
            toast.success(keepSaves ? 'Back in the lobby. The saves stay.' : 'Back in the lobby.');
          }}
        >
          <Checkbox
            label="Keep the saves"
            description="You can restore one later."
            checked={keepSaves}
            onCheckedChange={setKeepSaves}
          />
        </ConfirmDialog>
      </Row>
    </Specimen>
  );
}
